const ApiError = require('../../shared/http/ApiError');
const { ok } = require('../../shared/http/responses');
const userService = require('./user.service');
const { presentUser, presentUserSearch } = require('./user.presenter');

async function search(req, res) {
  const { q } = req.validated.query;
  if (!q || q.length < 2) return ok(res, []);
  const users = await userService.searchUsers(q);
  return ok(res, presentUserSearch(users));
}

async function profile(req, res) {
  const profileData = await userService.getPublicProfile(req.params.userId, req.session?.userId);
  if (!profileData) throw ApiError.notFound('Usuario no encontrado');
  return ok(res, {
    user: presentUser(profileData.user),
    organizedActive: profileData.organizedActive,
    organizedFinished: profileData.organizedFinished,
    playingIn: profileData.playingIn,
    invitedTo: profileData.invitedTo || [],
    officialRanking: profileData.officialRanking || [],
  });
}

async function updatePreferences(req, res) {
  const user = await userService.updateInvitationPolicy(req.session.userId, req.validated.body.invitationPolicy);
  return ok(res, { user: presentUser(user) });
}

module.exports = { search, profile, updatePreferences };
