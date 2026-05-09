const ApiError = require('../../shared/http/ApiError');
const { createId } = require('../../shared/utils/ids');
const { now } = require('../../shared/utils/dates');
const userRepository = require('../users/user.repository');
const tournamentRepository = require('./tournament.repository');
const policies = require('./tournament.policies');
const { generateRound, redistributePlayers } = require('./domain/matchmaking');
const { accumulateRoundScores, inferTableResult } = require('./domain/scoring');
const { RANKING_FORMULA_VERSION, calculateRankingDeltas, invertDeltas } = require('./domain/ranking');
const {
  findRound,
  findTable,
  findTablePlayer,
  assertStatus,
  normalizeNonNegativeInt,
} = require('./domain/tournamentState');
const { validateAndRebuildTables, mergePlayerScores } = require('./domain/tableValidation');

const BENCH_ID = 'bench';

async function listTournaments({ query, viewerId } = {}) {
  let tournaments = await tournamentRepository.findAll();
  if (query) {
    const q = String(query).toLowerCase();
    tournaments = tournaments.filter(tournament => tournament.name.toLowerCase().includes(q));
  }
  return tournaments.filter(tournament => policies.canViewTournament(tournament, viewerId));
}

async function getTournament(id, viewerId) {
  const tournament = await loadTournament(id);
  if (!policies.canViewTournament(tournament, viewerId)) {
    throw ApiError.forbidden('No puedes ver este torneo');
  }
  return ensureRankingCurrent(tournament);
}

async function createTournament(data, organizerId) {
  const organizer = await userRepository.findByUid(organizerId);
  if (!organizer) throw ApiError.notFound('Organizador no encontrado');

  return tournamentRepository.createTournament({
    name: data.name,
    organizerId,
    organizerName: organizer.displayName,
    totalRounds: data.totalRounds,
    roundDuration: data.roundDuration,
    status: 'lobby',
    visibility: data.visibility || 'public',
    isRanked: !!(organizer.isLicensed && organizer.role === 'organizer'),
    pairingMethod: data.pairingMethod || 'snake',
    rankingApplied: false,
    rankingFormulaVersion: 0,
    rankingDeltas: [],
    prizes: data.prizes || [],
    players: [],
    joinRequests: [],
    rounds: [],
    currentRound: 0,
  });
}

async function addPlayer(tournamentId, sessionUserId, requestedUserId) {
  const tournament = await loadTournament(tournamentId);
  assertStatus(tournament, ['lobby', 'active'], 'El torneo ya finalizo');

  const requesterIsOrganizer = policies.isOrganizer(tournament, sessionUserId);
  const targetUserId = requesterIsOrganizer ? requestedUserId : sessionUserId;
  const user = await userRepository.findByUid(targetUserId);
  if (!user) throw ApiError.notFound('Jugador no encontrado');

  if (tournament.players.some(player => player.userId === targetUserId)) {
    throw ApiError.conflict('El jugador ya esta en el torneo');
  }

  if (requesterIsOrganizer) {
    if ((user.invitationPolicy || 'manual') === 'auto') {
      addPlayerToTournament(tournament, user);
      return save(tournament);
    }
    createInvitation(tournament, user, sessionUserId);
    await save(tournament);
    return { requested: true, invited: true, message: 'Invitacion enviada. El jugador debe aceptarla.' };
  }

  if (tournament.visibility === 'private') {
    throw ApiError.forbidden('Este torneo es privado');
  }

  if (tournament.visibility === 'approval') {
    const pending = tournament.joinRequests.some(request =>
      request.userId === targetUserId && request.status === 'pending'
    );
    if (pending) throw ApiError.conflict('Ya tienes una solicitud pendiente');

    createJoinRequest(tournament, user);
    await save(tournament);
    return { requested: true, message: 'Solicitud enviada. El organizador debe aceptarla.' };
  }

  addPlayerToTournament(tournament, user);
  return save(tournament);
}

async function removePlayer(tournamentId, organizerId, userId) {
  const tournament = await loadTournamentForOrganizer(tournamentId, organizerId);
  assertStatus(tournament, ['lobby'], 'No se puede quitar jugadores con el torneo activo');
  tournament.players = tournament.players.filter(player => player.userId !== userId);
  return save(tournament);
}

