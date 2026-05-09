const ApiError = require('../http/ApiError');

function requireAuth(req, res, next) {
  if (!req.session?.userId) return next(ApiError.unauthorized());
  return next();
}

module.exports = requireAuth;
