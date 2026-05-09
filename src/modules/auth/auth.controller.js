const { ok } = require('../../shared/http/responses');
const authService = require('./auth.service');
const userController = require('../users/user.controller');
const { presentUser } = require('./auth.presenter');

async function login(req, res) {
  const user = await authService.login(req.validated.body);
  await regenerateSession(req, user.uid);
  return ok(res, { ok: true, user: presentUser(user) });
}

async function register(req, res) {
  const user = await authService.register(req.validated.body);
  await regenerateSession(req, user.uid);
  return ok(res, { ok: true, user: presentUser(user) });
}

async function logout(req, res) {
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    ok(res, { ok: true });
  });
}

async function me(req, res) {
  if (!req.session?.userId) return ok(res, { user: null });
  const user = await authService.getCurrentUser(req.session.userId);
  return ok(res, { user: presentUser(user) });
}

module.exports = {
  login,
  register,
  logout,
  me,
  profile: userController.profile,
};

function regenerateSession(req, userId) {
  return new Promise((resolve, reject) => {
    req.session.regenerate(err => {
      if (err) return reject(err);
      req.session.userId = userId;
      return resolve();
    });
  });
}
