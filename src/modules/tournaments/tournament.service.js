const ApiError = require('../../shared/http/ApiError');
const { createId } = require('../../shared/utils/ids');
const { now } = require('../../shared/utils/dates');
const authService = require('../auth/auth.service');
const userRepository = require('../users/user.repository');
const tournamentRepository = require('./tournament.repository');
const policies = require('./tournament.policies');
const { generateRound } = require('./domain/matchmaking');
const { accumulateRoundScores, inferTableResult } = require('./domain/scoring');
const { RANKING_FORMULA_VERSION, calculateRankingDeltas } = require('./domain/ranking');
const { anonymousPlayerIdentity } = require('./domain/anonymousPlayers');
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
  const isRanked = !!(organizer.isLicensed && organizer.role === 'organizer');
  const effectiveMinimum = Math.max(isRanked ? 8 : 2, Number.isFinite(Number(data.minPlayers)) ? Number(data.minPlayers) : 0);
  if (data.maxPlayers !== null && data.maxPlayers !== undefined && data.maxPlayers < effectiveMinimum) {
    throw ApiError.badRequest(`El maximo debe ser al menos ${effectiveMinimum} jugadores`);
  }

  return tournamentRepository.createTournament({
    name: data.name,
    bannerUrl: data.bannerUrl || '',
    organizerId,
    organizerName: organizer.displayName,
    organizerUsername: organizer.username,
    scheduledStartAt: data.scheduledStartAt || null,
    totalRounds: data.totalRounds,
    roundDuration: data.roundDuration,
    minPlayers: data.minPlayers,
    maxPlayers: data.maxPlayers,
    status: 'lobby',
    deletedAt: null,
    deletedBy: '',
    deletionReason: '',
    deletionSnapshot: null,
    visibility: data.visibility || 'public',
    isRanked,
    pairingMethod: data.pairingMethod || 'snake',
    tableMode: data.tableMode || 'multi',
    rankingApplied: false,
    rankingFormulaVersion: 0,
    rankingDeltas: [],
    prizes: data.prizes || [],
    moderators: [],
    moderatorEvents: [],
    auditLog: [],
    appeals: [],
    players: [],
    joinRequests: [],
    rounds: [],
    currentRound: 0,
  });
}

async function addPlayer(tournamentId, sessionUserId, playerRequest = {}) {
  const tournament = await loadTournament(tournamentId);

  const requesterIsOrganizer = policies.canManageTournament(tournament, sessionUserId);
  assertStatus(
    tournament,
    requesterIsOrganizer ? ['lobby', 'active'] : ['lobby'],
    requesterIsOrganizer ? 'El torneo ya finalizo' : 'Solo puedes inscribirte durante el lobby'
  );
  const request = typeof playerRequest === 'string' ? { userId: playerRequest } : (playerRequest || {});

  if (request.anonymousName) {
    if (!requesterIsOrganizer) throw ApiError.forbidden('Solo el organizador puede agregar jugadores anonimos');
    const anonymousPlayer = anonymousPlayerIdentity(tournament.organizerId, request.anonymousName);
    if (!anonymousPlayer) throw ApiError.badRequest('Nombre anonimo invalido');
    if (tournament.players.some(player => player.userId === anonymousPlayer.uid)) {
      throw ApiError.conflict('El jugador ya esta en el torneo');
    }
    addPlayerToTournament(tournament, anonymousPlayer);
    recordAuditEvent(tournament, sessionUserId, 'anonymous_player_added', {
      userId: anonymousPlayer.uid,
      displayName: anonymousPlayer.displayName,
      anonymousKey: anonymousPlayer.anonymousKey,
    });
    return save(tournament);
  }

  const targetUserId = requesterIsOrganizer ? request.userId : sessionUserId;
  const user = await userRepository.findByPublicId(targetUserId);
  if (!user) throw ApiError.notFound('Jugador no encontrado');

  if (tournament.players.some(player => player.userId === user.uid)) {
    throw ApiError.conflict('El jugador ya esta en el torneo');
  }

  if (requesterIsOrganizer) {
    if ((user.invitationPolicy || 'manual') === 'auto') {
      addPlayerToTournament(tournament, user);
      recordAuditEvent(tournament, sessionUserId, 'player_added', { userId: user.uid, displayName: user.displayName });
      return save(tournament);
    }
    createInvitation(tournament, user, sessionUserId);
    recordAuditEvent(tournament, sessionUserId, 'player_invited', { userId: user.uid, displayName: user.displayName });
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
    recordAuditEvent(tournament, sessionUserId, 'join_request_created', { userId: user.uid, displayName: user.displayName });
    await save(tournament);
    return { requested: true, message: 'Solicitud enviada. El organizador debe aceptarla.' };
  }

  addPlayerToTournament(tournament, user);
  recordAuditEvent(tournament, sessionUserId, 'player_self_joined', { userId: user.uid, displayName: user.displayName });
  return save(tournament);
}

async function removePlayer(tournamentId, organizerId, userId) {
  const tournament = await loadTournamentForOrganizer(tournamentId, organizerId);
  assertStatus(tournament, ['lobby'], 'No se puede quitar jugadores con el torneo activo');
  const player = tournament.players.find(current => current.userId === userId);
  tournament.players = tournament.players.filter(player => player.userId !== userId);
  if (player) recordAuditEvent(tournament, organizerId, 'player_removed', { userId, displayName: player.displayName });
  return save(tournament);
}

