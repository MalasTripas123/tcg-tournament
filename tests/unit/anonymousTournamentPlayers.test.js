const test = require('node:test');
const assert = require('node:assert/strict');

function restoreCache(path, original) {
  if (original) require.cache[path] = original;
  else delete require.cache[path];
}

test('organizer can add anonymous players with stable identity', async () => {
  const tournamentRepositoryPath = require.resolve('../../src/modules/tournaments/tournament.repository');
  const servicePath = require.resolve('../../src/modules/tournaments/tournament.service');
  const originalTournamentRepository = require.cache[tournamentRepositoryPath];
  const originalService = require.cache[servicePath];

  let tournament = {
    _id: 't1',
    organizerId: 'org1',
    organizerName: 'Official Store',
    status: 'lobby',
    isRanked: true,
    players: [],
    joinRequests: [],
    rounds: [],
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
    const saved = await service.addPlayer('t1', 'org1', { anonymousName: '  Mesa   Local ' });

    assert.equal(saved.players.length, 1);
    assert.equal(saved.players[0].displayName, 'Mesa Local');
    assert.equal(saved.players[0].isAnonymous, true);
    assert.match(saved.players[0].userId, /^anon:/);

    await assert.rejects(
      () => service.addPlayer('t1', 'org1', { anonymousName: 'mesalocal' }),
      /ya esta en el torneo/
    );
  } finally {
    restoreCache(tournamentRepositoryPath, originalTournamentRepository);
    restoreCache(servicePath, originalService);
  }
});

test('non-organizers cannot add anonymous players', async () => {
  const tournamentRepositoryPath = require.resolve('../../src/modules/tournaments/tournament.repository');
  const servicePath = require.resolve('../../src/modules/tournaments/tournament.service');
  const originalTournamentRepository = require.cache[tournamentRepositoryPath];
  const originalService = require.cache[servicePath];

  const tournament = {
    _id: 't1',
    organizerId: 'org1',
    organizerName: 'Official Store',
    status: 'lobby',
    isRanked: true,
    players: [],
    joinRequests: [],
    rounds: [],
  };

  require.cache[tournamentRepositoryPath] = {
    id: tournamentRepositoryPath,
    filename: tournamentRepositoryPath,
    loaded: true,
    exports: {
      findById: async () => JSON.parse(JSON.stringify(tournament)),
      findAll: async () => [JSON.parse(JSON.stringify(tournament))],
      saveTournament: async current => current,
    },
  };
  delete require.cache[servicePath];

  try {
    const service = require('../../src/modules/tournaments/tournament.service');
    await assert.rejects(
      () => service.addPlayer('t1', 'u2', { anonymousName: 'Mesa Local' }),
      /Solo el organizador/
    );
  } finally {
    restoreCache(tournamentRepositoryPath, originalTournamentRepository);
    restoreCache(servicePath, originalService);
  }
});
