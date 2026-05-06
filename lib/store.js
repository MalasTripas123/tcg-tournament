// lib/store.js
// Capa de acceso a datos — MongoDB via Mongoose.

const { v4: uuidv4 } = require('uuid');
const bcrypt     = require('bcrypt');
const User       = require('../models/User');
const Tournament = require('../models/Tournament');

const SALT_ROUNDS = 12;

// ─────────────────────────────────────────────────────────────────
// SEED
// ─────────────────────────────────────────────────────────────────
async function seedUsers() {
  const count = await User.countDocuments();
  if (count > 0) return;

  // Hashear contraseñas antes de insertar
  const hash = (p) => bcrypt.hash(p, SALT_ROUNDS);

  const users = [
    { uid:'u1',  username:'admin_store',    password: await hash('1234'), email:'store@tcg.com', role:'organizer', isLicensed:true,  displayName:"Dragon's Lair Store" },
    { uid:'u2',  username:'jugador_uno',    password: await hash('1234'), email:'j1@tcg.com',   role:'player',    isLicensed:false, displayName:'Kira Dragón' },
    { uid:'u3',  username:'jugador_dos',    password: await hash('1234'), email:'j2@tcg.com',   role:'player',    isLicensed:false, displayName:'Nox Sombra' },
    { uid:'u4',  username:'jugador_tres',   password: await hash('1234'), email:'j3@tcg.com',   role:'player',    isLicensed:false, displayName:'Vera Llama' },
    { uid:'u5',  username:'jugador_cuatro', password: await hash('1234'), email:'j4@tcg.com',   role:'player',    isLicensed:false, displayName:'Zael Tormenta' },
    { uid:'u6',  username:'jugador_cinco',  password: await hash('1234'), email:'j5@tcg.com',   role:'player',    isLicensed:false, displayName:'Lyra Viento' },
    { uid:'u7',  username:'jugador_seis',   password: await hash('1234'), email:'j6@tcg.com',   role:'player',    isLicensed:false, displayName:'Ravn Hielo' },
    { uid:'u8',  username:'jugador_siete',  password: await hash('1234'), email:'j7@tcg.com',   role:'player',    isLicensed:false, displayName:'Oryn Tierra' },
    { uid:'u9',  username:'jugador_ocho',   password: await hash('1234'), email:'j8@tcg.com',   role:'player',    isLicensed:false, displayName:'Sael Mar' },
    { uid:'u10', username:'jugador_nueve',  password: await hash('1234'), email:'j9@tcg.com',   role:'player',    isLicensed:false, displayName:'Fen Bruma' },
  ];

  await User.insertMany(users);
  console.log('✓  Usuarios de prueba creados en MongoDB (contraseñas hasheadas)');
}

// ─────────────────────────────────────────────────────────────────
// USUARIOS
// ─────────────────────────────────────────────────────────────────
async function getUserById(uid) {
  return User.findOne({ uid }).lean();
}

async function getUserByUsername(username) {
  return User.findOne({ username: username.toLowerCase().trim() }).lean();
}

async function searchUsers(query) {
  const q = query.trim();
  return User.find({
    $or: [
      { displayName: { $regex: q, $options: 'i' } },
      { username:    { $regex: q, $options: 'i' } },
    ]
  }).limit(10).lean();
}

async function createUser(data) {
  const uid = uuidv4();
  const user = await User.create({ uid, ...data });
  return user.toObject();
}

// ─────────────────────────────────────────────────────────────────
// TORNEOS
// ─────────────────────────────────────────────────────────────────
async function getAllTournaments() {
  const order = { active: 0, lobby: 1, finished: 2 };
  const tournaments = await Tournament.find().lean();
  return tournaments.sort((a, b) => (order[a.status] ?? 3) - (order[b.status] ?? 3));
}

async function getTournamentById(id) {
  return Tournament.findById(id).lean();
}

async function createTournament(data, organizerId) {
  const organizer = await getUserById(organizerId);
  const tournament = await Tournament.create({
    _id:           uuidv4(),
    name:          data.name,
    organizerId,
    organizerName: organizer ? organizer.displayName : 'Desconocido',
    totalRounds:   parseInt(data.totalRounds) || 3,
    roundDuration: parseInt(data.roundDuration) || 50,
    status:        'lobby',
    visibility:    data.visibility || 'public',
    isRanked:      !!(organizer?.isLicensed && organizer?.role === 'organizer'),
    prizes:        data.prizes || [],
    players:       [],
    joinRequests:  [],
    rounds:        [],
    currentRound:  0,
  });
  return tournament.toObject();
}

async function saveTournament(tournament) {
  const updated = await Tournament.findByIdAndUpdate(
    tournament._id || tournament.id,
    tournament,
    { new: true, overwrite: true, runValidators: false }
  ).lean();
  return updated;
}

// ─────────────────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────────────────
module.exports = {
  seedUsers,
  getUserById,
  getUserByUsername,
  searchUsers,
  createUser,
  getAllTournaments,
  getTournamentById,
  createTournament,
  saveTournament,
};