async function setPlayerScore(tournamentId, organizerId, userId, score) {
  const tournament = await loadTournamentForOrganizer(tournamentId, organizerId);
  assertStatus(tournament, ['lobby', 'active', 'review', 'finished'], 'Estado de torneo invalido');
  const player = tournament.players.find(p => p.userId === userId);
  if (!player) throw ApiError.notFound('Jugador no encontrado');
  const before = player.score || 0;
  setManualTotalScore(tournament, player, score);
  recordAuditEvent(tournament, organizerId, 'player_score_set', { userId, before, after: player.score });
  if (tournament.status === 'finished') updateRankingSnapshot(tournament);
  const saved = await save(tournament);
  if (tournament.status === 'finished') await rebuildOrganizerRanking(tournament.organizerId);
  return saved;
}

async function handleJoinRequest(tournamentId, organizerId, userId, action) {
  const tournament = await loadTournamentForOrganizer(tournamentId, organizerId);
  assertStatus(tournament, ['lobby', 'active'], 'No se pueden modificar solicitudes con el torneo finalizado');
  const request = tournament.joinRequests.find(r => r.userId === userId && r.status === 'pending' && (r.type || 'join') === 'join');
  if (!request) throw ApiError.notFound('Solicitud no encontrada');

  request.status = action === 'accept' ? 'accepted' : 'rejected';

  if (action === 'accept') {
    const user = await userRepository.findByUid(request.userId);
    if (user && !tournament.players.some(player => player.userId === user.uid)) {
      addPlayerToTournament(tournament, user);
      recordAuditEvent(tournament, organizerId, 'join_request_accepted', { userId: user.uid, displayName: user.displayName });
    }
  } else {
    recordAuditEvent(tournament, organizerId, 'join_request_rejected', { userId: request.userId, displayName: request.displayName });
  }

  return save(tournament);
}

