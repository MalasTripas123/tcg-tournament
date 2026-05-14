const crypto = require('crypto');

function cleanAnonymousName(name) {
  return String(name || '').trim().replace(/\s+/g, ' ');
}

function anonymousNameKey(name) {
  return cleanAnonymousName(name).toLowerCase().replace(/\s+/g, '');
}

function anonymousUserId(organizerId, anonymousKey) {
  const hash = crypto
    .createHash('sha1')
    .update(`${organizerId}:${anonymousKey}`)
    .digest('hex')
    .slice(0, 20);
  return `anon:${hash}`;
}

function anonymousPlayerIdentity(organizerId, name) {
  const displayName = cleanAnonymousName(name);
  const anonymousKey = anonymousNameKey(displayName);
  if (!anonymousKey) return null;

  return {
    uid: anonymousUserId(organizerId, anonymousKey),
    displayName,
    isAnonymous: true,
    anonymousKey,
  };
}

module.exports = {
  cleanAnonymousName,
  anonymousNameKey,
  anonymousPlayerIdentity,
};
