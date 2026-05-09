function isOrganizer(tournament, viewerId) {
  return !!viewerId && tournament.organizerId === viewerId;
}

function isPlayer(tournament, viewerId) {
  return !!viewerId && tournament.players.some(player => player.userId === viewerId);
}

function hasJoinRequest(tournament, viewerId) {
  return !!viewerId && (tournament.joinRequests || []).some(request => request.userId === viewerId);
}

function canViewTournament(tournament, viewerId) {
  if (tournament.visibility !== 'private') return true;
  return isOrganizer(tournament, viewerId) || isPlayer(tournament, viewerId) || hasJoinRequest(tournament, viewerId);
}

module.exports = {
  isOrganizer,
  isPlayer,
  hasJoinRequest,
  canViewTournament,
};
