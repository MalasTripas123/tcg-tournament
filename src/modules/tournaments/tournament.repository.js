const Tournament = require('./tournament.model');
const { createId } = require('../../shared/utils/ids');

async function findAll() {
  const order = { active: 0, lobby: 1, finished: 2 };
  const tournaments = await Tournament.find({ deletedAt: null }).lean();
  return tournaments.sort((a, b) => (order[a.status] ?? 3) - (order[b.status] ?? 3));
}

async function findById(id) {
  if (!id) return null;
  return Tournament.findOne({ _id: id, deletedAt: null }).lean();
}

async function createTournament(data) {
  const tournament = await Tournament.create({ _id: createId(), ...data });
  return tournament.toObject();
}

async function saveTournament(tournament) {
  const id = tournament._id || tournament.id;
  const payload = { ...tournament };
  delete payload.id;
  const updated = await Tournament.findByIdAndUpdate(
    id,
    payload,
    { new: true, overwrite: true, runValidators: true }
  ).lean();
  return updated;
}

module.exports = {
  findAll,
  findById,
  createTournament,
  saveTournament,
};