async function setPlayerScore(tournamentId, organizerId, userId, score) {
  const tournament = await loadTournamentForOrganizer(tournamentId, organizerId);
  assertStatus(tournament, ['lobby', 'active', 'review', 'finished'], 'Estado de torneo invalido');
  const player = tournament.players.find(p => p.userId === userId);
  if (!player) throw ApiError.notFound('Jugador no encontrado');
  player.score = normalizeNonNegativeInt(score);
  if (tournament.status === 'finished') await refreshRanking(tournament);
  return save(tournament);
}

async function handleJoinRequest(tournamentId, organizerId, userId, action) {
  const tournament = await loadTournamentForOrganizer(tournamentId, organizerId);
  assertStatus(tournament, ['lobby', 'active'], 'No se pueden modificar solicitudes con el torneo finalizado');
  const request = tournament.joinRequests.find(r => r.userId === userId && r.status === 'pending' && (r.type || 'join') === 'join');
  if (!request) throw ApiError.notFound('Solicitud no encontrada');

  request.status = action === 'accept' ? 'accepted' : 'rejected';

  if (action === 'accept') {
    const user = await userRepository.findByUid(request.userId);
    if (user && !tournament.players.some(player => player.userId === user.uid)) addPlayerToTournament(tournament, user);
  }

  return save(tournament);
}

async function handleInvitation(tournamentId, playerId, action) {
  const tournament = await loadTournament(tournamentId);
  assertStatus(tournament, ['lobby', 'active'], 'No se pueden modificar invitaciones con el torneo finalizado');
  const request = tournament.joinRequests.find(r => r.userId === playerId && r.status === 'pending' && r.type === 'invite');
  if (!request) throw ApiError.notFound('Invitacion no encontrada');

  request.status = action === 'accept' ? 'accepted' : 'rejected';
  if (action === 'accept') {
    const user = await userRepository.findByUid(playerId);
    if (user && !tournament.players.some(player => player.userId === user.uid)) addPlayerToTournament(tournament, user);
  }

  return save(tournament);
}

async function startTournament(tournamentId, organizerId) {
  const tournament = await loadTournamentForOrganizer(tournamentId, organizerId);
  assertStatus(tournament, ['lobby'], 'El torneo ya esta en curso o finalizado');
  const minPlayers = minimumPlayersForTournament(tournament);
  if (tournament.players.length < minPlayers) {
    throw ApiError.badRequest(`Se necesitan al menos ${minPlayers} jugadores`);
  }

  tournament.status = 'active';
  tournament.currentRound = 1;
  const tables = generateRound(tournament.players, 1, tournament.pairingMethod || 'snake');
  for (const table of tables) table.status = 'pending';
  tables.push(createBenchTable([]));
  tournament.rounds.push({
    id: createId(),
    number: 1,
    tables,
    startTime: null,
    endTime: null,
    timeLimitMinutes: tournament.roundDuration,
    pausedAt: null,
    totalPausedMs: 0,
    tableEditingUnlocked: false,
    status: 'pending',
  });

  return save(tournament);
}

async function replaceRoundTables(tournamentId, organizerId, roundId, tables) {
  const tournament = await loadTournamentForOrganizer(tournamentId, organizerId);
  const round = findRound(tournament, roundId);
  assertTablesEditable(round, 'Las mesas estan bloqueadas durante la ronda activa');
  ensureBench(round);
  round.tables = validateAndRebuildTables(round.tables, tables, tournament.players);
  return save(tournament);
}

async function updateTablePlayer(tournamentId, organizerId, roundId, tableId, userId, changes) {
  const tournament = await loadTournamentForOrganizer(tournamentId, organizerId);
  const round = findRound(tournament, roundId);
  assertStatus(round, ['pending', 'active'], 'No se puede modificar una ronda finalizada');
  const table = findTable(round, tableId);
  assertStatus(table, ['pending', 'active'], 'No se puede modificar una mesa finalizada');
  const player = findTablePlayer(table, userId);

  if (changes.score !== undefined) player.score = normalizeNonNegativeInt(changes.score);
  if (changes.eliminated !== undefined) player.eliminated = !!changes.eliminated;

  return save(tournament);
}

