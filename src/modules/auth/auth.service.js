const bcrypt = require('bcrypt');
const ApiError = require('../../shared/http/ApiError');
const userRepository = require('../users/user.repository');

const SALT_ROUNDS = 12;
const DUMMY_HASH = bcrypt.hashSync('dummy-password', SALT_ROUNDS);

async function login({ username, password }) {
  const user = await userRepository.findByUsername(username);
  const passwordValid = user
    ? await bcrypt.compare(password, user.password)
    : await bcrypt.compare(password, DUMMY_HASH);

  if (!user || !passwordValid) {
    throw ApiError.unauthorized('Usuario o contrasena incorrectos');
  }

  return user;
}

async function register({ username, password, displayName, email }) {
  const existing = await userRepository.findByUsername(username);
  if (existing) throw ApiError.conflict('El nombre de usuario ya esta en uso');

  const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
  return userRepository.createUser({
    username,
    password: hashedPassword,
    email: email || '',
    displayName,
    role: 'player',
    isLicensed: false,
  });
}

async function getCurrentUser(userId) {
  return userRepository.findByUid(userId);
}

async function verifyPassword(userId, password) {
  const user = await userRepository.findByUid(userId);
  const passwordValid = user
    ? await bcrypt.compare(password || '', user.password)
    : await bcrypt.compare(password || '', DUMMY_HASH);

  if (!user || !passwordValid) {
    throw ApiError.unauthorized('Clave incorrecta');
  }

  return user;
}

module.exports = {
  login,
  register,
  getCurrentUser,
  verifyPassword,
};
