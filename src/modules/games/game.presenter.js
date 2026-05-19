function presentGame(game) {
  return {
    id: game._id || game.id,
    name: game.name,
    aliases: game.aliases || [],
    formats: (game.formats || []).map(format => ({
      id: format.id,
      name: format.name,
    })),
  };
}

function presentGames(games) {
  return (games || []).map(presentGame);
}

module.exports = {
  presentGame,
  presentGames,
};
