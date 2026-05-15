const test = require('node:test');
const assert = require('node:assert/strict');
const {
  calculateTableSizes,
  calculateVersusTableSizes,
  generateRound,
  redistributePlayers,
} = require('../../src/modules/tournaments/domain/matchmaking');

test('calculateTableSizes prefers pods of 4 and avoids pods of 2 when possible', () => {
  assert.deepEqual(calculateTableSizes(4), [4]);
  assert.deepEqual(calculateTableSizes(5), [3, 2]);
  assert.deepEqual(calculateTableSizes(6), [3, 3]);
  assert.deepEqual(calculateTableSizes(7), [4, 3]);
  assert.deepEqual(calculateTableSizes(9), [3, 3, 3]);
  assert.deepEqual(calculateTableSizes(10), [4, 3, 3]);
  assert.deepEqual(calculateTableSizes(13), [4, 3, 3, 3]);
});

test('calculateTableSizes supports versus tables of two with one odd table of three', () => {
  assert.deepEqual(calculateVersusTableSizes(2), [2]);
  assert.deepEqual(calculateVersusTableSizes(3), [3]);
  assert.deepEqual(calculateVersusTableSizes(5), [3, 2]);
  assert.deepEqual(calculateVersusTableSizes(8), [2, 2, 2, 2]);
  assert.deepEqual(calculateTableSizes(7, 'versus'), [3, 2, 2]);
});

test('generateRound keeps eliminated tournament players out of pairings', () => {
  const players = [
    { userId: 'u1', displayName: 'A', score: 0 },
    { userId: 'u2', displayName: 'B', score: 0 },
    { userId: 'u3', displayName: 'C', score: 0, eliminatedFromTournament: true },
    { userId: 'u4', displayName: 'D', score: 0 },
  ];

  const tables = generateRound(players, 2);
  const pairedIds = tables.flatMap(table => table.players.map(player => player.userId));
  assert.deepEqual(new Set(pairedIds), new Set(['u1', 'u2', 'u4']));
});

test('redistributePlayers keeps existing table count and balances player counts', () => {
  const players = Array.from({ length: 8 }, (_, index) => ({
    userId: 'u' + (index + 1),
    displayName: 'Player ' + (index + 1),
    score: 8 - index,
  }));

  const tables = redistributePlayers(players, 3, 'balanced', 2);
  assert.deepEqual(tables.map(table => table.length), [3, 3, 2]);
  assert.deepEqual(
    new Set(tables.flat().map(player => player.userId)),
    new Set(players.map(player => player.userId))
  );
});
