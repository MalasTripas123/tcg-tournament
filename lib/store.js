// lib/store.js
const { v4: uuidv4 } = require('uuid');

const store = {
  users: [
    { id: 'u1',  username: 'admin_store',    password: '1234', email: 'store@tcg.com', role: 'organizer', isLicensed: true,  displayName: "Dragon's Lair Store" },
    { id: 'u2',  username: 'jugador_uno',    password: '1234', email: 'j1@tcg.com',   role: 'player',    isLicensed: false, displayName: 'Kira Dragón' },
    { id: 'u3',  username: 'jugador_dos',    password: '1234', email: 'j2@tcg.com',   role: 'player',    isLicensed: false, displayName: 'Nox Sombra' },
    { id: 'u4',  username: 'jugador_tres',   password: '1234', email: 'j3@tcg.com',   role: 'player',    isLicensed: false, displayName: 'Vera Llama' },
    { id: 'u5',  username: 'jugador_cuatro', password: '1234', email: 'j4@tcg.com',   role: 'player',    isLicensed: false, displayName: 'Zael Tormenta' },
    { id: 'u6',  username: 'jugador_cinco',  password: '1234', email: 'j5@tcg.com',   role: 'player',    isLicensed: false, displayName: 'Lyra Viento' },
    { id: 'u7',  username: 'jugador_seis',   password: '1234', email: 'j6@tcg.com',   role: 'player',    isLicensed: false, displayName: 'Ravn Hielo' },
    { id: 'u8',  username: 'jugador_siete',  password: '1234', email: 'j7@tcg.com',   role: 'player',    isLicensed: false, displayName: 'Oryn Tierra' },
    { id: 'u9',  username: 'jugador_ocho',   password: '1234', email: 'j8@tcg.com',   role: 'player',    isLicensed: false, displayName: 'Sael Mar' },
    { id: 'u10', username: 'jugador_nueve',  password: '1234', email: 'j9@tcg.com',   role: 'player',    isLicensed: false, displayName: 'Fen Bruma' },
  ],
  tournaments: [],
};

function getUserById(id) {
  return store.users.find(u => u.id === id) || null;
}

function getUserByUsername(username) {
  return store.users.find(u => u.username.toLowerCase() === username.toLowerCase()) || null;
}

function searchUsers(query) {
  const q = query.toLowerCase();
  return store.users.filter(u =>
    u.displayName.toLowerCase().includes(q) ||
    u.username.toLowerCase().includes(q)
  );
}

function getAllTournaments() {
  return store.tournaments;
}

function getTournamentById(id) {
  return store.tournaments.find(t => t.id === id) || null;
}

function createTournament(data, organizerId) {
  const organizer = getUserById(organizerId);
  const tournament = {
    id: uuidv4(),
    name: data.name,
    organizerId,
    organizerName: organizer ? organizer.displayName : 'Desconocido',
    totalRounds: parseInt(data.totalRounds) || 3,
    roundDuration: parseInt(data.roundDuration) || 50,
    status: 'lobby',
    visibility: data.visibility || 'public', // 'public' | 'approval' | 'private'
    isRanked: !!(organizer?.isLicensed && organizer?.role === 'organizer'),
    prizes: data.prizes || [],
    players: [],
    joinRequests: [], // [{ userId, displayName, status: 'pending'|'accepted'|'rejected', requestedAt }]
    rounds: [],
    currentRound: 0,
    createdAt: Date.now(),
  };
  store.tournaments.push(tournament);
  return tournament;
}

module.exports = {
  store,
  getUserById,
  getUserByUsername,
  searchUsers,
  getAllTournaments,
  getTournamentById,
  createTournament,
};