async function activateRound(tournamentId, organizerId, roundId) {
  const tournament = await loadTournamentForOrganizer(tournamentId, organizerId);
  const round = findRound(tournament, roundId);
  assertStatus(round, ['pending'], 'La ronda no esta pendiente');

  const startedAt = now();
  round.status = 'active';
  round.startTime = startedAt;
  round.endTime = null;
  round.timeLimitMinutes = normalizeRoundDuration(round.timeLimitMinutes ?? tournament.roundDuration);
  round.pausedAt = null;
  round.totalPausedMs = 0;
  round.tableEditingUnlocked = false;
  for (const table of round.tables) {
    table.status = 'active';
    table.startTime = startedAt;
    table.endTime = null;
  }

  return save(tournament);
}

async function pauseRound(tournamentId, organizerId, roundId) {
  const tournament = await loadTournamentForOrganizer(tournamentId, organizerId);
  const round = findRound(tournament, roundId);
  assertStatus(round, ['active'], 'Solo se puede pausar una ronda activa');
  if (round.pausedAt) throw ApiError.conflict('La ronda ya esta pausada');
  round.pausedAt = now();
  return save(tournament);
}

async function resumeRound(tournamentId, organizerId, roundId) {
  const tournament = await loadTournamentForOrganizer(tournamentId, organizerId);
  const round = findRound(tournament, roundId);
  assertStatus(round, ['active'], 'Solo se puede reanudar una ronda activa');
  if (!round.pausedAt) throw ApiError.conflict('La ronda no esta pausada');
  round.totalPausedMs = (round.totalPausedMs || 0) + Math.max(0, now() - round.pausedAt);
  round.pausedAt = null;
  return save(tournament);
}

async function updateRoundTime(tournamentId, organizerId, roundId, data) {
  const tournament = await loadTournamentForOrganizer(tournamentId, organizerId);
  const round = findRound(tournament, roundId);
  assertStatus(round, ['pending', 'active'], 'Solo se puede modificar el tiempo de una ronda abierta');

  const currentLimit = normalizeRoundDuration(round.timeLimitMinutes ?? tournament.roundDuration);
  const nextLimit = data.timeLimitMinutes !== undefined
    ? data.timeLimitMinutes
    : currentLimit + data.deltaMinutes;

  round.timeLimitMinutes = normalizeRoundDuration(nextLimit);
  if (round.status === 'pending') tournament.roundDuration = round.timeLimitMinutes;
  return save(tournament);
}

async function updateRoundEditing(tournamentId, organizerId, roundId, unlocked) {
  const tournament = await loadTournamentForOrganizer(tournamentId, organizerId);
  const round = findRound(tournament, roundId);
  assertStatus(round, ['active'], 'El bloqueo solo aplica a rondas activas');
  round.tableEditingUnlocked = !!unlocked;
  return save(tournament);
}

async function finishTable(tournamentId, organizerId, roundId, tableId, data) {
  const tournament = await loadTournamentForOrganizer(tournamentId, organizerId);
  const round = findRound(tournament, roundId);
  assertStatus(round, ['active'], 'Solo se pueden cerrar mesas de una ronda activa');
  const table = findTable(round, tableId);
  assertStatus(table, ['active'], 'La mesa ya finalizo o no esta activa');

  table.players = mergePlayerScores(table.players, data.players);
  applyExplicitResult(table, data);
  table.endTime = now();
  table.status = 'finished';

  if (round.tables.filter(currentTable => currentTable.type !== 'bench').every(currentTable => currentTable.status === 'finished')) {
    await finishRoundState(tournament, round);
  }

  return save(tournament);
}

async function finishRound(tournamentId, organizerId, roundId, data) {
  const tournament = await loadTournamentForOrganizer(tournamentId, organizerId);
  const round = findRound(tournament, roundId);
  assertStatus(round, ['active'], 'Solo se puede terminar una ronda activa');

  const tablesById = new Map((data.tables || []).map(table => [table.id, table]));
  const finishedAt = now();

  for (const table of round.tables) {
    if (table.type === 'bench') {
      table.result = 'none';
      table.endTime = finishedAt;
      table.status = 'finished';
      continue;
    }

    if (table.status !== 'finished') {
      const incoming = tablesById.get(table.id);
      table.players = mergePlayerScores(table.players, incoming?.players || []);
      if (incoming) applyExplicitResult(table, incoming);
      else inferTableResult(table);
      table.endTime = finishedAt;
      table.status = 'finished';
    }
  }

  await finishRoundState(tournament, round, finishedAt);
  return save(tournament);
}

