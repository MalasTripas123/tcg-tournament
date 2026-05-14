const test = require('node:test');
const assert = require('node:assert/strict');

function restoreCache(path, original) {
  if (original) require.cache[path] = original;
  else delete require.cache[path];
}

test('replaceOrganizerRanking persists concrete points and played tournaments', async () => {
  const userModelPath = require.resolve('../../src/modules/users/user.model');
  const repositoryPath = require.resolve('../../src/modules/users/user.repository');
  const originalUserModel = require.cache[userModelPath];
  const originalRepository = require.cache[repositoryPath];

  const calls = { updateMany: [], bulkWrite: [], updateOne: [] };
  require.cache[userModelPath] = {
    id: userModelPath,
    filename: userModelPath,
    loaded: true,
    exports: {
      updateMany: async (...args) => calls.updateMany.push(args),
      bulkWrite: async ops => calls.bulkWrite.push(ops),
      updateOne: async (...args) => calls.updateOne.push(args),
    },
  };
  delete require.cache[repositoryPath];

  try {
    const repository = require('../../src/modules/users/user.repository');
    await repository.replaceOrganizerRanking('org1', 'Official Store', [
      { userId: 'u2', points: 5, tournamentsPlayed: 1 },
      { userId: 'u3', points: '-2', tournamentsPlayed: '3' },
      { userId: 'u4', points: 9, tournamentsPlayed: 0 },
      { userId: 'anon:abc', displayName: 'Mesa Local', isAnonymous: true, anonymousKey: 'mesalocal', points: 4, tournamentsPlayed: 2 },
    ]);

    assert.deepEqual(calls.updateMany[0], [
      { 'rankings.organizerId': 'org1' },
      { $pull: { rankings: { organizerId: 'org1' } } },
    ]);
    assert.equal(calls.bulkWrite[0].length, 2);
    assert.equal(calls.bulkWrite[0][0].updateOne.update.$push.rankings.points, 5);
    assert.equal(calls.bulkWrite[0][0].updateOne.update.$push.rankings.tournamentsPlayed, 1);
    assert.equal(calls.bulkWrite[0][1].updateOne.update.$push.rankings.points, -2);
    assert.equal(calls.bulkWrite[0][1].updateOne.update.$push.rankings.tournamentsPlayed, 3);
    assert.deepEqual(calls.updateOne[0], [
      { uid: 'org1' },
      {
        $set: {
          anonymousRankings: [{
            userId: 'anon:abc',
            anonymousKey: 'mesalocal',
            displayName: 'Mesa Local',
            points: 4,
            tournamentsPlayed: 2,
          }],
        },
      },
      { runValidators: true },
    ]);
  } finally {
    restoreCache(userModelPath, originalUserModel);
    restoreCache(repositoryPath, originalRepository);
  }
});