async function handleInvitation(tournamentId, playerId, action) {
  const tournament = await loadTournament(tournamentId);
  const request = tournament.joinRequests.find(r => r.userId === playerId && r.status === 'pending' && r.type === 'invite');
  if (!request) throw ApiError.notFound('Invitacion no encontrada');

  if (action === 'reject') {
    request.status = 'rejected';
    recordAuditEvent(tournament, playerId, 'invitation_rejected', { userId: playerId });
    return save(tournament);
  }

  const alreadyInTournament = tournament.players.some(player => player.userId === playerId);
  if (alreadyInTournament) {
    request.status = 'accepted';
    recordAuditEvent(tournament, playerId, 'invitation_cleared_existing_player', { userId: playerId });
    return save(tournament);
  }

  assertStatus(tournament, ['lobby', 'active'], 'No se pueden aceptar invitaciones con el torneo finalizado');
  request.status = 'accepted';
  const user = await userRepository.findByUid(playerId);
  if (user) {
    addPlayerToTournament(tournament, user);
    recordAuditEvent(tournament, playerId, 'invitation_accepted', { userId: user.uid, displayName: user.displayName });
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
  const tables = generateRound(tournament.players, 1, tournament.pairingMethod || 'snake', tournament.tableMode || 'multi');
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

  recordAuditEvent(tournament, organizerId, 'tournament_started', { playerCount: tournament.players.length });
  return save(tournament);
}

async function listOrganizerPlayerSuggestions(tournamentId, organizerId) {
  const tournament = await loadTournamentForOrganizer(tournamentId, organizerId);
  const tournaments = await tournamentRepository.findAll();
  const ownerId = tournament.organizerId;
  const currentPlayerIds = new Set(tournament.players.map(player => player.userId));
  const pendingPlayerIds = new Set(
    (tournament.joinRequests || [])
      .filter(request => request.status === 'pending')
      .map(request => request.userId)
  );
  const currentTournamentId = tournament._id || tournament.id;
  const suggestionsById = new Map();

  for (const playedTournament of tournaments) {
    const playedTournamentId = playedTournament._id || playedTournament.id;
    if (playedTournament.organizerId !== ownerId || playedTournamentId === currentTournamentId) continue;
    const playedAt = playedTournament.updatedAt || playedTournament.createdAt || 0;

    for (const player of playedTournament.players || []) {
      if (!player.userId || currentPlayerIds.has(player.userId) || pendingPlayerIds.has(player.userId)) continue;
      const existing = suggestionsById.get(player.userId) || {
        userId: player.userId,
        displayName: player.displayName,
        isAnonymous: !!player.isAnonymous,
        anonymousKey: player.anonymousKey || '',
        anonymousName: player.isAnonymous ? player.displayName : '',
        tournamentsPlayed: 0,
        lastPlayedAt: playedAt,
      };
      existing.tournamentsPlayed += 1;
      if (new Date(playedAt).getTime() >= new Date(existing.lastPlayedAt || 0).getTime()) {
        existing.displayName = player.displayName;
        existing.anonymousName = player.isAnonymous ? player.displayName : '';
        existing.lastPlayedAt = playedAt;
      }
      suggestionsById.set(player.userId, existing);
    }
  }

  return [...suggestionsById.values()]
    .sort((a, b) => {
      if (b.tournamentsPlayed !== a.tournamentsPlayed) return b.tournamentsPlayed - a.tournamentsPlayed;
      return new Date(b.lastPlayedAt || 0).getTime() - new Date(a.lastPlayedAt || 0).getTime();
    })
    .slice(0, 16);
}

async function addModerator(tournamentId, organizerId, userId) {
  const tournament = await loadTournamentForOrganizerOwner(tournamentId, organizerId);
  const user = await userRepository.findByPublicId(userId);
  if (!user) throw ApiError.notFound('Usuario no encontrado');
  if (user.uid === tournament.organizerId) throw ApiError.badRequest('El organizador ya administra este torneo');

  const existing = (tournament.moderators || []).find(moderator => moderator.userId === user.uid);
  if (existing?.active) throw ApiError.conflict('Este usuario ya es moderador');

  const at = now();
  if (existing) {
    existing.displayName = user.displayName;
    existing.username = user.username;
    existing.active = true;
    existing.addedAt = at;
    existing.addedBy = organizerId;
    existing.removedAt = null;
    existing.removedBy = '';
    existing.completedAt = null;
  } else {
    tournament.moderators.push({
      userId: user.uid,
      displayName: user.displayName,
      username: user.username,
      active: true,
      addedAt: at,
      addedBy: organizerId,
      removedAt: null,
      removedBy: '',
      completedAt: null,
    });
  }

  const event = {
    userId: user.uid,
    displayName: user.displayName,
    action: 'add',
    at,
    phase: tournamentPhase(tournament),
    actorId: organizerId,
  };
  tournament.moderatorEvents.push(event);
  recordAuditEvent(tournament, organizerId, 'moderator_added', event);
  return save(tournament);
}

async function removeModerator(tournamentId, organizerId, userId) {
  const tournament = await loadTournamentForOrganizerOwner(tournamentId, organizerId);
  const moderator = (tournament.moderators || []).find(current => current.userId === userId && current.active !== false);
  if (!moderator) throw ApiError.notFound('Moderador no encontrado');

  const at = now();
  moderator.active = false;
  moderator.removedAt = at;
  moderator.removedBy = organizerId;

  const event = {
    userId,
    displayName: moderator.displayName,
    action: 'remove',
    at,
    phase: tournamentPhase(tournament),
    actorId: organizerId,
  };
  tournament.moderatorEvents.push(event);
  recordAuditEvent(tournament, organizerId, 'moderator_removed', event);
  return save(tournament);
}

async function replaceRoundTables(tournamentId, organizerId, roundId, tables) {
  const tournament = await loadTournamentForOrganizer(tournamentId, organizerId);
  const round = findRound(tournament, roundId);
  assertTablesEditable(round, 'Las mesas estan bloqueadas durante la ronda activa');
  ensureBench(round);
  round.tables = validateAndRebuildTables(round.tables, tables, tournament.players);
  recordAuditEvent(tournament, organizerId, 'tables_reordered', { roundId, tableCount: round.tables.length });
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
  recordAuditEvent(tournament, organizerId, 'table_player_updated', { roundId, tableId, userId, changes });

  return save(tournament);
}

async function adjustTableScores(tournamentId, organizerId, roundId, tableId, delta) {
  const tournament = await loadTournamentForOrganizer(tournamentId, organizerId);
  const round = findRound(tournament, roundId);
  const table = findTable(round, tableId);
  if (table.type === 'bench') throw ApiError.badRequest('La banca no recibe ajuste masivo');
  assertStatus(table, ['pending', 'active'], 'No se puede modificar una mesa finalizada');
  const parsedDelta = parseInt(delta, 10);
  if (!Number.isFinite(parsedDelta) || parsedDelta === 0) throw ApiError.badRequest('Ajuste invalido');

  for (const player of table.players) {
    if (player.eliminated) continue;
    player.score = Math.max(0, (player.score || 0) + parsedDelta);
  }
  recordAuditEvent(tournament, organizerId, 'table_scores_adjusted', { roundId, tableId, delta: parsedDelta });
  return save(tournament);
}

async function adjustRoundScores(tournamentId, organizerId, roundId, delta) {
  const tournament = await loadTournamentForOrganizer(tournamentId, organizerId);
  const round = findRound(tournament, roundId);
  assertStatus(round, ['pending', 'active'], 'No se puede modificar una ronda finalizada');
  const parsedDelta = parseInt(delta, 10);
  if (!Number.isFinite(parsedDelta) || parsedDelta === 0) throw ApiError.badRequest('Ajuste invalido');

  for (const table of round.tables) {
    if (table.type === 'bench') continue;
    for (const player of table.players) {
      if (player.eliminated) continue;
      player.score = Math.max(0, (player.score || 0) + parsedDelta);
    }
  }
  recordAuditEvent(tournament, organizerId, 'round_scores_adjusted', { roundId, delta: parsedDelta });
  return save(tournament);
}

async function adjustTournamentScores(tournamentId, organizerId, delta) {
  const tournament = await loadTournamentForOrganizer(tournamentId, organizerId);
  assertStatus(tournament, ['lobby', 'active', 'review'], 'No se puede modificar un torneo finalizado');
  const parsedDelta = parseInt(delta, 10);
  if (!Number.isFinite(parsedDelta) || parsedDelta === 0) throw ApiError.badRequest('Ajuste invalido');

  for (const player of tournament.players || []) {
    setManualTotalScore(tournament, player, Math.max(0, (player.score || 0) + parsedDelta));
  }
  recordAuditEvent(tournament, organizerId, 'tournament_scores_adjusted', { delta: parsedDelta });
  return save(tournament);
}

async function applyRoundChanges(tournamentId, organizerId, roundId, changes) {
  const tournament = await loadTournamentForOrganizer(tournamentId, organizerId);
  const round = findRound(tournament, roundId);
  assertStatus(round, ['pending', 'active'], 'No se puede modificar una ronda finalizada');

  const applied = [];
  for (const change of changes) {
    if (change.type === 'tables') {
      assertTablesEditable(round, 'Las mesas estan bloqueadas durante la ronda activa');
      ensureBench(round);
      round.tables = validateAndRebuildTables(round.tables, change.tables, tournament.players);
      applied.push({ type: 'tables', tableCount: round.tables.length });
      continue;
    }

    if (change.type === 'tablePlayer') {
      const table = findTable(round, change.tableId);
      assertStatus(table, ['pending', 'active'], 'No se puede modificar una mesa finalizada');
      const player = findTablePlayer(table, change.userId);
      const detail = { type: 'tablePlayer', tableId: change.tableId, userId: change.userId };
      if (change.score !== undefined) {
        player.score = normalizeNonNegativeInt(change.score);
        detail.score = player.score;
      }
      if (change.eliminated !== undefined) {
        player.eliminated = !!change.eliminated;
        detail.eliminated = player.eliminated;
      }
      applied.push(detail);
      continue;
    }

    if (change.type === 'playerScore') {
      const player = tournament.players.find(current => current.userId === change.userId);
      if (!player) throw ApiError.notFound('Jugador no encontrado');
      const before = player.score || 0;
      setManualTotalScore(tournament, player, change.score);
      applied.push({ type: 'playerScore', userId: change.userId, before, after: player.score });
    }
  }

  recordAuditEvent(tournament, organizerId, 'round_changes_applied', { roundId, changes: applied });
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

  recordAuditEvent(tournament, organizerId, 'round_activated', { roundId });
  return save(tournament);
}

async function pauseRound(tournamentId, organizerId, roundId) {
  const tournament = await loadTournamentForOrganizer(tournamentId, organizerId);
  const round = findRound(tournament, roundId);
  assertStatus(round, ['active'], 'Solo se puede pausar una ronda activa');
  if (round.pausedAt) throw ApiError.conflict('La ronda ya esta pausada');
  round.pausedAt = now();
  recordAuditEvent(tournament, organizerId, 'round_paused', { roundId });
  return save(tournament);
}

async function resumeRound(tournamentId, organizerId, roundId) {
  const tournament = await loadTournamentForOrganizer(tournamentId, organizerId);
  const round = findRound(tournament, roundId);
  assertStatus(round, ['active'], 'Solo se puede reanudar una ronda activa');
  if (!round.pausedAt) throw ApiError.conflict('La ronda no esta pausada');
  round.totalPausedMs = (round.totalPausedMs || 0) + Math.max(0, now() - round.pausedAt);
  round.pausedAt = null;
  recordAuditEvent(tournament, organizerId, 'round_resumed', { roundId });
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
  recordAuditEvent(tournament, organizerId, 'round_time_updated', { roundId, timeLimitMinutes: round.timeLimitMinutes });
  return save(tournament);
}

async function updateRoundEditing(tournamentId, organizerId, roundId, unlocked) {
  const tournament = await loadTournamentForOrganizer(tournamentId, organizerId);
  const round = findRound(tournament, roundId);
  assertStatus(round, ['active'], 'El bloqueo solo aplica a rondas activas');
  round.tableEditingUnlocked = !!unlocked;
  recordAuditEvent(tournament, organizerId, 'round_editing_updated', { roundId, unlocked: round.tableEditingUnlocked });
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
  recordAuditEvent(tournament, organizerId, 'table_finished', { roundId, tableId, result: table.result, winner: table.winner || null });

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
  recordAuditEvent(tournament, organizerId, 'round_finished', { roundId });
  return save(tournament);
}

async function updateTournamentSettings(tournamentId, organizerId, data) {
  const tournament = await loadTournamentForOrganizer(tournamentId, organizerId);
  assertStatus(tournament, ['lobby', 'active', 'review'], 'No se puede modificar un torneo finalizado');

  const nextMin = data.minPlayers !== undefined ? data.minPlayers : tournament.minPlayers;
  const nextMax = data.maxPlayers !== undefined ? data.maxPlayers : tournament.maxPlayers;
  const effectiveMinimum = Math.max(tournament.isRanked ? 8 : 2, Number.isFinite(Number(nextMin)) ? Number(nextMin) : 0);
  if (nextMin !== null && nextMax !== null && nextMin !== undefined && nextMax !== undefined && nextMin > nextMax) {
    throw ApiError.badRequest('El minimo no puede superar el maximo de jugadores');
  }
  if (nextMax !== null && nextMax !== undefined && nextMax < effectiveMinimum) {
    throw ApiError.badRequest(`El maximo debe ser al menos ${effectiveMinimum} jugadores`);
  }
  if (nextMax !== null && nextMax !== undefined && nextMax < tournament.players.length) {
    throw ApiError.badRequest(`El maximo no puede ser menor que los ${tournament.players.length} jugadores inscritos`);
  }

  if (data.pairingMethod) tournament.pairingMethod = data.pairingMethod;
  if (data.tableMode) tournament.tableMode = data.tableMode;
  if (data.bannerUrl !== undefined) tournament.bannerUrl = data.bannerUrl || '';
  if (data.scheduledStartAt !== undefined) tournament.scheduledStartAt = data.scheduledStartAt || null;
  if (data.minPlayers !== undefined) tournament.minPlayers = data.minPlayers;
  if (data.maxPlayers !== undefined) tournament.maxPlayers = data.maxPlayers;
  if (data.totalRounds !== undefined) {
    if (tournament.status !== 'lobby') throw ApiError.badRequest('Las rondas de un torneo activo se ajustan con agregar o quitar ronda');
    tournament.totalRounds = data.totalRounds;
  }
  if (data.roundDuration !== undefined) {
    tournament.roundDuration = normalizeRoundDuration(data.roundDuration);
    const openRound = currentOpenRound(tournament);
    if (openRound?.status === 'pending') openRound.timeLimitMinutes = tournament.roundDuration;
  }
  recordAuditEvent(tournament, organizerId, 'tournament_settings_updated', data);
  return save(tournament);
}

async function addRound(tournamentId, organizerId) {
  const tournament = await loadTournamentForOrganizer(tournamentId, organizerId);
  assertStatus(tournament, ['active', 'review'], 'Solo se pueden agregar rondas a un torneo activo');
  if (tournament.totalRounds >= 20) throw ApiError.badRequest('El torneo ya tiene el maximo de 20 rondas');

  const before = tournament.totalRounds;
  tournament.totalRounds += 1;

  if (tournament.status === 'review') {
    const nextRoundNumber = nextRoundNumberForTournament(tournament);
    tournament.status = 'active';
    tournament.currentRound = nextRoundNumber;
    tournament.rounds.push(createPendingRound(tournament, nextRoundNumber));
  }

  recordAuditEvent(tournament, organizerId, 'round_added', {
    before,
    after: tournament.totalRounds,
  });
  return save(tournament);
}

async function removeRound(tournamentId, organizerId) {
  const tournament = await loadTournamentForOrganizer(tournamentId, organizerId);
  assertStatus(tournament, ['active'], 'Solo se pueden quitar rondas de un torneo activo');
  if (tournament.totalRounds <= 1) throw ApiError.badRequest('El torneo debe tener al menos una ronda');

  const before = tournament.totalRounds;
  const openRound = currentOpenRound(tournament);

  if (tournament.totalRounds > (tournament.currentRound || 0)) {
    tournament.totalRounds -= 1;
  } else if (openRound?.status === 'pending' && openRound.number === tournament.totalRounds) {
    tournament.rounds = tournament.rounds.filter(round => round.id !== openRound.id);
    tournament.totalRounds -= 1;
    tournament.currentRound = Math.max(1, lastRoundNumber(tournament));
    if ((tournament.rounds || []).length && tournament.rounds.every(round => round.status === 'finished')) {
      tournament.status = 'review';
    }
  } else {
    throw ApiError.badRequest('No hay rondas futuras o pendientes para quitar');
  }

  recordAuditEvent(tournament, organizerId, 'round_removed', {
    before,
    after: tournament.totalRounds,
  });
  return save(tournament);
}

async function deleteTournament(tournamentId, organizerId, data = {}) {
  const tournament = await loadTournamentForOrganizerOwner(tournamentId, organizerId);
  await authService.verifyPassword(organizerId, data.password);

  const deletedAt = now();
  recordAuditEvent(tournament, organizerId, 'tournament_deleted', {
    deletedAt,
    reason: data.reason || '',
  });
  const deletionSnapshot = JSON.parse(JSON.stringify({
    ...tournament,
    deletionSnapshot: null,
  }));

  tournament.deletedAt = deletedAt;
  tournament.deletedBy = organizerId;
  tournament.deletionReason = data.reason || '';
  tournament.deletionSnapshot = deletionSnapshot;

  const saved = await save(tournament);
  if (tournament.isRanked) await rebuildOrganizerRanking(tournament.organizerId);
  return saved;
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
  recordAuditEvent(tournament, organizerId, 'table_created', { roundId, tableId: table.id });
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
  recordAuditEvent(tournament, organizerId, 'table_deleted', { roundId, tableId, movedPlayers: table.players.map(player => player.userId) });
  return save(tournament);
}

async function shuffleRoundPlayers(tournamentId, organizerId, roundId) {
  const tournament = await loadTournamentForOrganizer(tournamentId, organizerId);
  const round = findRound(tournament, roundId);
  assertTablesEditable(round, 'Las mesas estan bloqueadas durante la ronda activa');
  ensureBench(round);

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
      yellowCards: tournamentPlayerById.get(player.userId)?.yellowCards ?? player.yellowCards ?? 0,
      redCard: tournamentPlayerById.get(player.userId)?.redCard ?? !!player.redCard,
    }));
  const disqualified = allPlayers.filter(player => disqualifiedIds.has(player.userId));

  bench.players = disqualified.map(player => ({ ...player, eliminated: true }));

  const redistributedTables = generateRound(
    movable,
    round.number || tournament.currentRound,
    tournament.pairingMethod || 'snake',
    tournament.tableMode || 'multi'
  );

  for (const table of redistributedTables) {
    table.status = round.status === 'active' ? 'active' : 'pending';
    table.startTime = round.status === 'active' ? (round.startTime || now()) : null;
    table.players = table.players.map(player => {
      const source = movable.find(current => current.userId === player.userId) || player;
      return {
        ...player,
        score: source.tableScore || 0,
        startScore: source.startScore ?? tournamentPlayerById.get(player.userId)?.score ?? 0,
        yellowCards: tournamentPlayerById.get(player.userId)?.yellowCards || source.yellowCards || 0,
        redCard: tournamentPlayerById.get(player.userId)?.redCard || !!source.redCard,
      };
    });
  }
  round.tables = [...redistributedTables, bench];

  recordAuditEvent(tournament, organizerId, 'round_players_redistributed', {
    roundId,
    tableCount: redistributedTables.length,
    method: tournament.pairingMethod,
    tableMode: tournament.tableMode,
  });
  return save(tournament);
}

