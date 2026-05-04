// routes/auth.js
const express = require('express');
const router  = express.Router();
const { v4: uuidv4 } = require('uuid');
const {
  getUserByUsername,
  getUserById,
  getAllTournaments,
  createUser,
} = require('../lib/store');

// POST /auth/login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Credenciales requeridas' });
    const user = await getUserByUsername(username);
    if (!user || user.password !== password) return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
    req.session.userId = user.uid;
    res.json({ ok: true, user: _safeUser(user) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /auth/register
router.post('/register', async (req, res) => {
  try {
    const { username, password, displayName, email } = req.body;
    if (!username || !password || !displayName) return res.status(400).json({ error: 'Faltan campos requeridos' });
    if (await getUserByUsername(username)) return res.status(409).json({ error: 'El nombre de usuario ya está en uso' });
    const user = await createUser({ username, password, email: email || '', displayName, role: 'player', isLicensed: false });
    req.session.userId = user.uid;
    res.json({ ok: true, user: _safeUser(user) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /auth/logout
router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

// GET /auth/me
router.get('/me', async (req, res) => {
  try {
    if (!req.session.userId) return res.json({ user: null });
    const user = await getUserById(req.session.userId);
    res.json({ user: user ? _safeUser(user) : null });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /auth/profile/:userId
router.get('/profile/:userId', async (req, res) => {
  try {
    const user = await getUserById(req.params.userId);
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
    const allTournaments = await getAllTournaments();
    const organized = allTournaments.filter(t => t.organizerId === user.uid);
    const playing   = allTournaments.filter(t =>
      t.players.some(p => p.userId === user.uid) && t.organizerId !== user.uid
    );
    // Normalizar _id → id para compatibilidad con el frontend
    const norm = t => ({ ...t, id: t._id || t.id });
    res.json({
      user: _safeUser(user),
      organizedActive:   organized.filter(t => t.status !== 'finished').map(norm),
      organizedFinished: organized.filter(t => t.status === 'finished').map(norm),
      playingIn: playing.map(norm),
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Devuelve solo los campos públicos del usuario
function _safeUser(u) {
  return { id: u.uid, username: u.username, displayName: u.displayName, role: u.role, isLicensed: u.isLicensed };
}

module.exports = router;
