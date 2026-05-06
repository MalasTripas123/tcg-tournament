// routes/auth.js
const express = require('express');
const router  = express.Router();
const bcrypt  = require('bcrypt');
const {
  getUserByUsername,
  getUserById,
  getAllTournaments,
  createUser,
} = require('../lib/store');

const SALT_ROUNDS = 12; // coste del hash; 12 es el estándar recomendado actual

// ─── LOGIN ────────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Credenciales requeridas' });

    const user = await getUserByUsername(username);

    // Usamos bcrypt.compare tanto si el usuario existe como si no,
    // para evitar "timing attacks" que permiten saber si un usuario existe.
    const passwordValid = user
      ? await bcrypt.compare(password, user.password)
      : await bcrypt.compare(password, '$2b$12$invalidhashtopreventtimingattack');

    if (!user || !passwordValid) {
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
    }

    req.session.userId = user.uid;
    res.json({ ok: true, user: _safeUser(user) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── REGISTRO ─────────────────────────────────────────────────────
router.post('/register', async (req, res) => {
  try {
    const { username, password, displayName, email } = req.body;
    if (!username || !password || !displayName) {
      return res.status(400).json({ error: 'Faltan campos requeridos' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
    }
    if (await getUserByUsername(username)) {
      return res.status(409).json({ error: 'El nombre de usuario ya está en uso' });
    }

    // Hashear la contraseña antes de guardar
    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

    const user = await createUser({
      username,
      password: hashedPassword,
      email:    email || '',
      displayName,
      role:     'player',
      isLicensed: false,
    });

    req.session.userId = user.uid;
    res.json({ ok: true, user: _safeUser(user) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── LOGOUT ───────────────────────────────────────────────────────
router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

// ─── SESIÓN ACTUAL ────────────────────────────────────────────────
router.get('/me', async (req, res) => {
  try {
    if (!req.session.userId) return res.json({ user: null });
    const user = await getUserById(req.session.userId);
    res.json({ user: user ? _safeUser(user) : null });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── PERFIL PÚBLICO ───────────────────────────────────────────────
router.get('/profile/:userId', async (req, res) => {
  try {
    const user = await getUserById(req.params.userId);
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    const allTournaments = await getAllTournaments();
    const organized = allTournaments.filter(t => t.organizerId === user.uid);
    const playing   = allTournaments.filter(t =>
      t.players.some(p => p.userId === user.uid) && t.organizerId !== user.uid
    );
    const norm = t => ({ ...t, id: t._id || t.id });
    res.json({
      user: _safeUser(user),
      organizedActive:   organized.filter(t => t.status !== 'finished').map(norm),
      organizedFinished: organized.filter(t => t.status === 'finished').map(norm),
      playingIn: playing.map(norm),
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── HELPER ───────────────────────────────────────────────────────
// Nunca enviar la contraseña al cliente, ni siquiera el hash
function _safeUser(u) {
  return {
    id:          u.uid,
    username:    u.username,
    displayName: u.displayName,
    role:        u.role,
    isLicensed:  u.isLicensed,
  };
}

module.exports = router;
