const test = require('node:test');
const assert = require('node:assert/strict');

function restoreCache(path, original) {
  if (original) require.cache[path] = original;
  else delete require.cache[path];
}

function baseTournament(overrides = {}) {
  return {
    _id: 't1',
    name: 'Lifecycle Cup',
    organizerId: 'org1',
    organizerName: 'Official Store',
    status: 'active',
    isRanked: false,
    totalRounds: 2,
    currentRound: 1,
    roundDuration: 50,
    pairingMethod: 'snake',
    tableMode: 'multi',
    moderators: [],
    auditLog: [],
    players: [
      { userId: 'u1', displayName: 'A', score: 3, manualScore: 0, wins: 1, losses: 0, draws: 0 },
      { userId: 'u2', displayName: 'B', score: 0, manualScore: 0, wins: 0, losses: 1, draws: 0 },
    ],
    rounds: [{
      id: 'r1',
      number: 1,
      status: 'active',
      tables: [
        { id: 't1', type: 'normal', status: 'active', players: [{ userId: 'u1', displayName: 'A', score: 0, eliminated: false }] },
        { id: 'bench', type: 'bench', status: 'pending', players: [] },
      ],
    }],
    ...overrides,
  };
}

test('addRound and removeRound adjust active tournament round count safely', async () => {
  const tournamentRepositoryPath = require.resolve('../../src/modules/tournaments/tournament.repository');
  const servicePath = require.resolve('../../src/modules/tournaments/tournament.service');
  const originalTournamentRepository = require.cache[tournamentRepositoryPath];
  const originalService = require.cache[servicePath];

  let tournament = baseTournament();

  require.cache[tournamentRepositoryPath] = {
    id: tournamentRepositoryPath,
    filename: tournamentRepositoryPath,
    loaded: true,
    exports: {
      findById: async () => JSON.parse(JSON.stringify(tournament)),
      findAll: async () => [JSON.parse(JSON.stringify(tournament))],
      saveTournament: async current => {
        tournament = JSON.parse(JSON.stringify(current));
        return JSON.parse(JSON.stringify(tournament));
      },
    },
  };
  delete require.cache[servicePath];

  try {
    const service = require('../../src/modules/tournaments/tournament.service');
    let saved = await service.addRound('t1', 'org1');
    assert.equal(saved.totalRounds, 3);
    assert.equal(saved.rounds.length, 1);
    assert.equal(saved.auditLog.at(-1).type, 'round_added');

    saved = await service.removeRound('t1', 'org1');
    assert.equal(saved.totalRounds, 2);
    assert.equal(saved.rounds.length, 1);
    assert.equal(saved.auditLog.at(-1).type, 'round_removed');
  } finally {
    restoreCache(tournamentRepositoryPath, originalTournamentRepository);
    restoreCache(servicePath, originalService);
  }
});

test('adjustTournamentScores changes every player total in one operation', async () => {
  const tournamentRepositoryPath = require.resolve('../../src/modules/tournaments/tournament.repository');
  const servicePath = require.resolve('../../src/modules/tournaments/tournament.service');
  const originalTournamentRepository = require.cache[tournamentRepositoryPath];
  const originalService = require.cache[servicePath];

  let tournament = baseTournament();

  require.cache[tournamentRepositoryPath] = {
    id: tournamentRepositoryPath,
    filename: tournamentRepositoryPath,
    loaded: true,
    exports: {
      findById: async () => JSON.parse(JSON.stringify(tournament)),
      findAll: async () => [JSON.parse(JSON.stringify(tournament))],
      saveTournament: async current => {
        tournament = JSON.parse(JSON.stringify(current));
        return JSON.parse(JSON.stringify(tournament));
      },
    },
  };
  delete require.cache[servicePath];

  try {
    const service = require('../../src/modules/tournaments/tournament.service');
    const saved = await service.adjustTournamentScores('t1', 'org1', 2);
    assert.deepEqual(saved.players.map(player => player.score), [5, 2]);
    assert.equal(saved.auditLog.at(-1).type, 'tournament_scores_adjusted');
  } finally {
    restoreCache(tournamentRepositoryPath, originalTournamentRepository);
    restoreCache(servicePath, originalService);
  }
});

