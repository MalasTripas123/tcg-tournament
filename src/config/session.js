const session = require('express-session');
const { env } = require('./env');

function createSessionMiddleware() {
  return session({
    secret: env.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 24 * 60 * 60 * 1000,
      httpOnly: true,
      secure: env.isProduction,
      sameSite: 'lax',
    },
  });
}

module.exports = { createSessionMiddleware };