async function setTournamentPlayerStatus(tournamentId, organizerId, userId, data) {
  const tournament = await loadTournamentForOrganizer(tournamentId, organizerId);
  assertStatus(tournament, ['lobby', 'active', 'review', 'finished'], 'Estado de torneo invalido');
  const player = tournament.players.find(p => p.userId === userId);
  if (!player) throw ApiError.notFound('Jugador no encontrado');

  if (data.score !== undefined) {
    const before = player.score || 0;
    setManualTotalScore(tournament, player, data.score);
    recordAuditEvent(tournament, organizerId, 'player_score_set', { userId, before, after: player.score });
  }
  if (data.disqualified !== undefined) {
    if (data.disqualified) disqualifyPlayer(tournament, player);
    else reinstatePlayer(tournament, player);
    recordAuditEvent(tournament, organizerId, data.disqualified ? 'player_disqualified' : 'player_reinstated', { userId, displayName: player.displayName });
  }
  if (data.yellowCards !== undefined || data.redCard !== undefined) {
    const before = { yellowCards: player.yellowCards || 0, redCard: !!player.redCard };
    setPlayerCards(tournament, player, data);
    if (player.redCard && !player.eliminatedFromTournament) {
      disqualifyPlayer(tournament, player);
      recordAuditEvent(tournament, organizerId, 'player_disqualified_by_red_card', { userId, displayName: player.displayName });
    }
    recordAuditEvent(tournament, organizerId, 'player_cards_updated', {
      userId,
      displayName: player.displayName,
      before,
      after: { yellowCards: player.yellowCards || 0, redCard: !!player.redCard },
    });
  }

  if (tournament.status === 'finished') updateRankingSnapshot(tournament);
  const saved = await save(tournament);
  if (tournament.status === 'finished') await rebuildOrganizerRanking(tournament.organizerId);
  return saved;
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
  if (tournament.status === 'finished') updateRankingSnapshot(tournament);
  recordAuditEvent(tournament, organizerId, 'table_result_revised', { roundId, tableId, result: table.result, winner: table.winner || null });
  const saved = await save(tournament);
  if (tournament.status === 'finished') await rebuildOrganizerRanking(tournament.organizerId);
  return saved;
}

