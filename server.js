// server.js
require('dotenv').config();

const express   = require('express');
const session   = require('express-session');
const helmet    = require('helmet');
const rateLimit = require('express-rate-limit');
const path      = require('path');
const { connectDB } = require('./lib/db');
const { seedUsers } = require('./lib/store');

const app  = express();
const PORT = process.env.PORT || 3000;

// ─── SEGURIDAD — HELMET ───────────────────────────────────────────
// Añade ~12 headers HTTP de seguridad automáticamente:
// X-Frame-Options (anti-clickjacking), X-Content-Type-Options,
// Strict-Transport-Security, Content-Security-Policy, etc.
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:    ["'self'"],
      // 'unsafe-inline' en scriptSrc cubre el bloque <script> principal.
      // 'unsafe-hashes' + 'unsafe-inline' en scriptSrcAttr permiten los
      // handlers onclick/ondragstart/etc. en atributos HTML.
      // Esto es necesario mientras el frontend use Vanilla JS con handlers inline.
      // Cuando migremos a React desaparecerán estos inline handlers y se podrá
      // eliminar 'unsafe-inline' y 'unsafe-hashes'.
      scriptSrc:     ["'self'", "'unsafe-inline'", "cdn.tailwindcss.com"],
      scriptSrcAttr: ["'unsafe-inline'", "'unsafe-hashes'"],
      styleSrc:      ["'self'", "'unsafe-inline'", "fonts.googleapis.com", "cdn.tailwindcss.com"],
      fontSrc:       ["'self'", "fonts.gstatic.com"],
      connectSrc:    ["'self'"],
      imgSrc:        ["'self'", "data:", "https:"],
    },
  },
}));

// ─── RATE LIMITING ────────────────────────────────────────────────
// Limita intentos de login: máx 10 intentos por IP cada 15 minutos.
// Evita ataques de fuerza bruta contra contraseñas.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 10,
  message: { error: 'Demasiados intentos. Espera 15 minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limit general para la API: 200 requests por IP cada 15 minutos
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { error: 'Demasiadas solicitudes. Intenta más tarde.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ─── MIDDLEWARES ──────────────────────────────────────────────────
app.use(express.json({ limit: '1mb' }));  // límite de tamaño en requests
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

app.use(session({
  secret: process.env.SESSION_SECRET || 'tcg-dev-secret-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge:   24 * 60 * 60 * 1000, // 24 horas
    httpOnly: true,   // la cookie no es accesible desde JavaScript del cliente (anti-XSS)
    secure:   process.env.NODE_ENV === 'production', // solo HTTPS en producción
    sameSite: 'lax',  // protección básica anti-CSRF
  },
}));

if (process.env.NODE_ENV === 'production') app.set('trust proxy', 1);

app.use(express.static(path.join(__dirname, 'public')));

// ─── RUTAS ────────────────────────────────────────────────────────
// Aplicar rate limiter de login solo al endpoint de login
app.use('/auth/login', loginLimiter);
app.use('/auth/register', loginLimiter); // también en registro

// Rate limit general para toda la API
app.use('/api', apiLimiter);

app.use('/auth', require('./routes/auth'));
app.use('/api/tournaments', require('./routes/tournaments'));

// Búsqueda de usuarios
const { searchUsers } = require('./lib/store');
app.get('/api/users/search', apiLimiter, async (req, res) => {
  const { q } = req.query;
  if (!q || q.length < 2) return res.json([]);
  try {
    const results = await searchUsers(q);
    res.json(results.slice(0, 8).map(u => ({
      id:          u.uid,
      username:    u.username,
      displayName: u.displayName,
      role:        u.role,
    })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── ARRANQUE ─────────────────────────────────────────────────────
async function start() {
  await connectDB();
  await seedUsers();
  app.listen(PORT, () => {
    console.log(`\n🃏  TCG Arena corriendo en http://localhost:${PORT}`);
    console.log(`   Entorno: ${process.env.NODE_ENV || 'development'}\n`);
  });
}

start();