async function updateTournamentSettings(tournamentId, organizerId, data) {
  const tournament = await loadTournamentForOrganizer(tournamentId, organizerId);
  if (data.pairingMethod) tournament.pairingMethod = data.pairingMethod;
  if (data.roundDuration !== undefined) {
    tournament.roundDuration = normalizeRoundDuration(data.roundDuration);
    const openRound = currentOpenRound(tournament);
    if (openRound?.status === 'pending') openRound.timeLimitMinutes = tournament.roundDuration;
  }
  return save(tournament);
}

async function addTable(tournamentId, organizerId, roundId) {
  const tournament = await loadTournamentForOrganizer(tournamentId, organizerId);
  const round = findRound(tournament, roundId);
  assertTablesEditable(round, 'Las mesas estan bloqueadas durante la ronda activa');
  ensureBench(round);
  const bench = getBench(round);
  const tableNumber = nextTableNumber(round);
  const table = {
    id: `t${tableNumber}`,
    type: 'normal',
    players: [],
    status: round.status === 'active' ? 'active' : 'pending',
    startTime: round.status === 'active' ? now() : null,
    endTime: null,
  };
  round.tables.splice(round.tables.indexOf(bench), 0, table);
  return save(tournament);
}

async function deleteTable(tournamentId, organizerId, roundId, tableId) {
  const tournament = await loadTournamentForOrganizer(tournamentId, organizerId);
  const round = findRound(tournament, roundId);
  assertTablesEditable(round, 'Las mesas estan bloqueadas durante la ronda activa');
  ensureBench(round);
  const table = findTable(round, tableId);
  if (table.type === 'bench') throw ApiError.badRequest('La banca no se puede eliminar');
  if (table.status === 'finished') throw ApiError.badRequest('No se puede eliminar una mesa finalizada');
  if (round.tables.filter(current => current.type !== 'bench').length <= 1) {
    throw ApiError.badRequest('Debe existir al menos una mesa');
  }
  const bench = getBench(round);
  bench.players.push(...table.players);
  round.tables = round.tables.filter(current => current.id !== table.id);
  return save(tournament);
}

async function shuffleRoundPlayers(tournamentId, organizerId, roundId) {
  const tournament = await loadTournamentForOrganizer(tournamentId, organizerId);
  const round = findRound(tournament, roundId);
  assertTablesEditable(round, 'Las mesas estan bloqueadas durante la ronda activa');
  ensureBench(round);

  const normalTables = round.tables.filter(table => table.type !== 'bench');
  const bench = getBench(round);
  const allPlayers = round.tables.flatMap(table => table.players);
  const disqualifiedIds = new Set(tournament.players.filter(player => player.eliminatedFromTournament).map(player => player.userId));
  const tournamentPlayerById = new Map(tournament.players.map(player => [player.userId, player]));
  const movable = allPlayers
    .filter(player => !disqualifiedIds.has(player.userId))
    .map(player => ({
      ...player,
      tableScore: player.score || 0,
      score: tournamentPlayerById.get(player.userId)?.score ?? player.score ?? 0,
      wins: tournamentPlayerById.get(player.userId)?.wins ?? 0,
    }));
  const disqualified = allPlayers.filter(player => disqualifiedIds.has(player.userId));

  for (const table of normalTables) table.players = [];
  bench.players = disqualified.map(player => ({ ...player, eliminated: true }));

  const redistributed = redistributePlayers(
    movable,
    normalTables.length,
    tournament.pairingMethod || 'snake',
    round.number || tournament.currentRound
  );

  for (let i = 0; i < normalTables.length; i++) {
    normalTables[i].players = (redistributed[i] || []).map(player => ({
      userId: player.userId,
      displayName: player.displayName,
      score: player.tableScore || 0,
      eliminated: false,
      startScore: player.startScore ?? tournamentPlayerById.get(player.userId)?.score ?? 0,
    }));
  }

  return save(tournament);
}

