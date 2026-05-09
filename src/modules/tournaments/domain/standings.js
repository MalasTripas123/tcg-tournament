function calculateOpponentWinPercentage(player, allPlayers, rounds) {
  const opponentIds = new Set();

  for (const round of rounds || []) {
    if (round.status !== 'finished') continue;
    for (const table of round.tables || []) {
      const inTable = table.players.some(p => p.userId === player.userId);
      if (!inTable) continue;
      for (const tablePlayer of table.players) {
        if (tablePlayer.userId !== player.userId) opponentIds.add(tablePlayer.userId);
      }
    }
  }

  if (!opponentIds.size) return null;

  const rates = [];
  for (const opponentId of opponentIds) {
    const opponent = allPlayers.find(p => p.userId === opponentId);
    if (!opponent) continue;
    const total = (opponent.wins || 0) + (opponent.losses || 0) + (opponent.draws || 0);
    if (!total) continue;
    rates.push(((opponent.wins || 0) + (opponent.draws || 0) * 0.5) / total);
  }

  if (!rates.length) return null;
  return rates.reduce((sum, rate) => sum + rate, 0) / rates.length;
}

function sortStandings(players, rounds = []) {
  return [...players]
    .map(player => ({
      ...player,
      owp: calculateOpponentWinPercentage(player, players, rounds),
    }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if ((b.wins || 0) !== (a.wins || 0)) return (b.wins || 0) - (a.wins || 0);
      if (b.owp !== null && a.owp !== null) return b.owp - a.owp;
      return 0;
    });
}

module.exports = {
  calculateOpponentWinPercentage,
  sortStandings,
};
