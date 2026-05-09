const express = require('express');
const path = require('path');
const { env } = require('./config/env');
const { createSessionMiddleware } = require('./config/session');
const { createHelmetMiddleware, createLoginLimiter, createApiLimiter } = require('./config/security');
const errorHandler = require('./shared/middleware/errorHandler');
const authRoutes = require('./modules/auth/auth.routes');
const userRoutes = require('./modules/users/user.routes');
const tournamentRoutes = require('./modules/tournaments/tournament.routes');

function createApp() {
  const app = express();
  const loginLimiter = createLoginLimiter();
  const apiLimiter = createApiLimiter();

  if (env.isProduction) app.set('trust proxy', 1);

  app.use(createHelmetMiddleware());
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(createSessionMiddleware());
  app.use(express.static(path.join(__dirname, '..', 'public')));

  app.use('/auth/login', loginLimiter);
  app.use('/auth/register', loginLimiter);
  app.use('/api', apiLimiter);

  app.use('/auth', authRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/tournaments', tournamentRoutes);

  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
  });

  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
