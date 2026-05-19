const ApiError = require('../../shared/http/ApiError');

const VISIBILITY = new Set(['public', 'approval', 'private']);
const PRIZE_TYPES = new Set(['text', 'card', 'credit']);
const RESULTS = new Set(['winner', 'draw', 'none']);
const PAIRING_METHODS = new Set(['snake', 'random', 'balanced']);
const TABLE_MODES = new Set(['multi', 'versus']);
const MAX_ROUND_DURATION_MINUTES = 9999;

function asString(value, field, max = 160) {
  if (typeof value !== 'string' || !value.trim()) throw ApiError.badRequest(`${field} es requerido`);
  const trimmed = value.trim();
  if (trimmed.length > max) throw ApiError.badRequest(`${field} es demasiado largo`);
  return trimmed;
}

function optionalString(value, max = 300) {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') throw ApiError.badRequest('Valor invalido');
  return value.trim().slice(0, max);
}

function asInt(value, field, min, max, fallback) {
  const parsed = parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    if (fallback !== undefined) return fallback;
    throw ApiError.badRequest(`${field} debe ser numerico`);
  }
  if (parsed < min || parsed > max) throw ApiError.badRequest(`${field} esta fuera de rango`);
  return parsed;
}

function optionalInt(value, field, min, max) {
  if (value === undefined || value === null || value === '') return null;
  return asInt(value, field, min, max);
}

function optionalTimestamp(value) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number.isFinite(Number(value)) ? Number(value) : Date.parse(String(value));
  if (!Number.isFinite(parsed) || parsed < 0) throw ApiError.badRequest('Fecha de inicio invalida');
  return parsed;
}

function optionalBoolean(value, field) {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw ApiError.badRequest(`${field} es invalido`);
}

function validatePrizes(prizes) {
  if (!Array.isArray(prizes)) return [];
  if (prizes.length > 20) throw ApiError.badRequest('Demasiados premios');
  return prizes.map(prize => {
    const type = PRIZE_TYPES.has(prize?.type) ? prize.type : null;
    if (!type) throw ApiError.badRequest('Tipo de premio invalido');
    if (type === 'credit') {
      const creditCount = asInt(prize.creditCount, 'Creditos', 1, 999);
      const creditValue = asInt(prize.creditValue, 'Valor del credito', 0, 999999999);
      const distribution = Array.isArray(prize.distribution) ? prize.distribution : [];
      if (!distribution.length) throw ApiError.badRequest('La reparticion de creditos es requerida');
      const parsedDistribution = distribution.map((entry, index) => ({
        place: index + 1,
        credits: asInt(entry?.credits, 'Creditos por puesto', 0, creditCount),
      })).filter(entry => entry.credits > 0);
      const totalCredits = parsedDistribution.reduce((sum, entry) => sum + entry.credits, 0);
      if (totalCredits !== creditCount) throw ApiError.badRequest('La reparticion debe sumar todos los creditos');
      return {
        type,
        value: optionalString(prize.value, 180),
        imageUrl: '',
        creditCount,
        creditValue,
        distribution: parsedDistribution.map(entry => ({
          ...entry,
          percentage: Math.round((entry.credits / creditCount) * 10000) / 100,
        })),
      };
    }
    return {
      type,
      value: optionalString(prize.value, 180),
      imageUrl: optionalString(prize.imageUrl, 600),
      creditCount: 0,
      creditValue: 0,
      distribution: [],
    };
  });
}

function validateCreateTournament(req) {
  const visibility = req.body.visibility || 'public';
  if (!VISIBILITY.has(visibility)) throw ApiError.badRequest('Visibilidad invalida');
  const minPlayers = optionalInt(req.body.minPlayers, 'Minimo de jugadores', 2, 999);
  const maxPlayers = optionalInt(req.body.maxPlayers, 'Maximo de jugadores', 2, 999);
  if (minPlayers !== null && maxPlayers !== null && minPlayers > maxPlayers) {
    throw ApiError.badRequest('El minimo no puede superar el maximo de jugadores');
  }

  return {
    body: {
      name: asString(req.body.name, 'Nombre', 140),
      bannerUrl: optionalString(req.body.bannerUrl, 600),
      gameId: optionalString(req.body.gameId, 120),
      gameFormatId: optionalString(req.body.gameFormatId, 120),
      scheduledStartAt: optionalTimestamp(req.body.scheduledStartAt),
      totalRounds: asInt(req.body.totalRounds, 'Rondas', 1, 20),
      roundDuration: asInt(req.body.roundDuration, 'Duracion', 0, MAX_ROUND_DURATION_MINUTES, 50),
      minPlayers,
      maxPlayers,
      isRanked: optionalBoolean(req.body.isRanked, 'Tipo de torneo'),
      visibility,
      pairingMethod: PAIRING_METHODS.has(req.body.pairingMethod) ? req.body.pairingMethod : 'snake',
      tableMode: TABLE_MODES.has(req.body.tableMode) ? req.body.tableMode : 'multi',
      prizes: validatePrizes(req.body.prizes),
    },
  };
}

