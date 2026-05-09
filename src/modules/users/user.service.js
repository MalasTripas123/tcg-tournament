const bcrypt = require('bcrypt');
const userRepository = require('./user.repository');
const tournamentRepository = require('../tournaments/tournament.repository');
const tournamentService = require('../tournaments/tournament.service');
const { presentTournamentList } = require('../tournaments/tournament.presenter');

const SALT_ROUNDS = 12;

async function seedUsers() {
  const count = await userRepository.countUsers();
  if (count > 0) return;

  const hash = password => bcrypt.hash(password, SALT_ROUNDS);
  const users = [
    { uid: 'u1', username: 'admin_store', password: await hash('1234'), email: 'store@tcg.com', role: 'organizer', isLicensed: true, displayName: "Dragon's Lair Store" },
    { uid: 'u2', username: 'jugador_uno', password: await hash('1234'), email: 'j1@tcg.com', role: 'player', isLicensed: false, displayName: 'Kira Dragon' },
    { uid: 'u3', username: 'jugador_dos', password: await hash('1234'), email: 'j2@tcg.com', role: 'player', isLicensed: false, displayName: 'Nox Sombra' },
    { uid: 'u4', username: 'jugador_tres', password: await hash('1234'), email: 'j3@tcg.com', role: 'player', isLicensed: false, displayName: 'Vera Llama' },
    { uid: 'u5', username: 'jugador_cuatro', password: await hash('1234'), email: 'j4@tcg.com', role: 'player', isLicensed: false, displayName: 'Zael Tormenta' },
    { uid: 'u6', username: 'jugador_cinco', password: await hash('1234'), email: 'j5@tcg.com', role: 'player', isLicensed: false, displayName: 'Lyra Viento' },
    { uid: 'u7', username: 'jugador_seis', password: await hash('1234'), email: 'j6@tcg.com', role: 'player', isLicensed: false, displayName: 'Ravn Hielo' },
    { uid: 'u8', username: 'jugador_siete', password: await hash('1234'), email: 'j7@tcg.com', role: 'player', isLicensed: false, displayName: 'Oryn Tierra' },
    { uid: 'u9', username: 'jugador_ocho', password: await hash('1234'), email: 'j8@tcg.com', role: 'player', isLicensed: false, displayName: 'Sael Mar' },
    { uid: 'u10', username: 'jugador_nueve', password: await hash('1234'), email: 'j9@tcg.com', role: 'player', isLicensed: false, displayName: 'Fen Bruma' },
  ];

  await userRepository.insertUsers(users);
  console.log('Usuarios de prueba creados en MongoDB');
}

async function searchUsers(query) {
  return userRepository.searchUsers(query, 8);
}

async function updateInvitationPolicy(userId, invitationPolicy) {
  return userRepository.updateInvitationPolicy(userId, invitationPolicy);
}

async function getPublicProfile(userId, viewerId) {
  const user = await userRepository.findByPublicId(userId);
  if (!user) return null;

  const allTournaments = await tournamentRepository.findAll();
  const organized = allTournaments.filter(t => t.organizerId === user.uid);
  const playing = allTournaments.filter(t =>
    t.players.some(p => p.userId === user.uid) && t.organizerId !== user.uid
  );
  const invitedTo = allTournaments.filter(t =>
    (t.joinRequests || []).some(request => request.userId === user.uid && request.status === 'pending' && request.type === 'invite')
  );
  const viewer = viewerId ? { id: viewerId } : null;
  let officialRanking = [];
  if (user.isLicensed) {
    await tournamentService.ensureOrganizerRankingsCurrent(user.uid);
    officialRanking = await userRepository.findRankingByOrganizer(user.uid);
  }

  return {
    user,
    organizedActive: presentTournamentList(organized.filter(t => t.status !== 'finished'), viewer),
    organizedFinished: presentTournamentList(organized.filter(t => t.status === 'finished'), viewer),
    playingIn: presentTournamentList(playing, viewer),
    invitedTo: viewerId === user.uid ? presentTournamentList(invitedTo, viewer) : [],
    officialRanking,
  };
}

module.exports = {
  seedUsers,
  searchUsers,
  updateInvitationPolicy,
  getPublicProfile,
};