async function setTournamentPlayerStatus(tournamentId, organizerId, userId, data) {
  const tournament = await loadTournamentForOrganizer(tournamentId, organizerId);
  assertStatus(tournament, ['lobby', 'active', 'review', 'finished'], 'Estado de torneo invalido');
  const player = tournament.players.find(p => p.userId === userId);
  if (!player) throw ApiError.notFound('Jugador no encontrado');

  if (data.score !== undefined) player.score = normalizeNonNegativeInt(data.score);
  if (data.disqualified !== undefined) {
    if (data.disqualified) disqualifyPlayer(tournament, player);
    else reinstatePlayer(tournament, player);
  }

  if (tournament.status === 'finished') await refreshRanking(tournament);
  return save(tournament);
}

async function reviseTable(tournamentId, organizerId, roundId, tableId, data) {
  const tournament = await loadTournamentForOrganizer(tournamentId, organizerId);
  const round = findRound(tournament, roundId);
  const table = findTable(round, tableId);
  if (table.type === 'bench') throw ApiError.badRequest('La banca no tiene resultado');
  if (table.status !== 'finished') throw ApiError.badRequest('Solo se pueden corregir mesas finalizadas');

  table.players = mergePlayerScores(table.players, data.players);
  applyExplicitResult(table, data);
  recomputeTournamentRecords(tournament);
  if (tournament.status === 'finished') await refreshRanking(tournament);
  return save(tournament);
}

async function finalizeTournamentResults(tournamentId, organizerId) {
  const tournament = await loadTournamentForOrganizer(tournamentId, organizerId);
  assertStatus(tournament, ['review'], 'El torneo no esta listo para publicar resultados');
  const unfinishedRound = tournament.rounds.find(round => round.status !== 'finished');
  if (unfinishedRound) throw ApiError.badRequest('Todas las rondas deben estar finalizadas');

  recomputeTournamentRecords(tournament);
  tournament.status = 'finished';
  await refreshRanking(tournament);
  return save(tournament);
}

async function ensureOrganizerRankingsCurrent(organizerId) {
  const tournaments = await tournamentRepository.findAll();
  for (const tournament of tournaments) {
    if (tournament.organizerId !== organizerId) continue;
    normalizeTournament(tournament);
    if (needsRankingRefresh(tournament)) await ensureRankingCurrent(tournament);
  }
}

async function loadTournament(id) {
  const tournament = await tournamentRepository.findById(id);
  if (!tournament) throw ApiError.notFound('Torneo no encontrado');
  normalizeTournament(tournament);
  return tournament;
}

async function loadTournamentForOrganizer(id, organizerId) {
  const tournament = await loadTournament(id);
  if (!policies.isOrganizer(tournament, organizerId)) {
    throw ApiError.forbidden('Solo el organizador puede realizar esta accion');
  }
  return tournament;
}

function playerEntry(user) {
  return {
    userId: user.uid,
    displayName: user.displayName,
    score: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    eliminatedFromTournament: false,
    disqualifiedAt: null,
  };
}

function createJoinRequest(tournament, user) {
  tournament.joinRequests.push({
    userId: user.uid,
    displayName: user.displayName,
    type: 'join',
    status: 'pending',
    requestedAt: now(),
  });
}

function createInvitation(tournament, user, organizerId) {
  const pending = tournament.joinRequests.some(request =>
    request.userId === user.uid && request.status === 'pending' && request.type === 'invite'
  );
  if (pending) throw ApiError.conflict('Ya existe una invitacion pendiente');
  tournament.joinRequests.push({
    userId: user.uid,
    displayName: user.displayName,
    type: 'invite',
    status: 'pending',
    requestedAt: now(),
    invitedBy: organizerId,
  });
}

function addPlayerToTournament(tournament, user) {
  tournament.players.push(playerEntry(user));
  if (tournament.status === 'active') {
    const round = currentOpenRound(tournament);
    if (round) {
      ensureBench(round);
      getBench(round).players.push({
        userId: user.uid,
        displayName: user.displayName,
        score: 0,
        eliminated: false,
        startScore: 0,
      });
    }
  }
}

