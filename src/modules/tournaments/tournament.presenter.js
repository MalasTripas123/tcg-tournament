const policies = require('./tournament.policies');

function tournamentId(tournament) {
  return tournament._id || tournament.id;
}

function presentJoinRequests(tournament, viewer) {
  const viewerId = viewer?.id;
  if (policies.canManageTournament(tournament, viewerId)) return tournament.joinRequests || [];
  if (!viewerId) return [];
  return (tournament.joinRequests || []).filter(request => request.userId === viewerId);
}

function presentTournament(tournament, viewer = null) {
  const viewerId = viewer?.id;
  return {
    id: tournamentId(tournament),
    name: tournament.name,
    bannerUrl: tournament.bannerUrl || '',
    gameId: tournament.gameId || '',
    gameName: tournament.gameName || '',
    gameFormatId: tournament.gameFormatId || '',
    gameFormatName: tournament.gameFormatName || '',
    locationId: tournament.locationId || '',
    location: tournament.location || '',
    locationLocality: tournament.locationLocality || '',
    locationRegion: tournament.locationRegion || '',
    locationCountry: tournament.locationCountry || '',
    locationLat: tournament.locationLat ?? null,
    locationLng: tournament.locationLng ?? null,
    organizerId: tournament.organizerId,
    organizerName: tournament.organizerName,
    organizerUsername: tournament.organizerUsername || '',
    scheduledStartAt: tournament.scheduledStartAt || null,
    totalRounds: tournament.totalRounds,
    roundDuration: tournament.roundDuration,
    minPlayers: tournament.minPlayers ?? null,
    maxPlayers: tournament.maxPlayers ?? null,
    status: tournament.status,
    visibility: tournament.visibility || 'public',
    isRanked: tournament.isRanked,
    isOfficial: !!tournament.isRanked,
    minimumPlayers: Math.max(tournament.isRanked ? 8 : 2, Number.isFinite(Number(tournament.minPlayers)) ? Number(tournament.minPlayers) : 0),
    pairingMethod: tournament.pairingMethod || 'snake',
    tableMode: tournament.tableMode || 'multi',
    rankingApplied: !!tournament.rankingApplied,
    rankingDeltas: tournament.rankingDeltas || [],
    prizes: tournament.prizes || [],
    moderators: tournament.moderators || [],
    isModerator: policies.isModerator(tournament, viewerId),
    canManage: policies.canManageTournament(tournament, viewerId),
    players: tournament.players || [],
    joinRequests: presentJoinRequests(tournament, viewer),
    rounds: tournament.rounds || [],
    currentRound: tournament.currentRound,
    createdAt: tournament.createdAt,
    isOrganizer: policies.isOrganizer(tournament, viewerId),
  };
}

function presentTournamentList(tournaments, viewer = null) {
  const viewerId = viewer?.id;
  return tournaments
    .filter(tournament => policies.canViewTournament(tournament, viewerId))
    .map(tournament => presentTournament(tournament, viewer));
}

module.exports = {
  presentTournament,
  presentTournamentList,
};
