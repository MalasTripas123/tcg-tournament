const gameRepository = require('./game.repository');

async function listGames() {
  return gameRepository.findActive();
}

module.exports = {
  listGames,
};