async function appealPlayerDiscipline(tournamentId, playerId, data = {}) {
  const tournament = await loadTournament(tournamentId);
  assertStatus(tournament, ['finished'], 'Solo se puede apelar en torneos finalizados');
  const player = tournament.players.find(current => current.userId === playerId);
  if (!player) throw ApiError.notFound('Jugador no encontrado');
  if (!player.eliminatedFromTournament && !(player.yellowCards || player.redCard)) {
    throw ApiError.badRequest('No hay tarjetas o descalificacion para apelar');
  }

  const alreadyPending = (tournament.appeals || []).some(appeal =>
    appeal.userId === playerId && appeal.status === 'pending'
  );
  if (alreadyPending) throw ApiError.conflict('Ya tienes una apelacion pendiente');

  const appeal = {
    id: createId(),
    userId: player.userId,
    displayName: player.displayName,
    reason: String(data.reason || '').trim(),
    status: 'pending',
    createdAt: now(),
  };
  tournament.appeals.push(appeal);
  recordAuditEvent(tournament, playerId, 'discipline_appealed', { userId: playerId, appealId: appeal.id });
  return save(tournament);
}

async function finalizeTournamentResults(tournamentId, organizerId) {
  const tournament = await loadTournamentForOrganizer(tournamentId, organizerId);
  assertStatus(tournament, ['review'], 'El torneo no esta listo para publicar resultados');
  const unfinishedRound = tournament.rounds.find(round => round.status !== 'finished');
  if (unfinishedRound) throw ApiError.badRequest('Todas las rondas deben estar finalizadas');

  recomputeTournamentRecords(tournament);
  tournament.status = 'finished';
  markActiveModeratorsCompleted(tournament);
  updateRankingSnapshot(tournament);
  recordAuditEvent(tournament, organizerId, 'tournament_results_finalized', { playerCount: tournament.players.length });
  const saved = await save(tournament);
  await rebuildOrganizerRanking(tournament.organizerId);
  return saved;
}

