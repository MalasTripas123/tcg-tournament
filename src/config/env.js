require('dotenv').config();

const nodeEnv = process.env.NODE_ENV || 'development';
const isProduction = nodeEnv === 'production';
const sessionSecret = process.env.SESSION_SECRET || (isProduction ? null : 'tcg-dev-secret-change-in-production');

if (isProduction && !sessionSecret) {
  throw new Error('SESSION_SECRET es requerido en produccion.');
}

const env = {
  nodeEnv,
  isProduction,
  port: process.env.PORT || 3000,
  mongodbUri: process.env.MONGODB_URI,
  sessionSecret,
};

module.exports = { env };
