const { sortStandings } = require('./standings');

const RANKING_FORMULA_VERSION = 2;

function calculateRankingDeltas(tournament) {
  if (!tournament.isRanked) return [];

  const eligiblePlayers = (tournament.players || []).filter(player => !player.eliminatedFromTournament);
  const standings = sortStandings(eligiblePlayers, tournament.rounds || []);
  const total = standings.length;

  return standings.map((player, index) => {
    const rank = index + 1;
    return {
      userId: player.userId,
      rank,
      points: pointsForRank(rank, total),
      countTournament: 1,
    };
  });
}

function pointsForRank(rank, total) {
  if (total <= 0 || rank < 1 || rank > total) return 0;

  const upperHalfSize = Math.ceil(total / 2);
  const lowerHalfSize = total - upperHalfSize;
  const upperQuarterSize = Math.ceil(upperHalfSize / 2);
  const upperMiddleQuarterSize = upperHalfSize - upperQuarterSize;
  const lowerMiddleQuarterSize = Math.floor(lowerHalfSize / 2);

  let points;
  if (rank <= upperQuarterSize) points = 2;
  else if (rank <= upperQuarterSize + upperMiddleQuarterSize) points = 1;
  else if (rank <= upperQuarterSize + upperMiddleQuarterSize + lowerMiddleQuarterSize) points = -1;
  else points = -2;

  if (rank === 1) points += 3;
  else if (rank === 2) points += 2;
  else if (rank === 3) points += 1;

  return points;
}

function invertDeltas(deltas) {
  return (deltas || []).map(delta => ({
    userId: delta.userId,
    rank: delta.rank,
    points: -delta.points,
    countTournament: -1,
  }));
}

module.exports = {
  RANKING_FORMULA_VERSION,
  calculateRankingDeltas,
  pointsForRank,
  invertDeltas,
};
