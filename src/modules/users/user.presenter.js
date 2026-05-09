function presentUser(user) {
  if (!user) return null;
  return {
    id: user.uid,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    isLicensed: user.isLicensed,
    invitationPolicy: user.invitationPolicy || 'manual',
    rankings: user.rankings || [],
  };
}

function presentUserSearch(users) {
  return users.map(user => ({
    id: user.uid,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
  }));
}

module.exports = { presentUser, presentUserSearch };