test('rebuildAllOrganizerRankings rebuilds user rankings from finished ranked tournaments', async () => {
  const userRepositoryPath = require.resolve('../../src/modules/users/user.repository');
  const tournamentRepositoryPath = require.resolve('../../src/modules/tournaments/tournament.repository');
  const servicePath = require.resolve('../../src/modules/tournaments/tournament.service');
  const originalUserRepository = require.cache[userRepositoryPath];
  const originalTournamentRepository = require.cache[tournamentRepositoryPath];
  const originalService = require.cache[servicePath];

  const tournament = {
    _id: 't1',
    name: 'Ranked Cup',
    organizerId: 'org1',
    organizerName: 'Official Store',
    status: 'finished',
    isRanked: true,
    players: Array.from({ length: 8 }, (_, index) => ({
      userId: `u${index + 2}`,
      displayName: `Player ${index + 1}`,
      isAnonymous: index === 7,
      anonymousKey: index === 7 ? 'player8' : '',
      score: 0,
      manualScore: 0,
      wins: 0,
      losses: 0,
      draws: 0,
      eliminatedFromTournament: false,
    })),
    rounds: [{
      id: 'r1',
      number: 1,
      status: 'finished',
      tables: [{
        id: 't1',
        type: 'normal',
        result: 'winner',
        winner: { userId: 'u2', displayName: 'Player 1' },
        players: Array.from({ length: 8 }, (_, index) => ({
          userId: `u${index + 2}`,
          displayName: `Player ${index + 1}`,
          isAnonymous: index === 7,
          anonymousKey: index === 7 ? 'player8' : '',
          score: 8 - index,
          eliminated: false,
        })),
      }],
    }],
  };

  const rankingCalls = [];
  require.cache[userRepositoryPath] = {
    id: userRepositoryPath,
    filename: userRepositoryPath,
    loaded: true,
    exports: {
      replaceOrganizerRanking: async (...args) => rankingCalls.push(args),
    },
  };
  require.cache[tournamentRepositoryPath] = {
    id: tournamentRepositoryPath,
    filename: tournamentRepositoryPath,
    loaded: true,
    exports: {
      findAll: async () => [JSON.parse(JSON.stringify(tournament))],
      saveTournament: async current => current,
    },
  };
  delete require.cache[servicePath];

  try {
    const service = require('../../src/modules/tournaments/tournament.service');
    await service.rebuildAllOrganizerRankings();

    assert.equal(rankingCalls.length, 1);
    assert.equal(rankingCalls[0][0], 'org1');
    assert.equal(rankingCalls[0][1], 'Official Store');
    assert.equal(rankingCalls[0][2].length, 8);
    assert.deepEqual(rankingCalls[0][2][0], {
      userId: 'u2',
      displayName: 'Player 1',
      isAnonymous: false,
      anonymousKey: '',
      points: 5,
      tournamentsPlayed: 1,
    });
    assert.deepEqual(rankingCalls[0][2][7], {
      userId: 'u9',
      displayName: 'Player 8',
      isAnonymous: true,
      anonymousKey: 'player8',
      points: -2,
      tournamentsPlayed: 1,
    });
  } finally {
    restoreCache(userRepositoryPath, originalUserRepository);
    restoreCache(tournamentRepositoryPath, originalTournamentRepository);
    restoreCache(servicePath, originalService);
  }
});

test('rebuildAllOrganizerRankings preserves legacy manual score adjustments', async () => {
  const userRepositoryPath = require.resolve('../../src/modules/users/user.repository');
  const tournamentRepositoryPath = require.resolve('../../src/modules/tournaments/tournament.repository');
  const servicePath = require.resolve('../../src/modules/tournaments/tournament.service');
  const originalUserRepository = require.cache[userRepositoryPath];
  const originalTournamentRepository = require.cache[tournamentRepositoryPath];
  const originalService = require.cache[servicePath];

  const tablePlayers = Array.from({ length: 8 }, (_, index) => ({
    userId: `u${index + 2}`,
    displayName: `Player ${index + 1}`,
    score: index === 0 ? 1 : 9 - index,
    eliminated: false,
  }));
  const tournament = {
    _id: 't1',
    name: 'Legacy Ranked Cup',
    organizerId: 'org1',
    organizerName: 'Official Store',
    status: 'finished',
    isRanked: true,
    players: tablePlayers.map(player => ({
      userId: player.userId,
      displayName: player.displayName,
      score: player.userId === 'u2' ? 20 : player.score,
      wins: 0,
      losses: 0,
      draws: 0,
      eliminatedFromTournament: false,
    })),
    rounds: [{
      id: 'r1',
      number: 1,
      status: 'finished',
      tables: [{
        id: 't1',
        type: 'normal',
        result: 'winner',
        winner: { userId: 'u3', displayName: 'Player 2' },
        players: tablePlayers,
      }],
    }],
  };

  const rankingCalls = [];
  require.cache[userRepositoryPath] = {
    id: userRepositoryPath,
    filename: userRepositoryPath,
    loaded: true,
    exports: {
      replaceOrganizerRanking: async (...args) => rankingCalls.push(args),
    },
  };
  require.cache[tournamentRepositoryPath] = {
    id: tournamentRepositoryPath,
    filename: tournamentRepositoryPath,
    loaded: true,
    exports: {
      findAll: async () => [JSON.parse(JSON.stringify(tournament))],
      saveTournament: async current => current,
    },
  };
  delete require.cache[servicePath];

  try {
    const service = require('../../src/modules/tournaments/tournament.service');
    await service.rebuildAllOrganizerRankings();

    assert.equal(rankingCalls[0][2][0].userId, 'u2');
    assert.equal(rankingCalls[0][2][0].points, 5);
    assert.equal(rankingCalls[0][2][0].tournamentsPlayed, 1);
  } finally {
    restoreCache(userRepositoryPath, originalUserRepository);
    restoreCache(tournamentRepositoryPath, originalTournamentRepository);
    restoreCache(servicePath, originalService);
  }
});
