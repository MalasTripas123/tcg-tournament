function presentUser(user) {
  if (!user) return null;
  return {
    id: user.uid,
    username: user.username,
    profileSlug: user.username,
    displayName: user.displayName,
    bannerUrl: user.bannerUrl || '',
    avatarDataUrl: user.avatarDataUrl || '',
    role: user.role,
    isLicensed: user.isLicensed,
    invitationPolicy: user.invitationPolicy || 'manual',
    showPlayedTournaments: user.showPlayedTournaments !== false,
    rankings: user.rankings || [],
  };
}

function presentUserSearch(users) {
  return users.map(user => ({
    id: user.uid,
    username: user.username,
    profileSlug: user.username,
    displayName: user.displayName,
    bannerUrl: user.bannerUrl || '',
    avatarDataUrl: user.avatarDataUrl || '',
    role: user.role,
  }));
}

module.exports = { presentUser, presentUserSearch };
