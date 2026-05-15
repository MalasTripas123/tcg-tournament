const ApiError = require('../../shared/http/ApiError');

function validateSearchUsers(req) {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (q.length > 80) throw ApiError.badRequest('La busqueda es demasiado larga');
  return { query: { q } };
}

function validateInvitationPolicy(req) {
  const body = {};
  if (req.body.invitationPolicy !== undefined) {
    const invitationPolicy = req.body.invitationPolicy;
    if (!['manual', 'auto'].includes(invitationPolicy)) {
      throw ApiError.badRequest('Preferencia de invitacion invalida');
    }
    body.invitationPolicy = invitationPolicy;
  }
  if (req.body.showPlayedTournaments !== undefined) {
    body.showPlayedTournaments = !!req.body.showPlayedTournaments;
  }
  if (!Object.keys(body).length) throw ApiError.badRequest('No hay preferencias para actualizar');
  return { body };
}

module.exports = { validateSearchUsers, validateInvitationPolicy };
