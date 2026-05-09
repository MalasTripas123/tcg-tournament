const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateRankingDeltas, pointsForRank } = require('../../src/modules/tournaments/domain/ranking');

test('calculateRankingDeltas skips disqualified players and assigns positive/negative points', () => {
  const tournament = {
    isRanked: true,
    players: [
      { userId: 'u1', score: 9, wins: 3, losses: 0, draws: 0 },
      { userId: 'u2', score: 6, wins: 2, losses: 1, draws: 0 },
      { userId: 'u3', score: 3, wins: 1, losses: 2, draws: 0 },
      { userId: 'u4', score: 0, wins: 0, losses: 3, draws: 0 },
      { userId: 'u5', score: 8, wins: 2, losses: 1, draws: 0, eliminatedFromTournament: true },
    ],
    rounds: [],
  };

  const deltas = calculateRankingDeltas(tournament);
  assert.deepEqual(deltas.map(delta => delta.userId), ['u1', 'u2', 'u3', 'u4']);
  assert.equal(deltas[0].points, 5);
  assert.equal(deltas.at(-1).points, -2);
});

test('pointsForRank splits standings into quarters with top-three bonuses', () => {
  assert.deepEqual(
    Array.from({ length: 8 }, (_, index) => pointsForRank(index + 1, 8)),
    [5, 4, 2, 1, -1, -1, -2, -2]
  );
});

test('pointsForRank sends odd remainders to the requested upper/lower quarters', () => {
  assert.deepEqual(
    Array.from({ length: 9 }, (_, index) => pointsForRank(index + 1, 9)),
    [5, 4, 3, 1, 1, -1, -1, -2, -2]
  );
  assert.deepEqual(
    Array.from({ length: 10 }, (_, index) => pointsForRank(index + 1, 10)),
    [5, 4, 3, 1, 1, -1, -1, -2, -2, -2]
  );
});
