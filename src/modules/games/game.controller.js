const { ok } = require('../../shared/http/responses');
const gameService = require('./game.service');
const { presentGames } = require('./game.presenter');

async function list(req, res) {
  const games = await gameService.listGames();
  return ok(res, presentGames(games));
}

module.exports = {
  list,
};
