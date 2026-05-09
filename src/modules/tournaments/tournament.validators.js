const ApiError = require('../../shared/http/ApiError');

const VISIBILITY = new Set(['public', 'approval', 'private']);
const PRIZE_TYPES = new Set(['text', 'card']);
const RESULTS = new Set(['winner', 'draw', 'none']);
const PAIRING_METHODS = new Set(['snake', 'random', 'balanced']);

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

function validatePrizes(prizes) {
  if (!Array.isArray(prizes)) return [];
  if (prizes.length > 20) throw ApiError.badRequest('Demasiados premios');
  return prizes.map(prize => {
    const type = PRIZE_TYPES.has(prize?.type) ? prize.type : null;
    if (!type) throw ApiError.badRequest('Tipo de premio invalido');
    return {
      type,
      value: optionalString(prize.value, 180),
      imageUrl: optionalString(prize.imageUrl, 600),
    };
  });
}

function validateCreateTournament(req) {
  const visibility = req.body.visibility || 'public';
  if (!VISIBILITY.has(visibility)) throw ApiError.badRequest('Visibilidad invalida');

  return {
    body: {
      name: asString(req.body.name, 'Nombre', 140),
      totalRounds: asInt(req.body.totalRounds, 'Rondas', 1, 20),
      roundDuration: asInt(req.body.roundDuration, 'Duracion', 0, 240, 50),
      visibility,
      pairingMethod: PAIRING_METHODS.has(req.body.pairingMethod) ? req.body.pairingMethod : 'snake',
      prizes: validatePrizes(req.body.prizes),
    },
  };
}

function validateAddPlayer(req) {
  return {
    body: {
      userId: typeof req.body.userId === 'string' ? req.body.userId.trim() : null,
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
  if (req.body.roundDuration !== undefined) body.roundDuration = asInt(req.body.roundDuration, 'Duracion', 0, 240);
  if (!Object.keys(body).length) throw ApiError.badRequest('No hay cambios para aplicar');
  return { body };
}

function validateTournamentPlayerStatus(req) {
  const body = {};
  if (req.body.score !== undefined) body.score = asInt(req.body.score, 'Puntaje', 0, 999);
  if (req.body.disqualified !== undefined) body.disqualified = !!req.body.disqualified;
  if (!Object.keys(body).length) throw ApiError.badRequest('No hay cambios para aplicar');
  return { body };
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
    body.timeLimitMinutes = asInt(req.body.timeLimitMinutes, 'Tiempo limite', 0, 240);
  }
  if (req.body.deltaMinutes !== undefined) {
    body.deltaMinutes = asInt(req.body.deltaMinutes, 'Ajuste de tiempo', -240, 240);
  }
  if (!Object.keys(body).length) throw ApiError.badRequest('No hay cambios para aplicar');
  return { body };
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
  validateTournamentPlayerStatus,
  validateReplaceTables,
  validateUpdateTablePlayer,
  validateFinishTable,
  validateFinishRound,
  validateRoundTime,
  validateRoundEditing,
};
