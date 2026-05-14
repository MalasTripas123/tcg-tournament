const session = require('express-session');
const { env } = require('./env');
const { createMongoSessionStore } = require('./sessionStore');

function createSessionMiddleware() {
  return session({
    secret: env.sessionSecret,
    store: createMongoSessionStore(),
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
