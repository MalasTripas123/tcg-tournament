function isOrganizer(tournament, viewerId) {
  return !!viewerId && tournament.organizerId === viewerId;
}

function isModerator(tournament, viewerId) {
  return !!viewerId && (tournament.moderators || []).some(moderator =>
    moderator.userId === viewerId && moderator.active !== false
  );
}

function canManageTournament(tournament, viewerId) {
  return isOrganizer(tournament, viewerId) || isModerator(tournament, viewerId);
}

function isPlayer(tournament, viewerId) {
  return !!viewerId && tournament.players.some(player => player.userId === viewerId);
}

function hasJoinRequest(tournament, viewerId) {
  return !!viewerId && (tournament.joinRequests || []).some(request => request.userId === viewerId);
}

function hasPublicModeration(tournament) {
  return (tournament.moderators || []).some(moderator =>
    moderator.active !== false || !!moderator.completedAt
  );
}

function canViewTournament(tournament, viewerId) {
  if (hasPublicModeration(tournament)) return true;
  if (tournament.visibility !== 'private') return true;
  return canManageTournament(tournament, viewerId) || isPlayer(tournament, viewerId) || hasJoinRequest(tournament, viewerId);
}

module.exports = {
  isOrganizer,
  isModerator,
  canManageTournament,
  isPlayer,
  hasJoinRequest,
  hasPublicModeration,
  canViewTournament,
};
