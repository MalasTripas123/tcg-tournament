const ApiError = require('../../shared/http/ApiError');

function validateLocationSearch(req) {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (q.length > 120) throw ApiError.badRequest('La busqueda es demasiado larga');
  return { query: { q } };
}

module.exports = {
  validateLocationSearch,
};
