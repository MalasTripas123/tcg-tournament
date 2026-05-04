// server.js
require('dotenv').config(); // carga .env en desarrollo local

const express = require('express');
const session = require('express-session');
const path    = require('path');
const { connectDB } = require('./lib/db');
const { seedUsers } = require('./lib/store');

const app  = express();
const PORT = process.env.PORT || 3000;

// ─── MIDDLEWARES ──────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'tcg-dev-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 24 * 60 * 60 * 1000,
    // En producción con HTTPS, activar secure: true
    secure: process.env.NODE_ENV === 'production' && process.env.TRUST_PROXY === '1',
  },
}));

// Necesario para que las cookies funcionen correctamente detrás del proxy de Render
if (process.env.NODE_ENV === 'production') app.set('trust proxy', 1);

app.use(express.static(path.join(__dirname, 'public')));

// ─── RUTAS DE API ─────────────────────────────────────────────────
app.use('/auth', require('./routes/auth'));
app.use('/api/tournaments', require('./routes/tournaments'));

// Búsqueda de usuarios (nivel app para evitar colisión con /:id del router de torneos)
const { searchUsers } = require('./lib/store');
app.get('/api/users/search', async (req, res) => {
  const { q } = req.query;
  if (!q || q.length < 2) return res.json([]);
  try {
    const results = await searchUsers(q);
    res.json(results.slice(0, 8).map(u => ({
      id: u.uid,
      username: u.username,
      displayName: u.displayName,
      role: u.role,
    })));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── SPA FALLBACK ─────────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── ARRANQUE ─────────────────────────────────────────────────────
async function start() {
  await connectDB();   // 1. conectar a MongoDB
  await seedUsers();   // 2. insertar usuarios de prueba si la DB está vacía
  app.listen(PORT, () => {
    console.log(`\n🃏  TCG Arena corriendo en http://localhost:${PORT}`);
    console.log(`   Login: admin_store / 1234\n`);
  });
}

start();
