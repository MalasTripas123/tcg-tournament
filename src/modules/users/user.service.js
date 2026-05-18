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

async function updatePreferences(userId, data) {
  let user = await userRepository.findByUid(userId);
  if (!user) return null;
  if (data.invitationPolicy !== undefined) {
    user = await userRepository.updateInvitationPolicy(userId, data.invitationPolicy);
  }
  if (data.showPlayedTournaments !== undefined) {
    user = await userRepository.updateProfileVisibility(userId, data.showPlayedTournaments);
  }
  if (data.bannerUrl !== undefined) {
    user = await userRepository.updateProfileBanner(userId, data.bannerUrl);
  }
  return user;
}

async function getPublicProfile(userId, viewerId) {
  const user = await userRepository.findByPublicId(userId);
  if (!user) return null;

  const allTournaments = await tournamentRepository.findAll();
  const viewerUser = viewerId ? await userRepository.findByUid(viewerId) : null;
  const organized = allTournaments.filter(t => t.organizerId === user.uid);
  const playing = allTournaments.filter(t =>
    t.players.some(p => p.userId === user.uid) && t.organizerId !== user.uid
  );
  const allPlayed = allTournaments.filter(t => t.players.some(p => p.userId === user.uid));
  const playingVisible = canViewPlayedTournaments(user, viewerUser);
  const visiblePlaying = playingVisible ? playing : [];
  const viewerOrganizedParticipations = canViewOfficialOrganizerParticipations(viewerUser, user)
    ? allPlayed.filter(t => t.organizerId === viewerUser.uid)
    : [];
  const moderatingActive = allTournaments.filter(t => isActiveModerator(t, user.uid));
  const moderatedFinished = allTournaments.filter(t => didModerateUntilFinished(t, user.uid));
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
    moderatingActive: presentTournamentList(moderatingActive, viewer),
    moderatedFinished: presentTournamentList(moderatedFinished, viewer),
    viewerOrganizedParticipations: presentTournamentList(viewerOrganizedParticipations, viewer),
    playingIn: presentTournamentList(visiblePlaying, viewer),
    playedTournamentsVisible: playingVisible,
    profileStats: buildProfileStats(allPlayed, user.uid),
    invitedTo: viewerId === user.uid ? presentTournamentList(invitedTo, viewer) : [],
    officialRanking,
  };
}

function canViewPlayedTournaments(user, viewerUser) {
  if (viewerUser?.uid === user.uid) return true;
  return user.showPlayedTournaments !== false;
}

function canViewOfficialOrganizerParticipations(viewerUser, profileUser) {
  return !!(
    viewerUser?.uid &&
    viewerUser.uid !== profileUser.uid &&
    viewerUser.isLicensed &&
    viewerUser.role === 'organizer'
  );
}

function isActiveModerator(tournament, userId) {
  if (tournament.status === 'finished') return false;
  return (tournament.moderators || []).some(moderator =>
    moderator.userId === userId && moderator.active !== false
  );
}

function didModerateUntilFinished(tournament, userId) {
  if (tournament.status !== 'finished') return false;
  return (tournament.moderators || []).some(moderator =>
    moderator.userId === userId && (moderator.completedAt || moderator.active !== false)
  );
}

function buildProfileStats(playedTournaments, userId) {
  const tournamentsPlayed = playedTournaments.length;
  let tournamentWins = 0;
  let disqualifications = 0;
  let yellowCards = 0;
  let redCards = 0;

  for (const tournament of playedTournaments) {
    const player = (tournament.players || []).find(current => current.userId === userId);
    if (!player) continue;
    if (isTournamentWinner(tournament, userId)) tournamentWins += 1;
    if (player.eliminatedFromTournament) disqualifications += 1;
    yellowCards += Number(player.yellowCards) || 0;
    redCards += player.redCard ? 1 : 0;
  }

  return {
    tournamentsPlayed,
    tournamentWins,
    disqualifications,
    averageYellowCards: tournamentsPlayed ? Math.round((yellowCards / tournamentsPlayed) * 100) / 100 : 0,
    averageRedCards: tournamentsPlayed ? Math.round((redCards / tournamentsPlayed) * 100) / 100 : 0,
  };
}

function isTournamentWinner(tournament, userId) {
  if (tournament.status !== 'finished') return false;
  const rankingWinner = (tournament.rankingDeltas || []).find(delta => delta.rank === 1);
  if (rankingWinner) return rankingWinner.userId === userId;

  const standings = [...(tournament.players || [])].sort((a, b) => {
    if ((b.score || 0) !== (a.score || 0)) return (b.score || 0) - (a.score || 0);
    if ((b.wins || 0) !== (a.wins || 0)) return (b.wins || 0) - (a.wins || 0);
    return String(a.displayName || '').localeCompare(String(b.displayName || ''));
  });
  return standings[0]?.userId === userId;
}

module.exports = {
  seedUsers,
  searchUsers,
  updateInvitationPolicy,
  updatePreferences,
  getPublicProfile,
};