function validateAddPlayer(req) {
  const userId = typeof req.body.userId === 'string' ? req.body.userId.trim() : '';
  const anonymousName = typeof req.body.anonymousName === 'string' ? req.body.anonymousName.trim().replace(/\s+/g, ' ') : '';
  if (userId && anonymousName) throw ApiError.badRequest('Elige un jugador registrado o anonimo, no ambos');
  if (!userId && !anonymousName) throw ApiError.badRequest('Jugador requerido');
  if (anonymousName && anonymousName.length > 80) throw ApiError.badRequest('Nombre anonimo demasiado largo');
  return {
    body: {
      userId: userId || null,
      anonymousName: anonymousName || null,
    },
  };
}

function validatePatchScore(req) {
  return {
    body: {
      score: asInt(req.body.score, 'Puntaje', 0, 999),
    },
  };
}

function validateJoinRequestAction(req) {
  const action = req.body.action;
  if (!['accept', 'reject'].includes(action)) throw ApiError.badRequest('Accion invalida');
  return { body: { action } };
}

function validateInvitationAction(req) {
  const action = req.body.action;
  if (!['accept', 'reject'].includes(action)) throw ApiError.badRequest('Accion invalida');
  return { body: { action } };
}

function validateTournamentSettings(req) {
  const body = {};
  if (req.body.pairingMethod !== undefined) {
    if (!PAIRING_METHODS.has(req.body.pairingMethod)) throw ApiError.badRequest('Metodo de emparejamiento invalido');
    body.pairingMethod = req.body.pairingMethod;
  }
  if (req.body.tableMode !== undefined) {
    if (!TABLE_MODES.has(req.body.tableMode)) throw ApiError.badRequest('Modo de mesas invalido');
    body.tableMode = req.body.tableMode;
  }
  if (req.body.roundDuration !== undefined) body.roundDuration = asInt(req.body.roundDuration, 'Duracion', 0, MAX_ROUND_DURATION_MINUTES);
  if (req.body.totalRounds !== undefined) body.totalRounds = asInt(req.body.totalRounds, 'Rondas', 1, 20);
  if (req.body.scheduledStartAt !== undefined) body.scheduledStartAt = optionalTimestamp(req.body.scheduledStartAt);
  if (req.body.minPlayers !== undefined) body.minPlayers = optionalInt(req.body.minPlayers, 'Minimo de jugadores', 2, 999);
  if (req.body.maxPlayers !== undefined) body.maxPlayers = optionalInt(req.body.maxPlayers, 'Maximo de jugadores', 2, 999);
  if (body.minPlayers !== undefined && body.maxPlayers !== undefined && body.minPlayers !== null && body.maxPlayers !== null && body.minPlayers > body.maxPlayers) {
    throw ApiError.badRequest('El minimo no puede superar el maximo de jugadores');
  }
  if (req.body.bannerUrl !== undefined) body.bannerUrl = optionalString(req.body.bannerUrl, 600);
  if (req.body.gameId !== undefined) body.gameId = optionalString(req.body.gameId, 120);
  if (req.body.gameFormatId !== undefined) body.gameFormatId = optionalString(req.body.gameFormatId, 120);
  if (!Object.keys(body).length) throw ApiError.badRequest('No hay cambios para aplicar');
  return { body };
}

function validateTournamentPlayerStatus(req) {
  const body = {};
  if (req.body.score !== undefined) body.score = asInt(req.body.score, 'Puntaje', 0, 999);
  if (req.body.disqualified !== undefined) body.disqualified = !!req.body.disqualified;
  if (req.body.yellowCards !== undefined) body.yellowCards = asInt(req.body.yellowCards, 'Tarjetas amarillas', 0, 2);
  if (req.body.redCard !== undefined) body.redCard = !!req.body.redCard;
  if (!Object.keys(body).length) throw ApiError.badRequest('No hay cambios para aplicar');
  return { body };
}

function validateModerator(req) {
  return {
    body: {
      userId: typeof req.body.userId === 'string' ? req.body.userId.trim() : '',
    },
  };
}

function validateScoreDelta(req) {
  return {
    body: {
      delta: asInt(req.body.delta, 'Ajuste de puntos', -999, 999),
    },
  };
}

function validateAppeal(req) {
  return {
    body: {
      reason: optionalString(req.body.reason, 600),
    },
  };
}

function validateReplaceTables(req) {
  if (!Array.isArray(req.body.tables)) throw ApiError.badRequest('Se esperaba un array de mesas');
  return { body: { tables: req.body.tables } };
}

