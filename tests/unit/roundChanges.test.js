const test = require('node:test');
const assert = require('node:assert/strict');

function restoreCache(path, original) {
  if (original) require.cache[path] = original;
  else delete require.cache[path];
}

test('applyRoundChanges saves reordered tables and player scores in one write', async () => {
  const tournamentRepositoryPath = require.resolve('../../src/modules/tournaments/tournament.repository');
  const servicePath = require.resolve('../../src/modules/tournaments/tournament.service');
  const originalTournamentRepository = require.cache[tournamentRepositoryPath];
  const originalService = require.cache[servicePath];

  let saveCount = 0;
  let tournament = {
    _id: 't1',
    organizerId: 'org1',
    organizerName: 'Store',
    status: 'active',
    isRanked: false,
    players: [
      { userId: 'u1', displayName: 'A', score: 0, manualScore: 0, wins: 0, losses: 0, draws: 0 },
      { userId: 'u2', displayName: 'B', score: 0, manualScore: 0, wins: 0, losses: 0, draws: 0 },
    ],
    rounds: [{
      id: 'r1',
      number: 1,
      status: 'pending',
      tables: [
        { id: 't1', type: 'normal', status: 'pending', players: [{ userId: 'u1', displayName: 'A', score: 0, eliminated: false }] },
        { id: 't2', type: 'normal', status: 'pending', players: [{ userId: 'u2', displayName: 'B', score: 0, eliminated: false }] },
        { id: 'bench', type: 'bench', status: 'pending', players: [] },
      ],
    }],
  };

  require.cache[tournamentRepositoryPath] = {
    id: tournamentRepositoryPath,
    filename: tournamentRepositoryPath,
    loaded: true,
    exports: {
      findById: async () => JSON.parse(JSON.stringify(tournament)),
      findAll: async () => [JSON.parse(JSON.stringify(tournament))],
      saveTournament: async current => {
        saveCount += 1;
        tournament = JSON.parse(JSON.stringify(current));
        return JSON.parse(JSON.stringify(tournament));
      },
    },
  };
  delete require.cache[servicePath];

  try {
    const service = require('../../src/modules/tournaments/tournament.service');
    const saved = await service.applyRoundChanges('t1', 'org1', 'r1', [
      {
        type: 'tables',
        tables: [
          { id: 't1', players: [{ userId: 'u2' }] },
          { id: 't2', players: [{ userId: 'u1' }] },
          { id: 'bench', players: [] },
        ],
      },
      { type: 'tablePlayer', tableId: 't2', userId: 'u1', score: 4, eliminated: true },
      { type: 'playerScore', userId: 'u2', score: 3 },
    ]);

    const round = saved.rounds[0];
    assert.equal(saveCount, 1);
    assert.equal(round.tables[0].players[0].userId, 'u2');
    assert.equal(round.tables[1].players[0].userId, 'u1');
    assert.equal(round.tables[1].players[0].score, 4);
    assert.equal(round.tables[1].players[0].eliminated, true);
    assert.equal(saved.players.find(player => player.userId === 'u2').score, 3);
  } finally {
    restoreCache(tournamentRepositoryPath, originalTournamentRepository);
    restoreCache(servicePath, originalService);
  }
});
