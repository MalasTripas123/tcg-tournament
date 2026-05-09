const ApiError = require('../../../shared/http/ApiError');
const { normalizeNonNegativeInt } = require('./tournamentState');

function sameMembers(a, b) {
  if (a.length !== b.length) return false;
  const left = [...a].sort();
  const right = [...b].sort();
  return left.every((value, index) => value === right[index]);
}

function validateAndRebuildTables(currentTables, incomingTables, tournamentPlayers = []) {
  if (!Array.isArray(incomingTables)) throw ApiError.badRequest('Se esperaba un array de mesas');

  const currentByTableId = new Map(currentTables.map(table => [table.id, table]));
  const currentPlayersById = new Map();
  const tournamentPlayerById = new Map(tournamentPlayers.map(player => [player.userId, player]));
  const expectedPlayerIds = [];

  for (const table of currentTables) {
    for (const player of table.players) {
      currentPlayersById.set(player.userId, player);
      expectedPlayerIds.push(player.userId);
    }
  }

  const incomingPlayerIds = [];
  for (const table of incomingTables) {
    if (!currentByTableId.has(table.id)) throw ApiError.badRequest('Mesa invalida');
    if (!Array.isArray(table.players)) throw ApiError.badRequest('Cada mesa debe incluir jugadores');
    for (const player of table.players) incomingPlayerIds.push(player.userId);
  }

  if (!sameMembers(expectedPlayerIds, incomingPlayerIds)) {
    throw ApiError.badRequest('Las mesas deben conservar exactamente los mismos jugadores');
  }

  return incomingTables.map(incomingTable => {
    const currentTable = currentByTableId.get(incomingTable.id);
    const isBench = currentTable.type === 'bench';
    return {
      ...currentTable,
      players: incomingTable.players.map(player => {
        const tournamentPlayer = tournamentPlayerById.get(player.userId);
        if (!isBench && tournamentPlayer?.eliminatedFromTournament) {
          throw ApiError.badRequest('Un jugador descalificado debe permanecer en la banca');
        }
        return { ...currentPlayersById.get(player.userId) };
      }),
    };
  });
}

function mergePlayerScores(currentPlayers, incomingPlayers = []) {
  const incomingById = new Map(
    incomingPlayers
      .filter(player => player && typeof player.userId === 'string')
      .map(player => [player.userId, player])
  );

  return currentPlayers.map(currentPlayer => {
    const incoming = incomingById.get(currentPlayer.userId);
    if (!incoming) return currentPlayer;
    return {
      ...currentPlayer,
      score: normalizeNonNegativeInt(incoming.score),
      eliminated: incoming.eliminated !== undefined ? !!incoming.eliminated : !!currentPlayer.eliminated,
    };
  });
}

module.exports = {
  validateAndRebuildTables,
  mergePlayerScores,
};
