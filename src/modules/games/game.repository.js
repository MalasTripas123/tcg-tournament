const Game = require('./game.model');

async function findActive() {
  return Game.find({ active: true }).sort({ sortOrder: 1, name: 1 }).lean();
}

async function findById(id) {
  if (!id) return null;
  return Game.findOne({ _id: id, active: true }).lean();
}

async function upsertGames(games) {
  if (!Array.isArray(games) || !games.length) return { matchedCount: 0, modifiedCount: 0, upsertedCount: 0 };
  const operations = games.map(game => ({
    updateOne: {
      filter: { _id: game._id },
      update: { $set: game },
      upsert: true,
    },
  }));
  return Game.bulkWrite(operations, { ordered: false });
}

module.exports = {
  findActive,
  findById,
  upsertGames,
};