function minimumPlayersForTournament(tournament) {
  return tournament.isRanked ? 8 : 2;
}

function normalizeTournament(tournament) {
  tournament.pairingMethod = tournament.pairingMethod || 'snake';
  tournament.roundDuration = normalizeRoundDuration(tournament.roundDuration);
  tournament.joinRequests = tournament.joinRequests || [];
  tournament.rounds = tournament.rounds || [];
  tournament.players = tournament.players || [];
  for (const round of tournament.rounds) {
    round.timeLimitMinutes = round.timeLimitMinutes ?? tournament.roundDuration;
    round.totalPausedMs = round.totalPausedMs || 0;
    round.pausedAt = round.pausedAt || null;
    round.tableEditingUnlocked = !!round.tableEditingUnlocked;
    ensureBench(round);
  }
}

function normalizeRoundDuration(value) {
  const parsed = parseInt(value, 10);
  if (Number.isNaN(parsed)) return 0;
  return Math.min(240, Math.max(0, parsed));
}

function assertTablesEditable(round, message) {
  if (round.status === 'pending') return;
  if (round.status === 'active' && round.tableEditingUnlocked) return;
  throw ApiError.badRequest(message || 'Solo se pueden modificar mesas antes de iniciar la ronda');
}

function createBenchTable(players) {
  return {
    id: BENCH_ID,
    type: 'bench',
    players,
    status: 'pending',
    startTime: null,
    endTime: null,
    result: 'none',
  };
}

function ensureBench(round) {
  let bench = round.tables.find(table => table.id === BENCH_ID || table.type === 'bench');
  if (!bench) {
    bench = createBenchTable([]);
    round.tables.push(bench);
  }
  bench.id = BENCH_ID;
  bench.type = 'bench';
  bench.result = 'none';
  return bench;
}

function getBench(round) {
  return ensureBench(round);
}

function nextTableNumber(round) {
  const numbers = round.tables
    .filter(table => table.type !== 'bench')
    .map(table => parseInt(String(table.id).replace(/^t/, ''), 10))
    .filter(Number.isFinite);
  return numbers.length ? Math.max(...numbers) + 1 : 1;
}

function currentOpenRound(tournament) {
  return tournament.rounds.find(round => round.status === 'pending' || round.status === 'active') || null;
}

function applyExplicitResult(table, data) {
  if (data.result === 'winner') {
    const winner = table.players.find(player => player.userId === data.winnerUserId && !player.eliminated);
    if (!winner) throw ApiError.badRequest('Ganador invalido');
    table.result = 'winner';
    table.winner = { userId: winner.userId, displayName: winner.displayName };
    table.drawPlayers = [];
    return;
  }

  if (data.result === 'draw') {
    const drawUserIds = Array.isArray(data.drawUserIds) ? data.drawUserIds : [];
    const activeDrawPlayers = table.players.filter(player =>
      !player.eliminated && drawUserIds.includes(player.userId)
    );
    if (!activeDrawPlayers.length) throw ApiError.badRequest('Empate invalido');
    table.result = 'draw';
    table.winner = null;
    table.drawPlayers = activeDrawPlayers.map(player => ({
      userId: player.userId,
      displayName: player.displayName,
    }));
    return;
  }

  table.result = 'none';
  table.winner = null;
  table.drawPlayers = [];
}

async function finishRoundState(tournament, round, finishedAt = now()) {
  for (const table of round.tables) {
    if (table.type === 'bench') {
      table.result = 'none';
      table.status = 'finished';
      table.endTime = finishedAt;
    }
    inferTableResult(table);
  }
  round.endTime = finishedAt;
  round.pausedAt = null;
  round.tableEditingUnlocked = false;
  round.status = 'finished';
  accumulateRoundScores(tournament, round);
  prepareNextRound(tournament);
}

