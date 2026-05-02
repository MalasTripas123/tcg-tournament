// server.js
const express = require('express');
const session = require('express-session');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── MIDDLEWARES ──────────────────────────────────────────────────────────────

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: 'tcg-mvp-secret-2024', // En producción: variable de entorno
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 }, // 24h
}));

// Archivos estáticos
app.use(express.static(path.join(__dirname, 'public')));

// ─── RUTAS DE API ─────────────────────────────────────────────────────────────

app.use('/auth', require('./routes/auth'));
app.use('/api/tournaments', require('./routes/tournaments'));

// Búsqueda de usuarios (ruta separada para claridad)
const { searchUsers } = require('./lib/store');
app.get('/api/users/search', (req, res) => {
  const { q } = req.query;
  if (!q || q.length < 2) return res.json([]);
  const results = searchUsers(q).slice(0, 8).map(u => ({
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    role: u.role,
  }));
  res.json(results);
});

// ─── SPA FALLBACK ─────────────────────────────────────────────────────────────
// Todas las rutas no-API sirven el index.html (SPA)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── INICIO ───────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`\n🃏  TCG Tournament Manager corriendo en http://localhost:${PORT}`);
  console.log(`   Usuarios de prueba: admin_store/1234 (organizador), jugador_uno/1234 (jugador)\n`);
});
