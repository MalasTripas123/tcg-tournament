// routes/tournaments.js
const express = require('express');
const router  = express.Router();
const { v4: uuidv4 } = require('uuid');
const {
  getAllTournaments,
  getTournamentById,
  createTournament,
  saveTournament,
  getUserById,
  searchUsers,
} = require('../lib/store');
const { generateRound } = require('../lib/matchmaking');

// ─── MIDDLEWARE ───────────────────────────────────────────────────

function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'Debes iniciar sesión' });
  next();
}

// Carga el torneo y verifica que el usuario sea el organizador
async function requireOrganizer(req, res, next) {
  try {
    const tournament = await getTournamentById(req.params.id);
    if (!tournament) return res.status(404).json({ error: 'Torneo no encontrado' });
    if (tournament.organizerId !== req.session.userId) {
      return res.status(403).json({ error: 'Solo el organizador puede realizar esta acción' });
    }
    req.tournament = tournament;
    next();
  } catch (e) { res.status(500).json({ error: e.message }); }
}

// ─── TORNEOS ─────────────────────────────────────────────────────

router.get('/', async (req, res) => {
  try {
    let list = await getAllTournaments();
    if (req.query.q) {
      const ql = req.query.q.toLowerCase();
      list = list.filter(t => t.name.toLowerCase().includes(ql));
    }
    res.json(list.map(t => sanitize(t)));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/:id', async (req, res) => {
  try {
    const t = await getTournamentById(req.params.id);
    if (!t) return res.status(404).json({ error: 'Torneo no encontrado' });
    const isOrganizer = !!(req.session.userId && t.organizerId === req.session.userId);
    res.json({ ...sanitize(t), isOrganizer });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/', requireAuth, async (req, res) => {
  try {
    const { name, totalRounds, roundDuration, prizes, visibility } = req.body;
    if (!name || !totalRounds) return res.status(400).json({ error: 'Nombre y rondas requeridos' });
    const t = await createTournament({ name, totalRounds, roundDuration, prizes: prizes || [], visibility }, req.session.userId);
    res.status(201).json(sanitize(t));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── JUGADORES ────────────────────────────────────────────────────

router.post('/:id/players', requireAuth, async (req, res) => {
  try {
    const t = await getTournamentById(req.params.id);
    if (!t) return res.status(404).json({ error: 'Torneo no encontrado' });
    if (t.status !== 'lobby') return res.status(400).json({ error: 'El torneo ya comenzó' });

    const isOrg = t.organizerId === req.session.userId;
    const targetUid = isOrg ? req.body.userId : req.session.userId;
    const user = await getUserById(targetUid);
    if (!user) return res.status(404).json({ error: 'Jugador no encontrado' });
    if (t.players.find(p => p.userId === targetUid)) return res.status(409).json({ error: 'El jugador ya está en el torneo' });

    if (isOrg) {
      t.players.push(_playerEntry(user));
      return res.json(sanitize(await saveTournament(t)));
    }
    if (t.visibility === 'private') return res.status(403).json({ error: 'Este torneo es privado' });
    if (t.visibility === 'approval') {
      if (t.joinRequests.find(r => r.userId === targetUid && r.status === 'pending')) {
        return res.status(409).json({ error: 'Ya tienes una solicitud pendiente' });
      }
      t.joinRequests.push({ userId: targetUid, displayName: user.displayName, status: 'pending', requestedAt: Date.now() });
      await saveTournament(t);
      return res.json({ ok: true, requested: true, message: 'Solicitud enviada. El organizador debe aceptarla.' });
    }
    t.players.push(_playerEntry(user));
    res.json(sanitize(await saveTournament(t)));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id/players/:userId', requireAuth, requireOrganizer, async (req, res) => {
  try {
    const t = req.tournament;
    if (t.status !== 'lobby') return res.status(400).json({ error: 'No se puede quitar jugadores con el torneo activo' });
    t.players = t.players.filter(p => p.userId !== req.params.userId);
    res.json(sanitize(await saveTournament(t)));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.patch('/:id/players/:userId/score', requireAuth, requireOrganizer, async (req, res) => {
  try {
    const t = req.tournament;
    const player = t.players.find(p => p.userId === req.params.userId);
    if (!player) return res.status(404).json({ error: 'Jugador no encontrado' });
    player.score = Math.max(0, parseInt(req.body.score) || 0);
    res.json(sanitize(await saveTournament(t)));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── SOLICITUDES DE INGRESO ───────────────────────────────────────

router.patch('/:id/join-requests/:userId', requireAuth, requireOrganizer, async (req, res) => {
  try {
    const t = req.tournament;
    const request = t.joinRequests.find(r => r.userId === req.params.userId && r.status === 'pending');
    if (!request) return res.status(404).json({ error: 'Solicitud no encontrada' });
    const { action } = req.body;
    request.status = action === 'accept' ? 'accepted' : 'rejected';
    if (action === 'accept') {
      const user = await getUserById(request.userId);
      if (user && !t.players.find(p => p.userId === user.uid)) t.players.push(_playerEntry(user));
    }
    res.json(sanitize(await saveTournament(t)));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── INICIO DEL TORNEO ────────────────────────────────────────────

router.post('/:id/start', requireAuth, requireOrganizer, async (req, res) => {
  try {
    const t = req.tournament;
    if (t.status !== 'lobby') return res.status(400).json({ error: 'El torneo ya está en curso o finalizado' });
    if (t.players.length < 2) return res.status(400).json({ error: 'Se necesitan al menos 2 jugadores' });
    t.status = 'active';
    t.currentRound = 1;
    const tables = generateRound(t.players, 1);
    for (const tbl of tables) tbl.status = 'pending';
    t.rounds.push({ id: uuidv4(), number: 1, tables, startTime: null, endTime: null, status: 'pending' });
    res.json(sanitize(await saveTournament(t)));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── MESAS ────────────────────────────────────────────────────────

router.put('/:id/rounds/:roundId/tables', requireAuth, requireOrganizer, async (req, res) => {
  try {
    const t = req.tournament;
    const round = t.rounds.find(r => r.id === req.params.roundId);
    if (!round) return res.status(404).json({ error: 'Ronda no encontrada' });
    if (!['pending','active'].includes(round.status)) return res.status(400).json({ error: 'Solo rondas activas o pendientes' });
    if (!Array.isArray(req.body.tables)) return res.status(400).json({ error: 'Se esperaba un array de mesas' });
    round.tables = req.body.tables;
    res.json(sanitize(await saveTournament(t)));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.patch('/:id/rounds/:roundId/tables/:tableId/players/:userId', requireAuth, requireOrganizer, async (req, res) => {
  try {
    const t = req.tournament;
    const round  = t.rounds.find(r => r.id === req.params.roundId);
    if (!round) return res.status(404).json({ error: 'Ronda no encontrada' });
    const table  = round.tables.find(tb => tb.id === req.params.tableId);
    if (!table) return res.status(404).json({ error: 'Mesa no encontrada' });
    const player = table.players.find(p => p.userId === req.params.userId);
    if (!player) return res.status(404).json({ error: 'Jugador no encontrado en la mesa' });
    const { score, eliminated } = req.body;
    if (score !== undefined) player.score = Math.max(0, parseInt(score) || 0);
    if (eliminated !== undefined) player.eliminated = !!eliminated;
    res.json(sanitize(await saveTournament(t)));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── TERMINAR MESA ────────────────────────────────────────────────

router.post('/:id/rounds/:roundId/tables/:tableId/finish', requireAuth, requireOrganizer, async (req, res) => {
  try {
    const t = req.tournament;
    const round = t.rounds.find(r => r.id === req.params.roundId);
    if (!round) return res.status(404).json({ error: 'Ronda no encontrada' });
    const table = round.tables.find(tb => tb.id === req.params.tableId);
    if (!table) return res.status(404).json({ error: 'Mesa no encontrada' });
    if (table.status === 'finished') return res.status(400).json({ error: 'La mesa ya finalizó' });

    if (Array.isArray(req.body.players)) table.players = req.body.players;
    table.endTime = Date.now();
    table.status  = 'finished';

    const { result, winnerUserId, drawUserIds } = req.body;
    if (result === 'winner' && winnerUserId) {
      const w = table.players.find(p => p.userId === winnerUserId);
      table.winner = w ? { userId: w.userId, displayName: w.displayName } : null;
      table.result = 'winner';
    } else if (result === 'draw' && Array.isArray(drawUserIds) && drawUserIds.length) {
      table.drawPlayers = table.players.filter(p => drawUserIds.includes(p.userId)).map(p => ({ userId: p.userId, displayName: p.displayName }));
      table.result = 'draw';
    } else {
      table.result = 'none';
      table.winner = null;
    }

    if (round.tables.every(tb => tb.status === 'finished')) {
      round.endTime = Date.now();
      round.status  = 'finished';
      _accumulateRoundScores(t, round);
      _prepareNextRound(t);
    }
    res.json(sanitize(await saveTournament(t)));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── ACTIVAR RONDA ────────────────────────────────────────────────

router.post('/:id/rounds/:roundId/activate', requireAuth, requireOrganizer, async (req, res) => {
  try {
    const t = req.tournament;
    const round = t.rounds.find(r => r.id === req.params.roundId);
    if (!round) return res.status(404).json({ error: 'Ronda no encontrada' });
    if (round.status !== 'pending') return res.status(400).json({ error: 'La ronda no está pendiente' });
    const now = Date.now();
    round.status = 'active';
    round.startTime = now;
    for (const table of round.tables) { table.startTime = now; table.status = 'active'; }
    res.json(sanitize(await saveTournament(t)));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── TERMINAR RONDA ───────────────────────────────────────────────

router.post('/:id/rounds/:roundId/finish', requireAuth, requireOrganizer, async (req, res) => {
  try {
    const t = req.tournament;
    const round = t.rounds.find(r => r.id === req.params.roundId);
    if (!round) return res.status(404).json({ error: 'Ronda no encontrada' });
    if (round.status === 'finished') return res.status(400).json({ error: 'La ronda ya finalizó' });

    const now = Date.now();
    if (Array.isArray(req.body.tables)) {
      for (const bodyTable of req.body.tables) {
        const tbl = round.tables.find(tb => tb.id === bodyTable.id);
        if (!tbl || tbl.status === 'finished') continue;
        if (Array.isArray(bodyTable.players)) tbl.players = bodyTable.players;
        tbl.endTime = now; tbl.status = 'finished';
        if (!tbl.result || tbl.result === 'none') {
          const active = tbl.players.filter(p => !p.eliminated);
          if (active.length) {
            const max = Math.max(...active.map(p => p.score || 0));
            const top = active.filter(p => (p.score||0) === max);
            if (top.length === 1) { tbl.winner = { userId: top[0].userId, displayName: top[0].displayName }; tbl.result = 'winner'; }
            else { tbl.drawPlayers = top.map(p => ({ userId: p.userId, displayName: p.displayName })); tbl.result = 'draw'; }
          } else { tbl.result = 'none'; }
        }
      }
    }
    for (const tbl of round.tables) {
      if (tbl.status !== 'finished') { tbl.endTime = now; tbl.status = 'finished'; tbl.result = tbl.result || 'none'; }
    }
    round.endTime = now; round.status = 'finished';
    _accumulateRoundScores(t, round);
    _prepareNextRound(t);
    res.json(sanitize(await saveTournament(t)));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── HELPERS INTERNOS ─────────────────────────────────────────────

function _playerEntry(user) {
  return { userId: user.uid, displayName: user.displayName, score: 0, wins: 0, losses: 0, draws: 0, eliminatedFromTournament: false };
}

function _accumulateRoundScores(t, round) {
  for (const table of round.tables) {
    for (const tp of table.players) {
      const gp = t.players.find(p => p.userId === tp.userId);
      if (!gp) continue;
      gp.score = (gp.score || 0) + (tp.score || 0);
      if (table.result === 'winner' && table.winner?.userId === tp.userId) gp.wins = (gp.wins||0) + 1;
      else if (table.result === 'draw' && table.drawPlayers?.some(d => d.userId === tp.userId)) gp.draws = (gp.draws||0) + 1;
      else if (!tp.eliminated) gp.losses = (gp.losses||0) + 1;
    }
  }
}

function _prepareNextRound(t) {
  if (t.currentRound >= t.totalRounds) {
    t.status = 'finished';
  } else {
    t.currentRound += 1;
    const nextTables = generateRound(t.players, t.currentRound);
    for (const tbl of nextTables) tbl.status = 'pending';
    t.rounds.push({ id: uuidv4(), number: t.currentRound, tables: nextTables, startTime: null, endTime: null, status: 'pending' });
  }
}

function sanitize(t) {
  return {
    id:           t._id || t.id,
    name:         t.name,
    organizerId:  t.organizerId,
    organizerName:t.organizerName,
    totalRounds:  t.totalRounds,
    roundDuration:t.roundDuration,
    status:       t.status,
    visibility:   t.visibility || 'public',
    isRanked:     t.isRanked,
    prizes:       t.prizes,
    players:      t.players,
    joinRequests: t.joinRequests || [],
    rounds:       t.rounds,
    currentRound: t.currentRound,
    createdAt:    t.createdAt,
  };
}

module.exports = router;