function prepareNextRound(tournament) {
  if (tournament.currentRound >= tournament.totalRounds) {
    tournament.status = 'review';
    return;
  }

  tournament.currentRound += 1;
  const nextTables = generateRound(tournament.players, tournament.currentRound, tournament.pairingMethod || 'snake');
  for (const table of nextTables) table.status = 'pending';
  const disqualifiedPlayers = tournament.players
    .filter(player => player.eliminatedFromTournament)
    .map(player => ({
      userId: player.userId,
      displayName: player.displayName,
      score: 0,
      eliminated: true,
      startScore: player.score || 0,
    }));
  nextTables.push(createBenchTable(disqualifiedPlayers));
  tournament.rounds.push({
    id: createId(),
    number: tournament.currentRound,
    tables: nextTables,
    startTime: null,
    endTime: null,
    timeLimitMinutes: tournament.roundDuration,
    pausedAt: null,
    totalPausedMs: 0,
    tableEditingUnlocked: false,
    status: 'pending',
  });
}

function disqualifyPlayer(tournament, player) {
  player.eliminatedFromTournament = true;
  player.disqualifiedAt = player.disqualifiedAt || now();
  for (const round of tournament.rounds) {
    ensureBench(round);
    const bench = getBench(round);
    for (const table of round.tables) {
      const tablePlayer = table.players.find(p => p.userId === player.userId);
      if (tablePlayer) tablePlayer.eliminated = true;
    }
    if (round.status === 'pending') {
      for (const table of round.tables.filter(t => t.type !== 'bench')) {
        const idx = table.players.findIndex(p => p.userId === player.userId);
        if (idx !== -1) {
          const [tablePlayer] = table.players.splice(idx, 1);
          bench.players.push({ ...tablePlayer, eliminated: true });
        }
      }
    }
  }
}

function reinstatePlayer(tournament, player) {
  player.eliminatedFromTournament = false;
  player.disqualifiedAt = null;
  const round = currentOpenRound(tournament);
  if (round) {
    ensureBench(round);
    const alreadyInRound = round.tables.some(table => table.players.some(p => p.userId === player.userId));
    if (!alreadyInRound) {
      getBench(round).players.push({
        userId: player.userId,
        displayName: player.displayName,
        score: 0,
        eliminated: false,
        startScore: player.score || 0,
      });
    }
  }
}

function recomputeTournamentRecords(tournament) {
  for (const player of tournament.players) {
    player.score = 0;
    player.wins = 0;
    player.losses = 0;
    player.draws = 0;
  }
  for (const round of tournament.rounds) {
    if (round.status === 'finished') accumulateRoundScores(tournament, round);
  }
}

async function refreshRanking(tournament) {
  if (!tournament.isRanked) return;
  if (tournament.rankingApplied && tournament.rankingDeltas?.length) {
    await userRepository.applyRankingDeltas(tournament.organizerId, tournament.organizerName, invertDeltas(tournament.rankingDeltas));
  }
  const deltas = calculateRankingDeltas(tournament);
  await userRepository.applyRankingDeltas(tournament.organizerId, tournament.organizerName, deltas);
  tournament.rankingDeltas = deltas.map(delta => ({ userId: delta.userId, points: delta.points, rank: delta.rank }));
  tournament.rankingApplied = true;
  tournament.rankingFormulaVersion = RANKING_FORMULA_VERSION;
}

function needsRankingRefresh(tournament) {
  return !!(
    tournament.isRanked &&
    tournament.status === 'finished' &&
    (!tournament.rankingApplied || (tournament.rankingFormulaVersion || 0) !== RANKING_FORMULA_VERSION)
  );
}

async function ensureRankingCurrent(tournament) {
  if (!needsRankingRefresh(tournament)) return tournament;
  await refreshRanking(tournament);
  return save(tournament);
}

async function save(tournament) {
  return tournamentRepository.saveTournament(tournament);
}

module.exports = {
  listTournaments,
  getTournament,
  createTournament,
  addPlayer,
  removePlayer,
  setPlayerScore,
  handleJoinRequest,
  startTournament,
  replaceRoundTables,
  updateTablePlayer,
  activateRound,
  pauseRound,
  resumeRound,
  updateRoundTime,
  updateRoundEditing,
  finishTable,
  finishRound,
  handleInvitation,
  updateTournamentSettings,
  addTable,
  deleteTable,
  shuffleRoundPlayers,
  setTournamentPlayerStatus,
  reviseTable,
  finalizeTournamentResults,
  ensureOrganizerRankingsCurrent,
};
