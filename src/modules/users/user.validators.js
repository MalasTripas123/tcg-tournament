const ApiError = require('../../shared/http/ApiError');

function validateSearchUsers(req) {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (q.length > 80) throw ApiError.badRequest('La busqueda es demasiado larga');
  return { query: { q } };
}

function validateInvitationPolicy(req) {
  const invitationPolicy = req.body.invitationPolicy;
  if (!['manual', 'auto'].includes(invitationPolicy)) {
    const ApiError = require('../../shared/http/ApiError');
    throw ApiError.badRequest('Preferencia de invitacion invalida');
  }
  return { body: { invitationPolicy } };
}

module.exports = { validateSearchUsers, validateInvitationPolicy };
