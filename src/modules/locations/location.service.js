const locationRepository = require('./location.repository');

async function searchLocations(query) {
  return locationRepository.searchLocations(query, 10);
}

module.exports = {
  searchLocations,
};
