const User = require('./user.model');
const { createId } = require('../../shared/utils/ids');
const { escapeRegex } = require('../../shared/utils/escapeRegex');

async function countUsers() {
  return User.countDocuments();
}

async function insertUsers(users) {
  return User.insertMany(users);
}

async function findByUid(uid) {
  if (!uid) return null;
  return User.findOne({ uid }).lean();
}

async function findByPublicId(publicId) {
  if (typeof publicId !== 'string' || !publicId.trim()) return null;
  const value = publicId.trim().toLowerCase();
  return User.findOne({
    $or: [
      { uid: publicId.trim() },
      { username: value },
    ],
  }).lean();
}

async function findByUsername(username) {
  if (typeof username !== 'string') return null;
  return User.findOne({ username: username.toLowerCase().trim() }).lean();
}

async function searchUsers(query, limit = 10) {
  const q = String(query || '').trim();
  if (q.length < 2) return [];
  const pattern = new RegExp(escapeRegex(q), 'i');
  return User.find({
    $or: [
      { displayName: pattern },
      { username: pattern },
    ],
  }).limit(limit).lean();
}

async function createUser(data) {
  const user = await User.create({ uid: createId(), ...data });
  return user.toObject();
}

async function updateInvitationPolicy(uid, invitationPolicy) {
  return User.findOneAndUpdate(
    { uid },
    { $set: { invitationPolicy } },
    { new: true, runValidators: true }
  ).lean();
}

async function applyRankingDeltas(organizerId, organizerName, deltas) {
  for (const delta of deltas) {
    const user = await User.findOne({ uid: delta.userId });
    if (!user) continue;

    user.rankings = user.rankings || [];
    let ranking = user.rankings.find(entry => entry.organizerId === organizerId);
    if (!ranking) {
      ranking = { organizerId, organizerName, points: 0, tournamentsPlayed: 0 };
      user.rankings.push(ranking);
    }
    ranking.organizerName = organizerName;
    ranking.points = (ranking.points || 0) + delta.points;
    ranking.tournamentsPlayed = Math.max(0, (ranking.tournamentsPlayed || 0) + (delta.countTournament || 0));
    await user.save();
  }
}

async function findRankingByOrganizer(organizerId) {
  const users = await User.find({ 'rankings.organizerId': organizerId }).lean();
  return users
    .map(user => {
      const ranking = (user.rankings || []).find(entry => entry.organizerId === organizerId);
      return ranking ? {
        userId: user.uid,
        displayName: user.displayName,
        username: user.username,
        points: ranking.points || 0,
        tournamentsPlayed: ranking.tournamentsPlayed || 0,
      } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.points - a.points);
}

module.exports = {
  countUsers,
  insertUsers,
  findByUid,
  findByPublicId,
  findByUsername,
  searchUsers,
  createUser,
  updateInvitationPolicy,
  applyRankingDeltas,
  findRankingByOrganizer,
};
