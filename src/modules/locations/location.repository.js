const Location = require('./location.model');
const { escapeRegex } = require('../../shared/utils/escapeRegex');

async function findById(id) {
  if (!id) return null;
  return Location.findOne({ _id: id, active: true }).lean();
}

async function searchLocations(query, limit = 8) {
  const q = String(query || '').trim();
  if (q.length < 2) return [];
  const pattern = new RegExp(escapeRegex(q.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()), 'i');
  return Location.find({ active: true, searchText: pattern })
    .sort({ countryCode: 1, region: 1, locality: 1 })
    .limit(limit)
    .lean();
}

async function upsertLocations(locations) {
  if (!Array.isArray(locations) || !locations.length) return { matchedCount: 0, modifiedCount: 0, upsertedCount: 0 };
  const operations = locations.map(location => ({
    updateOne: {
      filter: { _id: location._id },
      update: { $set: location },
      upsert: true,
    },
  }));
  return Location.bulkWrite(operations, { ordered: false });
}

module.exports = {
  findById,
  searchLocations,
  upsertLocations,
};