async function ensureOrganizerRankingsCurrent(organizerId) {
  const tournaments = await tournamentRepository.findAll();
  for (const tournament of tournaments) {
    if (tournament.organizerId !== organizerId || tournament.status !== 'finished' || !tournament.isRanked) continue;
    normalizeTournament(tournament);
    recomputeTournamentRecords(tournament);
    updateRankingSnapshot(tournament);
    await save(tournament);
  }
  await rebuildOrganizerRanking(organizerId);
}

async function rebuildAllOrganizerRankings() {
  const tournaments = await tournamentRepository.findAll();
  const organizerIds = new Set(
    tournaments
      .filter(tournament => tournament.status === 'finished' && tournament.isRanked)
      .map(tournament => tournament.organizerId)
      .filter(Boolean)
  );

  for (const organizerId of organizerIds) {
    await ensureOrganizerRankingsCurrent(organizerId);
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
  if (!policies.canManageTournament(tournament, organizerId)) {
    throw ApiError.forbidden('Solo el organizador o un moderador puede realizar esta accion');
  }
  return tournament;
}

async function loadTournamentForOrganizerOwner(id, organizerId) {
  const tournament = await loadTournament(id);
  if (!policies.isOrganizer(tournament, organizerId)) {
    throw ApiError.forbidden('Solo el organizador principal puede realizar esta accion');
  }
  return tournament;
}

function playerEntry(user) {
  return {
    userId: user.uid,
    displayName: user.displayName,
    isAnonymous: !!user.isAnonymous,
    anonymousKey: user.anonymousKey || '',
    score: 0,
    manualScore: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    eliminatedFromTournament: false,
    disqualifiedAt: null,
    yellowCards: 0,
    redCard: false,
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
  assertPlayerLimitAvailable(tournament);
  const player = playerEntry(user);
  tournament.players.push(player);
  clearPendingInvitationsForPlayer(tournament, player.userId);
  if (tournament.status === 'active') {
    const round = currentOpenRound(tournament);
    if (round) {
      ensureBench(round);
      getBench(round).players.push({
        userId: player.userId,
        displayName: player.displayName,
        isAnonymous: player.isAnonymous,
        anonymousKey: player.anonymousKey,
        yellowCards: player.yellowCards || 0,
        redCard: !!player.redCard,
        score: 0,
        eliminated: false,
        startScore: 0,
      });
    }
  }
}

function clearPendingInvitationsForPlayer(tournament, userId) {
  for (const request of tournament.joinRequests || []) {
    if (request.userId === userId && request.status === 'pending' && request.type === 'invite') {
      request.status = 'accepted';
    }
  }
}

function minimumPlayersForTournament(tournament) {
  const baseMinimum = tournament.isRanked ? 8 : 2;
  const customMinimum = parseInt(tournament.minPlayers, 10);
  return Math.max(baseMinimum, Number.isFinite(customMinimum) ? customMinimum : 0);
}

function maximumPlayersForTournament(tournament) {
  const parsed = parseInt(tournament.maxPlayers, 10);
  return Number.isFinite(parsed) && parsed >= 2 ? parsed : null;
}

function assertPlayerLimitAvailable(tournament) {
  const maximum = maximumPlayersForTournament(tournament);
  if (maximum !== null && tournament.players.length >= maximum) {
    throw ApiError.badRequest(`El torneo ya alcanzo el maximo de ${maximum} jugadores`);
  }
}

function normalizeTournament(tournament) {
  tournament.pairingMethod = tournament.pairingMethod || 'snake';
  tournament.tableMode = tournament.tableMode || 'multi';
  tournament.roundDuration = normalizeRoundDuration(tournament.roundDuration);
  tournament.minPlayers = tournament.minPlayers ?? null;
  tournament.maxPlayers = tournament.maxPlayers ?? null;
  tournament.joinRequests = tournament.joinRequests || [];
  tournament.rounds = tournament.rounds || [];
  tournament.players = tournament.players || [];
  tournament.moderators = tournament.moderators || [];
  tournament.moderatorEvents = tournament.moderatorEvents || [];
  tournament.auditLog = tournament.auditLog || [];
  tournament.appeals = tournament.appeals || [];
  tournament.prizes = tournament.prizes || [];
  tournament.rankingDeltas = tournament.rankingDeltas || [];
  tournament.deletedAt = tournament.deletedAt || null;
  tournament.deletedBy = tournament.deletedBy || '';
  tournament.deletionReason = tournament.deletionReason || '';
  tournament.deletionSnapshot = tournament.deletionSnapshot || null;
  for (const round of tournament.rounds) {
    round.timeLimitMinutes = round.timeLimitMinutes ?? tournament.roundDuration;
    round.totalPausedMs = round.totalPausedMs || 0;
    round.pausedAt = round.pausedAt || null;
    round.tableEditingUnlocked = !!round.tableEditingUnlocked;
    ensureBench(round);
    for (const table of round.tables || []) {
      table.players = table.players || [];
      for (const tablePlayer of table.players) {
        const tournamentPlayer = tournament.players.find(player => player.userId === tablePlayer.userId);
        tablePlayer.yellowCards = tournamentPlayer?.yellowCards || tablePlayer.yellowCards || 0;
        tablePlayer.redCard = tournamentPlayer?.redCard || !!tablePlayer.redCard;
      }
    }
  }
  for (const player of tournament.players) {
    normalizePlayerManualScore(tournament, player);
    player.yellowCards = Math.min(2, Math.max(0, Number(player.yellowCards) || 0));
    player.redCard = !!player.redCard;
    if (player.redCard) player.yellowCards = 2;
    syncPlayerCards(tournament, player.userId, player.yellowCards, player.redCard);
  }
}

function normalizeRoundDuration(value) {
  const parsed = parseInt(value, 10);
  if (Number.isNaN(parsed)) return 0;
  return Math.min(9999, Math.max(0, parsed));
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

function tournamentPhase(tournament) {
  if (tournament.status === 'active') {
    const round = currentOpenRound(tournament);
    if (round) return `${tournament.status}:round-${round.number}:${round.status}`;
  }
  return tournament.status || 'unknown';
}

function recordAuditEvent(tournament, actorId, type, payload = {}) {
  tournament.auditLog = tournament.auditLog || [];
  tournament.auditLog.push({
    type,
    actorId: actorId || '',
    at: now(),
    phase: tournamentPhase(tournament),
    payload,
  });
  if (tournament.auditLog.length > 1000) {
    tournament.auditLog = tournament.auditLog.slice(tournament.auditLog.length - 1000);
  }
}

function setPlayerCards(tournament, player, data) {
  let yellowCards = data.yellowCards !== undefined
    ? normalizeNonNegativeInt(data.yellowCards)
    : (player.yellowCards || 0);
  let redCard = data.redCard !== undefined ? !!data.redCard : !!player.redCard;

  if (yellowCards > 2) {
    yellowCards = 2;
    redCard = true;
  }
  yellowCards = Math.min(2, yellowCards);
  if (redCard) yellowCards = 2;

  player.yellowCards = yellowCards;
  player.redCard = redCard;
  syncPlayerCards(tournament, player.userId, yellowCards, redCard);
}

function syncPlayerCards(tournament, userId, yellowCards, redCard) {
  for (const round of tournament.rounds || []) {
    for (const table of round.tables || []) {
      for (const tablePlayer of table.players || []) {
        if (tablePlayer.userId !== userId) continue;
        tablePlayer.yellowCards = yellowCards;
        tablePlayer.redCard = redCard;
      }
    }
  }
}

function markActiveModeratorsCompleted(tournament) {
  const completedAt = now();
  for (const moderator of tournament.moderators || []) {
    if (moderator.active !== false && !moderator.completedAt) {
      moderator.completedAt = completedAt;
    }
  }
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
  tournament.rounds.push(createPendingRound(tournament, tournament.currentRound));
}

function createPendingRound(tournament, roundNumber) {
  const nextTables = generateRound(
    tournament.players,
    roundNumber,
    tournament.pairingMethod || 'snake',
    tournament.tableMode || 'multi'
  );
  for (const table of nextTables) table.status = 'pending';
  const disqualifiedPlayers = tournament.players
    .filter(player => player.eliminatedFromTournament)
    .map(player => ({
      userId: player.userId,
      displayName: player.displayName,
      isAnonymous: !!player.isAnonymous,
      anonymousKey: player.anonymousKey || '',
      yellowCards: player.yellowCards || 0,
      redCard: !!player.redCard,
      score: 0,
      eliminated: true,
      startScore: player.score || 0,
    }));
  nextTables.push(createBenchTable(disqualifiedPlayers));
  return {
    id: createId(),
    number: roundNumber,
    tables: nextTables,
    startTime: null,
    endTime: null,
    timeLimitMinutes: tournament.roundDuration,
    pausedAt: null,
    totalPausedMs: 0,
    tableEditingUnlocked: false,
    status: 'pending',
  };
}

function lastRoundNumber(tournament) {
  const numbers = (tournament.rounds || [])
    .map(round => Number(round.number))
    .filter(Number.isFinite);
  return numbers.length ? Math.max(...numbers) : 0;
}

function nextRoundNumberForTournament(tournament) {
  return Math.max(Number(tournament.currentRound) || 0, lastRoundNumber(tournament)) + 1;
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
    let alreadyInRound = false;
    for (const table of round.tables) {
      const tablePlayer = table.players.find(p => p.userId === player.userId);
      if (tablePlayer) {
        tablePlayer.eliminated = false;
        alreadyInRound = true;
      }
    }
    if (!alreadyInRound) {
      getBench(round).players.push({
        userId: player.userId,
        displayName: player.displayName,
        isAnonymous: !!player.isAnonymous,
        anonymousKey: player.anonymousKey || '',
        yellowCards: player.yellowCards || 0,
        redCard: !!player.redCard,
        score: 0,
        eliminated: false,
        startScore: player.score || 0,
      });
    }
  }
}

function recomputeTournamentRecords(tournament) {
  for (const player of tournament.players) {
    normalizePlayerManualScore(tournament, player);
    player.score = player.manualScore;
    player.wins = 0;
    player.losses = 0;
    player.draws = 0;
  }
  for (const round of tournament.rounds) {
    if (round.status === 'finished') accumulateRoundScores(tournament, round);
  }
}

function normalizePlayerManualScore(tournament, player) {
  const currentManualScore = Number(player.manualScore);
  if (Number.isFinite(currentManualScore)) {
    player.manualScore = currentManualScore;
    return;
  }

  const currentScore = Number(player.score);
  player.manualScore = Number.isFinite(currentScore)
    ? currentScore - finishedRoundScoreForPlayer(tournament, player.userId)
    : 0;
}

function setManualTotalScore(tournament, player, score) {
  const totalScore = normalizeNonNegativeInt(score);
  player.manualScore = totalScore - finishedRoundScoreForPlayer(tournament, player.userId);
  player.score = totalScore;
}

function finishedRoundScoreForPlayer(tournament, userId) {
  let score = 0;
  for (const round of tournament.rounds || []) {
    if (round.status !== 'finished') continue;
    for (const table of round.tables || []) {
      if (table.type === 'bench') continue;
      const tablePlayer = (table.players || []).find(player => player.userId === userId);
      if (tablePlayer) score += tablePlayer.score || 0;
    }
  }
  return score;
}

function updateRankingSnapshot(tournament) {
  if (!tournament.isRanked) return;
  const deltas = calculateRankingDeltas(tournament);
  tournament.rankingDeltas = deltas.map(delta => ({
    userId: delta.userId,
    displayName: delta.displayName || '',
    isAnonymous: !!delta.isAnonymous,
    anonymousKey: delta.anonymousKey || '',
    points: delta.points,
    rank: delta.rank,
  }));
  tournament.rankingApplied = true;
  tournament.rankingFormulaVersion = RANKING_FORMULA_VERSION;
}

async function rebuildOrganizerRanking(organizerId) {
  const tournaments = await tournamentRepository.findAll();
  const byUser = new Map();
  let organizerName = '';

  for (const tournament of tournaments) {
    if (tournament.organizerId !== organizerId || tournament.status !== 'finished' || !tournament.isRanked) continue;
    normalizeTournament(tournament);
    recomputeTournamentRecords(tournament);
    organizerName = tournament.organizerName || organizerName;

    for (const delta of calculateRankingDeltas(tournament)) {
      const entry = byUser.get(delta.userId) || {
        userId: delta.userId,
        displayName: delta.displayName || '',
        isAnonymous: !!delta.isAnonymous,
        anonymousKey: delta.anonymousKey || '',
        points: 0,
        tournamentsPlayed: 0,
      };
      entry.displayName = delta.displayName || entry.displayName;
      entry.points += delta.points || 0;
      entry.tournamentsPlayed += 1;
      byUser.set(delta.userId, entry);
    }
  }

  await userRepository.replaceOrganizerRanking(organizerId, organizerName, [...byUser.values()]);
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
  updateRankingSnapshot(tournament);
  const saved = await save(tournament);
  await rebuildOrganizerRanking(tournament.organizerId);
  return saved;
}

async function save(tournament) {
  return tournamentRepository.saveTournament(tournament);
}

module.exports = {
  listTournaments,
  getTournament,
  createTournament,
  addPlayer,
  addModerator,
  removeModerator,
  removePlayer,
  setPlayerScore,
  handleJoinRequest,
  startTournament,
  listOrganizerPlayerSuggestions,
  addRound,
  removeRound,
  deleteTournament,
  replaceRoundTables,
  updateTablePlayer,
  adjustTableScores,
  adjustRoundScores,
  adjustTournamentScores,
  applyRoundChanges,
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
  appealPlayerDiscipline,
  finalizeTournamentResults,
  ensureOrganizerRankingsCurrent,
  rebuildAllOrganizerRankings,
};