function validateUpdateTablePlayer(req) {
  const body = {};
  if (req.body.score !== undefined) body.score = asInt(req.body.score, 'Puntaje', 0, 999);
  if (req.body.eliminated !== undefined) body.eliminated = !!req.body.eliminated;
  if (!Object.keys(body).length) throw ApiError.badRequest('No hay cambios para aplicar');
  return { body };
}

function validateRoundChanges(req) {
  const incomingChanges = Array.isArray(req.body.changes) ? req.body.changes : [];
  if (!incomingChanges.length) throw ApiError.badRequest('No hay cambios para aplicar');
  if (incomingChanges.length > 200) throw ApiError.badRequest('Demasiados cambios en una sola operacion');

  const changes = incomingChanges.map(change => {
    if (change?.type === 'tables') {
      if (!Array.isArray(change.tables)) throw ApiError.badRequest('Mesas invalidas');
      return { type: 'tables', tables: change.tables };
    }

    if (change?.type === 'tablePlayer') {
      const tableId = typeof change.tableId === 'string' ? change.tableId : '';
      const userId = typeof change.userId === 'string' ? change.userId : '';
      if (!tableId || !userId) throw ApiError.badRequest('Cambio de jugador invalido');
      const parsed = { type: 'tablePlayer', tableId, userId };
      if (change.score !== undefined) parsed.score = asInt(change.score, 'Puntaje', 0, 999);
      if (change.eliminated !== undefined) parsed.eliminated = !!change.eliminated;
      if (parsed.score === undefined && parsed.eliminated === undefined) {
        throw ApiError.badRequest('Cambio de jugador vacio');
      }
      return parsed;
    }

    if (change?.type === 'playerScore') {
      const userId = typeof change.userId === 'string' ? change.userId : '';
      if (!userId) throw ApiError.badRequest('Jugador invalido');
      return {
        type: 'playerScore',
        userId,
        score: asInt(change.score, 'Puntaje', 0, 999),
      };
    }

    throw ApiError.badRequest('Tipo de cambio invalido');
  });

  return { body: { changes } };
}

function validateFinishTable(req) {
  const result = req.body.result || 'none';
  if (!RESULTS.has(result)) throw ApiError.badRequest('Resultado invalido');
  return {
    body: {
      players: Array.isArray(req.body.players) ? req.body.players : [],
      result,
      winnerUserId: typeof req.body.winnerUserId === 'string' ? req.body.winnerUserId : null,
      drawUserIds: Array.isArray(req.body.drawUserIds) ? req.body.drawUserIds.filter(id => typeof id === 'string') : [],
    },
  };
}

function validateFinishRound(req) {
  return {
    body: {
      tables: Array.isArray(req.body.tables) ? req.body.tables.map(table => {
        const result = table?.result || 'none';
        if (!RESULTS.has(result)) throw ApiError.badRequest('Resultado invalido');
        return {
          id: typeof table.id === 'string' ? table.id : '',
          players: Array.isArray(table.players) ? table.players : [],
          result,
          winnerUserId: typeof table.winnerUserId === 'string' ? table.winnerUserId : null,
          drawUserIds: Array.isArray(table.drawUserIds) ? table.drawUserIds.filter(id => typeof id === 'string') : [],
        };
      }) : [],
    },
  };
}

function validateRoundTime(req) {
  const body = {};
  if (req.body.timeLimitMinutes !== undefined) {
    body.timeLimitMinutes = asInt(req.body.timeLimitMinutes, 'Tiempo limite', 0, MAX_ROUND_DURATION_MINUTES);
  }
  if (req.body.deltaMinutes !== undefined) {
    body.deltaMinutes = asInt(req.body.deltaMinutes, 'Ajuste de tiempo', -MAX_ROUND_DURATION_MINUTES, MAX_ROUND_DURATION_MINUTES);
  }
  if (!Object.keys(body).length) throw ApiError.badRequest('No hay cambios para aplicar');
  return { body };
}

function validateDeleteTournament(req) {
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  if (!password) throw ApiError.badRequest('Clave requerida');
  return {
    body: {
      password,
      reason: optionalString(req.body.reason, 600),
    },
  };
}

function validateRoundEditing(req) {
  if (req.body.unlocked === undefined) throw ApiError.badRequest('Estado de bloqueo requerido');
  return { body: { unlocked: !!req.body.unlocked } };
}

module.exports = {
  validateCreateTournament,
  validateAddPlayer,
  validatePatchScore,
  validateJoinRequestAction,
  validateInvitationAction,
  validateTournamentSettings,
  validateModerator,
  validateTournamentPlayerStatus,
  validateScoreDelta,
  validateAppeal,
  validateReplaceTables,
  validateUpdateTablePlayer,
  validateRoundChanges,
  validateFinishTable,
  validateFinishRound,
  validateRoundTime,
  validateDeleteTournament,
  validateRoundEditing,
};
