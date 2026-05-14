const test = require('node:test');
const assert = require('node:assert/strict');

function restoreCache(path, original) {
  if (original) require.cache[path] = original;
  else delete require.cache[path];
}

test('listOrganizerPlayerSuggestions returns frequent registered and anonymous players', async () => {
  const tournamentRepositoryPath = require.resolve('../../src/modules/tournaments/tournament.repository');
  const servicePath = require.resolve('../../src/modules/tournaments/tournament.service');
  const originalTournamentRepository = require.cache[tournamentRepositoryPath];
  const originalService = require.cache[servicePath];

  const current = {
    _id: 'current',
    organizerId: 'org1',
    organizerName: 'Official Store',
    status: 'lobby',
    isRanked: true,
    players: [{ userId: 'u2', displayName: 'Already In' }],
    joinRequests: [{ userId: 'u3', displayName: 'Pending', status: 'pending', type: 'invite' }],
    rounds: [],
  };
  const previous = [
    {
      _id: 'old1',
      organizerId: 'org1',
      updatedAt: '2026-01-01T00:00:00.000Z',
      players: [
        { userId: 'u2', displayName: 'Already In' },
        { userId: 'u3', displayName: 'Pending' },
        { userId: 'u4', displayName: 'Frequent User' },
        { userId: 'anon:a', displayName: 'Mesa Local', isAnonymous: true, anonymousKey: 'mesalocal' },
      ],
      rounds: [],
    },
    {
      _id: 'old2',
      organizerId: 'org1',
      updatedAt: '2026-02-01T00:00:00.000Z',
      players: [
        { userId: 'u4', displayName: 'Frequent User' },
        { userId: 'anon:a', displayName: 'Mesa Local', isAnonymous: true, anonymousKey: 'mesalocal' },
      ],
      rounds: [],
    },
    {
      _id: 'other-store',
      organizerId: 'org2',
      updatedAt: '2026-03-01T00:00:00.000Z',
      players: [{ userId: 'u5', displayName: 'Other Store' }],
      rounds: [],
    },
  ];

  require.cache[tournamentRepositoryPath] = {
    id: tournamentRepositoryPath,
    filename: tournamentRepositoryPath,
    loaded: true,
    exports: {
      findById: async () => JSON.parse(JSON.stringify(current)),
      findAll: async () => [current, ...previous].map(tournament => JSON.parse(JSON.stringify(tournament))),
      saveTournament: async tournament => tournament,
    },
  };
  delete require.cache[servicePath];

  try {
    const service = require('../../src/modules/tournaments/tournament.service');
    const suggestions = await service.listOrganizerPlayerSuggestions('current', 'org1');

    assert.deepEqual(suggestions.map(suggestion => suggestion.userId).sort(), ['anon:a', 'u4']);
    const anonymous = suggestions.find(suggestion => suggestion.isAnonymous);
    assert.equal(anonymous.displayName, 'Mesa Local');
    assert.equal(anonymous.anonymousName, 'Mesa Local');
    assert.equal(anonymous.tournamentsPlayed, 2);
  } finally {
    restoreCache(tournamentRepositoryPath, originalTournamentRepository);
    restoreCache(servicePath, originalService);
  }
});