test('deleteTournament soft deletes and rebuilds organizer ranking without the deleted tournament', async () => {
  const authServicePath = require.resolve('../../src/modules/auth/auth.service');
  const userRepositoryPath = require.resolve('../../src/modules/users/user.repository');
  const tournamentRepositoryPath = require.resolve('../../src/modules/tournaments/tournament.repository');
  const servicePath = require.resolve('../../src/modules/tournaments/tournament.service');
  const originalAuthService = require.cache[authServicePath];
  const originalUserRepository = require.cache[userRepositoryPath];
  const originalTournamentRepository = require.cache[tournamentRepositoryPath];
  const originalService = require.cache[servicePath];

  let tournament = baseTournament({
    status: 'finished',
    isRanked: true,
    totalRounds: 1,
    currentRound: 1,
    rankingApplied: true,
    rankingDeltas: [{ userId: 'u1', displayName: 'A', points: 5, rank: 1 }],
    rounds: [{
      id: 'r1',
      number: 1,
      status: 'finished',
      tables: [{ id: 't1', type: 'normal', status: 'finished', players: [] }],
    }],
  });
  const rankingCalls = [];

  require.cache[authServicePath] = {
    id: authServicePath,
    filename: authServicePath,
    loaded: true,
    exports: {
      verifyPassword: async () => ({ uid: 'org1' }),
    },
  };
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
      findById: async () => JSON.parse(JSON.stringify(tournament)),
      findAll: async () => [],
      saveTournament: async current => {
        tournament = JSON.parse(JSON.stringify(current));
        return JSON.parse(JSON.stringify(tournament));
      },
    },
  };
  delete require.cache[servicePath];

  try {
    const service = require('../../src/modules/tournaments/tournament.service');
    const saved = await service.deleteTournament('t1', 'org1', { password: '1234', reason: 'duplicate' });

    assert.equal(saved.deletedBy, 'org1');
    assert.equal(saved.deletionReason, 'duplicate');
    assert.ok(saved.deletedAt);
    assert.equal(saved.deletionSnapshot._id, 't1');
    assert.equal(saved.auditLog.at(-1).type, 'tournament_deleted');
    assert.equal(rankingCalls.length, 1);
    assert.deepEqual(rankingCalls[0], ['org1', '', []]);
  } finally {
    restoreCache(authServicePath, originalAuthService);
    restoreCache(userRepositoryPath, originalUserRepository);
    restoreCache(tournamentRepositoryPath, originalTournamentRepository);
    restoreCache(servicePath, originalService);
  }
});

test('updateTournamentSettings edits lobby schedule and respects ranked minimum', async () => {
  const tournamentRepositoryPath = require.resolve('../../src/modules/tournaments/tournament.repository');
  const servicePath = require.resolve('../../src/modules/tournaments/tournament.service');
  const originalTournamentRepository = require.cache[tournamentRepositoryPath];
  const originalService = require.cache[servicePath];

  let tournament = baseTournament({
    status: 'lobby',
    isRanked: true,
    totalRounds: 3,
    currentRound: 0,
    rounds: [],
    players: Array.from({ length: 8 }, (_, index) => ({
      userId: `u${index + 1}`,
      displayName: `Player ${index + 1}`,
      score: 0,
      manualScore: 0,
      wins: 0,
      losses: 0,
      draws: 0,
    })),
  });

  require.cache[tournamentRepositoryPath] = {
    id: tournamentRepositoryPath,
    filename: tournamentRepositoryPath,
    loaded: true,
    exports: {
      findById: async () => JSON.parse(JSON.stringify(tournament)),
      findAll: async () => [JSON.parse(JSON.stringify(tournament))],
      saveTournament: async current => {
        tournament = JSON.parse(JSON.stringify(current));
        return JSON.parse(JSON.stringify(tournament));
      },
    },
  };
  delete require.cache[servicePath];

  try {
    const service = require('../../src/modules/tournaments/tournament.service');
    await assert.rejects(
      () => service.updateTournamentSettings('t1', 'org1', { maxPlayers: 7 }),
      /El maximo debe ser al menos 8 jugadores/
    );

    const saved = await service.updateTournamentSettings('t1', 'org1', {
      scheduledStartAt: 1800000000000,
      minPlayers: 10,
      maxPlayers: 12,
      totalRounds: 5,
      roundDuration: 0,
      bannerUrl: 'https://example.com/banner.png',
    });

    assert.equal(saved.scheduledStartAt, 1800000000000);
    assert.equal(saved.minPlayers, 10);
    assert.equal(saved.maxPlayers, 12);
    assert.equal(saved.totalRounds, 5);
    assert.equal(saved.roundDuration, 0);
    assert.equal(saved.bannerUrl, 'https://example.com/banner.png');
  } finally {
    restoreCache(tournamentRepositoryPath, originalTournamentRepository);
    restoreCache(servicePath, originalService);
  }
});

