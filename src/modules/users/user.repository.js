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

function normalizeRankingEntry(entry) {
  const points = Number(entry.points);
  const tournamentsPlayed = Number(entry.tournamentsPlayed);
  return {
    userId: entry.userId,
    displayName: entry.displayName || '',
    isAnonymous: !!entry.isAnonymous,
    anonymousKey: entry.anonymousKey || '',
    points: Number.isFinite(points) ? points : 0,
    tournamentsPlayed: Number.isFinite(tournamentsPlayed) ? Math.max(0, tournamentsPlayed) : 0,
  };
}

async function replaceOrganizerRanking(organizerId, organizerName, entries) {
  const normalizedEntries = (entries || [])
    .map(normalizeRankingEntry)
    .filter(entry => entry.userId && entry.tournamentsPlayed > 0);
  const registeredEntries = normalizedEntries.filter(entry => !entry.isAnonymous);
  const anonymousRankings = normalizedEntries
    .filter(entry => entry.isAnonymous && entry.anonymousKey && entry.displayName)
    .map(entry => ({
      userId: entry.userId,
      anonymousKey: entry.anonymousKey,
      displayName: entry.displayName,
      points: entry.points,
      tournamentsPlayed: entry.tournamentsPlayed,
    }));

  await User.updateMany(
    { 'rankings.organizerId': organizerId },
    { $pull: { rankings: { organizerId } } }
  );

  const operations = registeredEntries.map(entry => ({
    updateOne: {
      filter: { uid: entry.userId },
      update: {
        $push: {
          rankings: {
            organizerId,
            organizerName,
            points: entry.points,
            tournamentsPlayed: entry.tournamentsPlayed,
          },
        },
      },
    },
  }));

  if (operations.length) await User.bulkWrite(operations);

  await User.updateOne(
    { uid: organizerId },
    { $set: { anonymousRankings } },
    { runValidators: true }
  );
}

async function findRankingByOrganizer(organizerId) {
  const [users, organizer] = await Promise.all([
    User.find({ 'rankings.organizerId': organizerId }).lean(),
    User.findOne({ uid: organizerId }).select('anonymousRankings').lean(),
  ]);
  const registeredRankings = users
    .map(user => {
      const ranking = (user.rankings || []).find(entry => entry.organizerId === organizerId);
      return ranking ? {
        userId: user.uid,
        displayName: user.displayName,
        username: user.username,
        isAnonymous: false,
        points: ranking.points || 0,
        tournamentsPlayed: ranking.tournamentsPlayed || 0,
      } : null;
    })
    .filter(Boolean);
  const anonymousRankings = (organizer?.anonymousRankings || []).map(entry => ({
    userId: entry.userId,
    displayName: entry.displayName,
    username: '',
    isAnonymous: true,
    anonymousKey: entry.anonymousKey,
    points: entry.points || 0,
    tournamentsPlayed: entry.tournamentsPlayed || 0,
  }));

  return [...registeredRankings, ...anonymousRankings]
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
  replaceOrganizerRanking,
  findRankingByOrganizer,
};
