function accumulateRoundScores(tournament, round) {
  for (const table of round.tables) {
    if (table.type === 'bench') continue;
    for (const tablePlayer of table.players) {
      const player = tournament.players.find(p => p.userId === tablePlayer.userId);
      if (!player) continue;

      player.score = (player.score || 0) + (tablePlayer.score || 0);

      if (table.result === 'winner' && table.winner?.userId === tablePlayer.userId) {
        player.wins = (player.wins || 0) + 1;
      } else if (table.result === 'draw' && table.drawPlayers?.some(draw => draw.userId === tablePlayer.userId)) {
        player.draws = (player.draws || 0) + 1;
      } else if (!tablePlayer.eliminated) {
        player.losses = (player.losses || 0) + 1;
      }
    }
  }
}

function inferTableResult(table) {
  if (table.type === 'bench') return table;
  if (table.result) return table;

  const activePlayers = table.players.filter(player => !player.eliminated);
  if (!activePlayers.length) {
    table.result = 'none';
    table.winner = null;
    table.drawPlayers = [];
    return table;
  }

  const maxScore = Math.max(...activePlayers.map(player => player.score || 0));
  const topPlayers = activePlayers.filter(player => (player.score || 0) === maxScore);

  if (topPlayers.length === 1) {
    table.result = 'winner';
    table.winner = {
      userId: topPlayers[0].userId,
      displayName: topPlayers[0].displayName,
    };
    table.drawPlayers = [];
  } else {
    table.result = 'draw';
    table.winner = null;
    table.drawPlayers = topPlayers.map(player => ({
      userId: player.userId,
      displayName: player.displayName,
    }));
  }

  return table;
}

module.exports = {
  accumulateRoundScores,
  inferTableResult,
};