test('players can reject stale pending invitations after a tournament is finished', async () => {
  const tournamentRepositoryPath = require.resolve('../../src/modules/tournaments/tournament.repository');
  const servicePath = require.resolve('../../src/modules/tournaments/tournament.service');
  const originalTournamentRepository = require.cache[tournamentRepositoryPath];
  const originalService = require.cache[servicePath];

  let tournament = baseTournament({
    status: 'finished',
    joinRequests: [{ userId: 'u1', displayName: 'A', type: 'invite', status: 'pending', invitedBy: 'org1' }],
  });

  require.cache[tournamentRepositoryPath] = {
    id: tournamentRepositoryPath,
    filename: tournamentRepositoryPath,
    loaded: true,
    exports: {
      findById: async () => JSON.parse(JSON.stringify(tournament)),
      findAll: async () => [JSON.parse(JSON.stringify(tournament))],
      saveTournament: async current => {
        tournament = JSON.parse(JSON.stringify(current));
        return JSON.parse(JSON.stringify(tournament));
      },
    },
  };
  delete require.cache[servicePath];

  try {
    const service = require('../../src/modules/tournaments/tournament.service');
    const saved = await service.handleInvitation('t1', 'u1', 'reject');
    assert.equal(saved.joinRequests[0].status, 'rejected');
    assert.equal(saved.auditLog.at(-1).type, 'invitation_rejected');
  } finally {
    restoreCache(tournamentRepositoryPath, originalTournamentRepository);
    restoreCache(servicePath, originalService);
  }
});

test('adding a player through another path clears their pending invitation', async () => {
  const userRepositoryPath = require.resolve('../../src/modules/users/user.repository');
  const tournamentRepositoryPath = require.resolve('../../src/modules/tournaments/tournament.repository');
  const servicePath = require.resolve('../../src/modules/tournaments/tournament.service');
  const originalUserRepository = require.cache[userRepositoryPath];
  const originalTournamentRepository = require.cache[tournamentRepositoryPath];
  const originalService = require.cache[servicePath];

  let tournament = baseTournament({
    status: 'lobby',
    visibility: 'public',
    players: [],
    rounds: [],
    currentRound: 0,
    joinRequests: [{ userId: 'u1', displayName: 'A', type: 'invite', status: 'pending', invitedBy: 'org1' }],
  });

  require.cache[userRepositoryPath] = {
    id: userRepositoryPath,
    filename: userRepositoryPath,
    loaded: true,
    exports: {
      findByPublicId: async () => ({ uid: 'u1', displayName: 'A', username: 'player_a' }),
    },
  };
  require.cache[tournamentRepositoryPath] = {
    id: tournamentRepositoryPath,
    filename: tournamentRepositoryPath,
    loaded: true,
    exports: {
      findById: async () => JSON.parse(JSON.stringify(tournament)),
      findAll: async () => [JSON.parse(JSON.stringify(tournament))],
      saveTournament: async current => {
        tournament = JSON.parse(JSON.stringify(current));
        return JSON.parse(JSON.stringify(tournament));
      },
    },
  };
  delete require.cache[servicePath];

  try {
    const service = require('../../src/modules/tournaments/tournament.service');
    const saved = await service.addPlayer('t1', 'u1');
    assert.equal(saved.players.length, 1);
    assert.equal(saved.joinRequests[0].status, 'accepted');
  } finally {
    restoreCache(userRepositoryPath, originalUserRepository);
    restoreCache(tournamentRepositoryPath, originalTournamentRepository);
    restoreCache(servicePath, originalService);
  }
});
