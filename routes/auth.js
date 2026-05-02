// routes/auth.js
const express = require('express');
const router = express.Router();
const { getUserByUsername, getUserById, getAllTournaments, store } = require('../lib/store');
const { v4: uuidv4 } = require('uuid');

// POST /auth/login
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Credenciales requeridas' });
  const user = getUserByUsername(username);
  if (!user || user.password !== password) return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
  req.session.userId = user.id;
  res.json({ ok: true, user: { id: user.id, username: user.username, displayName: user.displayName, role: user.role, isLicensed: user.isLicensed } });
});

// POST /auth/register
router.post('/register', (req, res) => {
  const { username, password, displayName, email } = req.body;
  if (!username || !password || !displayName) return res.status(400).json({ error: 'Faltan campos requeridos' });
  if (getUserByUsername(username)) return res.status(409).json({ error: 'El nombre de usuario ya está en uso' });
  const newUser = { id: uuidv4(), username, password, email: email || '', role: 'player', isLicensed: false, displayName };
  store.users.push(newUser);
  req.session.userId = newUser.id;
  res.json({ ok: true, user: { id: newUser.id, username: newUser.username, displayName: newUser.displayName, role: newUser.role, isLicensed: newUser.isLicensed } });
});

// POST /auth/logout
router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

// GET /auth/me
router.get('/me', (req, res) => {
  if (!req.session.userId) return res.json({ user: null });
  const user = getUserById(req.session.userId);
  if (!user) return res.json({ user: null });
  res.json({ user: { id: user.id, username: user.username, displayName: user.displayName, role: user.role, isLicensed: user.isLicensed } });
});

// GET /auth/profile/:userId
router.get('/profile/:userId', (req, res) => {
  const user = getUserById(req.params.userId);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

  const allTournaments = getAllTournaments();
  const organized = allTournaments.filter(t => t.organizerId === user.id);
  const playing   = allTournaments.filter(t => t.players.some(p => p.userId === user.id) && t.organizerId !== user.id);

  res.json({
    user: { id: user.id, username: user.username, displayName: user.displayName, role: user.role, isLicensed: user.isLicensed },
    organizedActive:   organized.filter(t => t.status !== 'finished'),
    organizedFinished: organized.filter(t => t.status === 'finished'),
    playingIn: playing,
  });
});

module.exports = router;
