// lib/store.js
// Capa de acceso a datos.
// Antes: guardaba todo en memoria (se perdía al reiniciar).
// Ahora: lee y escribe en MongoDB a través de los modelos de Mongoose.
//
// Las FIRMAS de las funciones exportadas son idénticas a la versión
// anterior, por lo que routes/auth.js y routes/tournaments.js
// no necesitan ningún cambio.

const { v4: uuidv4 } = require('uuid');
const User       = require('../models/User');
const Tournament = require('../models/Tournament');

// ─────────────────────────────────────────────────────────────────
// SEED — Usuarios de prueba
// Se insertan solo si la colección está vacía (primera ejecución).
// ─────────────────────────────────────────────────────────────────
async function seedUsers() {
  const count = await User.countDocuments();
  if (count > 0) return; // ya hay usuarios, no hacer nada

  const users = [
    { uid:'u1',  username:'admin_store',    password:'1234', email:'store@tcg.com', role:'organizer', isLicensed:true,  displayName:"Dragon's Lair Store" },
    { uid:'u2',  username:'jugador_uno',    password:'1234', email:'j1@tcg.com',   role:'player',    isLicensed:false, displayName:'Kira Dragón' },
    { uid:'u3',  username:'jugador_dos',    password:'1234', email:'j2@tcg.com',   role:'player',    isLicensed:false, displayName:'Nox Sombra' },
    { uid:'u4',  username:'jugador_tres',   password:'1234', email:'j3@tcg.com',   role:'player',    isLicensed:false, displayName:'Vera Llama' },
    { uid:'u5',  username:'jugador_cuatro', password:'1234', email:'j4@tcg.com',   role:'player',    isLicensed:false, displayName:'Zael Tormenta' },
    { uid:'u6',  username:'jugador_cinco',  password:'1234', email:'j5@tcg.com',   role:'player',    isLicensed:false, displayName:'Lyra Viento' },
    { uid:'u7',  username:'jugador_seis',   password:'1234', email:'j6@tcg.com',   role:'player',    isLicensed:false, displayName:'Ravn Hielo' },
    { uid:'u8',  username:'jugador_siete',  password:'1234', email:'j7@tcg.com',   role:'player',    isLicensed:false, displayName:'Oryn Tierra' },
    { uid:'u9',  username:'jugador_ocho',   password:'1234', email:'j8@tcg.com',   role:'player',    isLicensed:false, displayName:'Sael Mar' },
    { uid:'u10', username:'jugador_nueve',  password:'1234', email:'j9@tcg.com',   role:'player',    isLicensed:false, displayName:'Fen Bruma' },
  ];

  await User.insertMany(users);
  console.log('✓  Usuarios de prueba creados en MongoDB');
}

// ─────────────────────────────────────────────────────────────────
// USUARIOS
// ─────────────────────────────────────────────────────────────────

// Las rutas usan el campo 'uid' (string) para identificar usuarios,
// no el ObjectId de MongoDB. Por eso buscamos por 'uid'.

async function getUserById(uid) {
  return User.findOne({ uid }).lean();
  // .lean() devuelve un objeto JS plano en lugar de un documento Mongoose,
  // lo que es más rápido y compatible con el código existente.
}

async function getUserByUsername(username) {
  return User.findOne({ username: username.toLowerCase() }).lean();
}

async function searchUsers(query) {
  const q = query.toLowerCase();
  // Búsqueda por regex case-insensitive en displayName o username
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
  // Ordenar: activos primero, luego lobby, luego finalizados
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
    _id:          uuidv4(), // usamos UUID como _id para compatibilidad con el código existente
    name:         data.name,
    organizerId,
    organizerName: organizer ? organizer.displayName : 'Desconocido',
    totalRounds:  parseInt(data.totalRounds) || 3,
    roundDuration: parseInt(data.roundDuration) || 50,
    status:       'lobby',
    visibility:   data.visibility || 'public',
    isRanked:     !!(organizer?.isLicensed && organizer?.role === 'organizer'),
    prizes:       data.prizes || [],
    players:      [],
    joinRequests: [],
    rounds:       [],
    currentRound: 0,
  });
  return tournament.toObject();
}

// saveTournament: persiste los cambios de un torneo que ya fue modificado en memoria.
// Las rutas modifican el objeto del torneo directamente y luego llaman a esta función.
// Es el equivalente al antiguo "el objeto ya estaba en el array, no hace falta hacer nada".
async function saveTournament(tournament) {
  // findByIdAndUpdate con el torneo completo. 'new: true' devuelve el doc actualizado.
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
  // usuarios
  getUserById,
  getUserByUsername,
  searchUsers,
  createUser,
  // torneos
  getAllTournaments,
  getTournamentById,
  createTournament,
  saveTournament,
};
