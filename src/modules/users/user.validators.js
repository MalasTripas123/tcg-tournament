const ApiError = require('../../shared/http/ApiError');

const MAX_AVATAR_DATA_URL_LENGTH = 450000;

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
  if (req.body.bannerUrl !== undefined) {
    if (typeof req.body.bannerUrl !== 'string') throw ApiError.badRequest('URL de banner invalida');
    body.bannerUrl = req.body.bannerUrl.trim().slice(0, 600);
  }
  if (req.body.avatarDataUrl !== undefined) {
    if (typeof req.body.avatarDataUrl !== 'string') throw ApiError.badRequest('Foto de perfil invalida');
    const avatarDataUrl = req.body.avatarDataUrl.trim();
    if (avatarDataUrl && !/^data:image\/(jpeg|png|webp);base64,[a-z0-9+/=]+$/i.test(avatarDataUrl)) {
      throw ApiError.badRequest('La foto debe ser una imagen valida');
    }
    if (avatarDataUrl.length > MAX_AVATAR_DATA_URL_LENGTH) {
      throw ApiError.badRequest('La foto de perfil es demasiado grande');
    }
    body.avatarDataUrl = avatarDataUrl;
  }
  if (!Object.keys(body).length) throw ApiError.badRequest('No hay preferencias para actualizar');
  return { body };
}

module.exports = { validateSearchUsers, validateInvitationPolicy };
