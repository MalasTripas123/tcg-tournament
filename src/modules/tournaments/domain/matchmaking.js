function calculateVersusTableSizes(n) {
  if (n <= 0) return [];
  if (n <= 3) return [n];
  const tables = [];
  let remaining = n;
  if (remaining % 2 === 1) {
    tables.push(3);
    remaining -= 3;
  }
  while (remaining > 0) {
    tables.push(Math.min(2, remaining));
    remaining -= 2;
  }
  return tables;
}

function calculateTableSizes(n, tableMode = 'multi') {
  if (tableMode === 'versus') return calculateVersusTableSizes(n);
  if (n < 2) return [n];
  if (n === 2) return [2];
  if (n === 3) return [3];
  if (n === 5) return [3, 2];
  if (n === 6) return [3, 3];

  const tables = [];
  const rem = n % 4;
  let tablesOf3 = 0;

  if (rem === 1) tablesOf3 = 3;
  else if (rem === 2) tablesOf3 = 2;
  else if (rem === 3) tablesOf3 = 1;

  const playersIn3 = tablesOf3 * 3;
  const tablesOf4 = (n - playersIn3) / 4;

  for (let i = 0; i < tablesOf4; i++) tables.push(4);
  for (let i = 0; i < tablesOf3; i++) tables.push(3);

  return tables;
}

function randomPairing(players, tableMode = 'multi') {
  const shuffled = [...players].sort(() => Math.random() - 0.5);
  return assignToTables(shuffled, tableMode);
}

function snakePairing(players, tableMode = 'multi') {
  const sizes = calculateTableSizes(players.length, tableMode);
  const tables = [];
  let lo = 0;
  let hi = players.length - 1;

  for (const size of sizes) {
    const tablePlayers = [];
    let added = 0;

    while (added < size) {
      tablePlayers.push(added % 2 === 0 ? players[lo++] : players[hi--]);
      added++;
    }

    tables.push(createTable(tables.length + 1, tablePlayers));
  }

  return tables;
}

function assignToTables(orderedPlayers, tableMode = 'multi') {
  const sizes = calculateTableSizes(orderedPlayers.length, tableMode);
  return splitBySizes(orderedPlayers, sizes).map((players, index) => createTable(index + 1, players));
}

function createTable(index, players) {
  return {
    id: `t${index}`,
    players: players.map(player => ({
      userId: player.userId,
      displayName: player.displayName,
      isAnonymous: !!player.isAnonymous,
      anonymousKey: player.anonymousKey || '',
      yellowCards: player.yellowCards || 0,
      redCard: !!player.redCard,
      score: 0,
      eliminated: false,
      startScore: player.score || 0,
    })),
    startTime: null,
    endTime: null,
  };
}

function balancedPairing(players, tableMode = 'multi') {
  const ranked = [...players].sort((a, b) => {
    if ((b.score || 0) !== (a.score || 0)) return (b.score || 0) - (a.score || 0);
    return (b.wins || 0) - (a.wins || 0);
  });
  const sizes = calculateTableSizes(ranked.length, tableMode);
  const buckets = sizes.map((size, index) => ({ id: `t${index + 1}`, size, players: [] }));
  let tableIndex = 0;
  let direction = 1;

  for (const player of ranked) {
    buckets[tableIndex].players.push(player);
    if (buckets[tableIndex].players.length === buckets[tableIndex].size) {
      tableIndex += direction;
    } else {
      tableIndex += direction;
      if (tableIndex >= buckets.length) {
        tableIndex = buckets.length - 1;
        direction = -1;
      } else if (tableIndex < 0) {
        tableIndex = 0;
        direction = 1;
      }
    }
    while (buckets[tableIndex] && buckets[tableIndex].players.length >= buckets[tableIndex].size) {
      tableIndex += direction;
    }
    if (tableIndex >= buckets.length) tableIndex = buckets.length - 1;
    if (tableIndex < 0) tableIndex = 0;
  }

  return buckets.map((bucket, index) => createTable(index + 1, bucket.players));
}

function generateRound(players, roundNumber, method = 'snake', tableMode = 'multi') {
  const activePlayers = players.filter(player => !player.eliminatedFromTournament);
  if (method === 'random') return randomPairing(activePlayers, tableMode);
  if (method === 'balanced') return balancedPairing(activePlayers, tableMode);
  if (roundNumber === 1) return randomPairing(activePlayers, tableMode);

  const ranked = [...activePlayers].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return (b.wins || 0) - (a.wins || 0);
  });

  return snakePairing(ranked, tableMode);
}

function calculateEvenTableSizes(playerCount, tableCount) {
  if (tableCount <= 0) return [];
  const base = Math.floor(playerCount / tableCount);
  const extra = playerCount % tableCount;
  return Array.from({ length: tableCount }, (_, index) => base + (index < extra ? 1 : 0));
}

function splitBySizes(orderedPlayers, sizes) {
  const tables = [];
  let cursor = 0;

  for (const size of sizes) {
    tables.push(orderedPlayers.slice(cursor, cursor + size));
    cursor += size;
  }

  return tables;
}

function rankPlayers(players) {
  return [...players].sort((a, b) => {
    if ((b.score || 0) !== (a.score || 0)) return (b.score || 0) - (a.score || 0);
    if ((b.wins || 0) !== (a.wins || 0)) return (b.wins || 0) - (a.wins || 0);
    return String(a.displayName || '').localeCompare(String(b.displayName || ''));
  });
}

function snakeOrder(players) {
  const ranked = rankPlayers(players);
  const ordered = [];
  let lo = 0;
  let hi = ranked.length - 1;

  while (lo <= hi) {
    ordered.push(ranked[lo++]);
    if (lo <= hi) ordered.push(ranked[hi--]);
  }

  return ordered;
}

function balancedBuckets(players, sizes) {
  const buckets = sizes.map(size => ({ size, players: [] }));
  if (!buckets.length) return [];

  let tableIndex = 0;
  let direction = 1;

  for (const player of rankPlayers(players)) {
    while (buckets[tableIndex]?.players.length >= buckets[tableIndex]?.size) {
      tableIndex += direction;
      if (tableIndex >= buckets.length) {
        tableIndex = buckets.length - 1;
        direction = -1;
      } else if (tableIndex < 0) {
        tableIndex = 0;
        direction = 1;
      }
    }

    buckets[tableIndex].players.push(player);
    tableIndex += direction;
    if (tableIndex >= buckets.length) {
      tableIndex = buckets.length - 1;
      direction = -1;
    } else if (tableIndex < 0) {
      tableIndex = 0;
      direction = 1;
    }
  }

  return buckets.map(bucket => bucket.players);
}

function redistributePlayers(players, tableCount, method = 'snake', roundNumber = 1) {
  const sizes = calculateEvenTableSizes(players.length, tableCount);
  if (!sizes.length) return [];

  if (method === 'balanced') return balancedBuckets(players, sizes);

  const orderedPlayers = method === 'random' || (method === 'snake' && roundNumber === 1)
    ? [...players].sort(() => Math.random() - 0.5)
    : snakeOrder(players);

  return splitBySizes(orderedPlayers, sizes);
}

module.exports = {
  calculateTableSizes,
  calculateVersusTableSizes,
  calculateEvenTableSizes,
  randomPairing,
  snakePairing,
  balancedPairing,
  assignToTables,
  generateRound,
  redistributePlayers,
};
