const test = require('node:test');
const assert = require('node:assert/strict');
const { accumulateRoundScores, inferTableResult } = require('../../src/modules/tournaments/domain/scoring');

test('inferTableResult assigns winner when one active player has top score', () => {
  const table = {
    players: [
      { userId: 'u1', displayName: 'A', score: 3, eliminated: false },
      { userId: 'u2', displayName: 'B', score: 1, eliminated: false },
    ],
  };

  inferTableResult(table);
  assert.equal(table.result, 'winner');
  assert.deepEqual(table.winner, { userId: 'u1', displayName: 'A' });
});

test('inferTableResult preserves explicit no-result tables', () => {
  const table = {
    result: 'none',
    players: [
      { userId: 'u1', displayName: 'A', score: 5, eliminated: false },
      { userId: 'u2', displayName: 'B', score: 1, eliminated: false },
    ],
  };

  inferTableResult(table);
  assert.equal(table.result, 'none');
  assert.equal(table.winner, undefined);
});

test('accumulateRoundScores applies points and record stats', () => {
  const tournament = {
    players: [
      { userId: 'u1', score: 0, wins: 0, losses: 0, draws: 0 },
      { userId: 'u2', score: 0, wins: 0, losses: 0, draws: 0 },
    ],
  };
  const round = {
    tables: [{
      result: 'winner',
      winner: { userId: 'u1', displayName: 'A' },
      players: [
        { userId: 'u1', score: 4, eliminated: false },
        { userId: 'u2', score: 2, eliminated: false },
      ],
    }],
  };

  accumulateRoundScores(tournament, round);
  assert.equal(tournament.players[0].score, 4);
  assert.equal(tournament.players[0].wins, 1);
  assert.equal(tournament.players[1].score, 2);
  assert.equal(tournament.players[1].losses, 1);
});

test('accumulateRoundScores preserves manual score already present on players', () => {
  const tournament = {
    players: [
      { userId: 'u1', score: 2, wins: 0, losses: 0, draws: 0 },
      { userId: 'u2', score: -1, wins: 0, losses: 0, draws: 0 },
    ],
  };
  const round = {
    tables: [{
      result: 'draw',
      drawPlayers: [{ userId: 'u1' }, { userId: 'u2' }],
      players: [
        { userId: 'u1', score: 3, eliminated: false },
        { userId: 'u2', score: 3, eliminated: false },
      ],
    }],
  };

  accumulateRoundScores(tournament, round);
  assert.equal(tournament.players[0].score, 5);
  assert.equal(tournament.players[1].score, 2);
  assert.equal(tournament.players[0].draws, 1);
  assert.equal(tournament.players[1].draws, 1);
});
