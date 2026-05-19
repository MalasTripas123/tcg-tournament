const { ok } = require('../../shared/http/responses');
const locationService = require('./location.service');
const { presentLocations } = require('./location.presenter');

async function search(req, res) {
  const { q } = req.validated.query;
  if (!q || q.length < 2) return ok(res, []);
  const locations = await locationService.searchLocations(q);
  return ok(res, presentLocations(locations));
}

module.exports = {
  search,
};
