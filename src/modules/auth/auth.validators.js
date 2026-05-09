const ApiError = require('../../shared/http/ApiError');

function requireString(value, field, max = 120) {
  if (typeof value !== 'string' || !value.trim()) {
    throw ApiError.badRequest(`${field} es requerido`);
  }
  const trimmed = value.trim();
  if (trimmed.length > max) throw ApiError.badRequest(`${field} es demasiado largo`);
  return trimmed;
}

function validateLogin(req) {
  return {
    body: {
      username: requireString(req.body.username, 'Usuario', 80),
      password: requireString(req.body.password, 'Contrasena', 200),
    },
  };
}

function validateRegister(req) {
  const username = requireString(req.body.username, 'Usuario', 80);
  const password = requireString(req.body.password, 'Contrasena', 200);
  const displayName = requireString(req.body.displayName, 'Nombre visible', 120);
  const email = typeof req.body.email === 'string' ? req.body.email.trim().slice(0, 180) : '';

  if (password.length < 6) {
    throw ApiError.badRequest('La contrasena debe tener al menos 6 caracteres');
  }

  return {
    body: { username, password, displayName, email },
  };
}

module.exports = { validateLogin, validateRegister };
