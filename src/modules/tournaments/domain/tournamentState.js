const ApiError = require('../../../shared/http/ApiError');

function findRound(tournament, roundId) {
  const round = tournament.rounds.find(r => r.id === roundId);
  if (!round) throw ApiError.notFound('Ronda no encontrada');
  return round;
}

function findTable(round, tableId) {
  const table = round.tables.find(t => t.id === tableId);
  if (!table) throw ApiError.notFound('Mesa no encontrada');
  return table;
}

function findTablePlayer(table, userId) {
  const player = table.players.find(p => p.userId === userId);
  if (!player) throw ApiError.notFound('Jugador no encontrado en la mesa');
  return player;
}

function assertStatus(entity, allowedStatuses, message) {
  if (!allowedStatuses.includes(entity.status)) throw ApiError.badRequest(message);
}

function normalizeNonNegativeInt(value) {
  const parsed = parseInt(value, 10);
  if (Number.isNaN(parsed)) return 0;
  return Math.max(0, parsed);
}

module.exports = {
  findRound,
  findTable,
  findTablePlayer,
  assertStatus,
  normalizeNonNegativeInt,
};
