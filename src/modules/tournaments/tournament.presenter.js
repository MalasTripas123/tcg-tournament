const policies = require('./tournament.policies');

function tournamentId(tournament) {
  return tournament._id || tournament.id;
}

function presentJoinRequests(tournament, viewer) {
  const viewerId = viewer?.id;
  if (policies.isOrganizer(tournament, viewerId)) return tournament.joinRequests || [];
  if (!viewerId) return [];
  return (tournament.joinRequests || []).filter(request => request.userId === viewerId);
}

function presentTournament(tournament, viewer = null) {
  const viewerId = viewer?.id;
  return {
    id: tournamentId(tournament),
    name: tournament.name,
    organizerId: tournament.organizerId,
    organizerName: tournament.organizerName,
    organizerUsername: tournament.organizerUsername || '',
    totalRounds: tournament.totalRounds,
    roundDuration: tournament.roundDuration,
    status: tournament.status,
    visibility: tournament.visibility || 'public',
    isRanked: tournament.isRanked,
    isOfficial: !!tournament.isRanked,
    minimumPlayers: tournament.isRanked ? 8 : 2,
    pairingMethod: tournament.pairingMethod || 'snake',
    rankingApplied: !!tournament.rankingApplied,
    rankingDeltas: tournament.rankingDeltas || [],
    prizes: tournament.prizes || [],
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
