const test = require('node:test');
const assert = require('node:assert/strict');

function restoreCache(path, original) {
  if (original) require.cache[path] = original;
  else delete require.cache[path];
}

function createData(overrides = {}) {
  return {
    name: 'Store Night',
    bannerUrl: '',
    gameId: '',
    gameFormatId: '',
    scheduledStartAt: null,
    totalRounds: 3,
    roundDuration: 50,
    minPlayers: null,
    maxPlayers: null,
    visibility: 'public',
    pairingMethod: 'snake',
    tableMode: 'multi',
    prizes: [],
    ...overrides,
  };
}

async function withCreateTournamentMocks(user, fn) {
  const userRepositoryPath = require.resolve('../../src/modules/users/user.repository');
  const tournamentRepositoryPath = require.resolve('../../src/modules/tournaments/tournament.repository');
  const authServicePath = require.resolve('../../src/modules/auth/auth.service');
  const servicePath = require.resolve('../../src/modules/tournaments/tournament.service');
  const originalUserRepository = require.cache[userRepositoryPath];
  const originalTournamentRepository = require.cache[tournamentRepositoryPath];
  const originalAuthService = require.cache[authServicePath];
  const originalService = require.cache[servicePath];

  require.cache[userRepositoryPath] = {
    id: userRepositoryPath,
    filename: userRepositoryPath,
    loaded: true,
    exports: {
      findByUid: async () => user,
    },
  };
  require.cache[tournamentRepositoryPath] = {
    id: tournamentRepositoryPath,
    filename: tournamentRepositoryPath,
    loaded: true,
    exports: {
      createTournament: async data => ({ _id: 'created', ...JSON.parse(JSON.stringify(data)) }),
      findById: async () => null,
      findAll: async () => [],
      saveTournament: async tournament => tournament,
    },
  };
  delete require.cache[authServicePath];
  delete require.cache[servicePath];

  try {
    const service = require('../../src/modules/tournaments/tournament.service');
    await fn(service);
  } finally {
    restoreCache(userRepositoryPath, originalUserRepository);
    restoreCache(tournamentRepositoryPath, originalTournamentRepository);
    restoreCache(authServicePath, originalAuthService);
    restoreCache(servicePath, originalService);
  }
}

test('licensed organizer creates ranked tournaments by default', async () => {
  await withCreateTournamentMocks({
    uid: 'org1',
    username: 'official_store',
    displayName: 'Official Store',
    role: 'organizer',
    isLicensed: true,
  }, async service => {
    const tournament = await service.createTournament(createData(), 'org1');
    assert.equal(tournament.isRanked, true);
  });
});

test('licensed organizer can create casual tournaments without ranked minimum', async () => {
  await withCreateTournamentMocks({
    uid: 'org1',
    username: 'official_store',
    displayName: 'Official Store',
    role: 'organizer',
    isLicensed: true,
  }, async service => {
    const tournament = await service.createTournament(createData({ isRanked: false, maxPlayers: 4 }), 'org1');
    assert.equal(tournament.isRanked, false);
    assert.equal(tournament.maxPlayers, 4);
  });
});

test('non-licensed organizer cannot force ranked tournaments', async () => {
  await withCreateTournamentMocks({
    uid: 'org2',
    username: 'casual_org',
    displayName: 'Casual Org',
    role: 'organizer',
    isLicensed: false,
  }, async service => {
    const tournament = await service.createTournament(createData({ isRanked: true }), 'org2');
    assert.equal(tournament.isRanked, false);
  });
});
