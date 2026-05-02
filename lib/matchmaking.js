// lib/matchmaking.js
// Algoritmo de emparejamiento y cálculo de mesas (pods).

/**
 * Calcula la distribución óptima de jugadores en mesas.
 *
 * Reglas:
 *  - Tamaño ideal: 4 jugadores.
 *  - Si no es múltiplo de 4, preferir mesas de 3 antes que mesas de 2.
 *  - Ejemplos:
 *      10 → [4, 3, 3]   (NO [4, 4, 2])
 *       5 → [3, 2]      (excepción forzada: no hay otra opción)
 *       6 → [3, 3]
 *       7 → [4, 3]
 *       8 → [4, 4]
 *       9 → [3, 3, 3]
 *      11 → [4, 4, 3]
 *      12 → [4, 4, 4]
 *
 * @param {number} n - Número de jugadores
 * @returns {number[]} - Array con el tamaño de cada mesa
 */
function calculateTableSizes(n) {
  if (n < 2) return [n];
  if (n === 2) return [2];
  if (n === 3) return [3];

  // Casos especiales pequeños
  if (n === 5) return [3, 2];
  if (n === 6) return [3, 3];

  // Estrategia: minimizar mesas de 2.
  // Número de mesas de 3 necesarias para absorber el sobrante de módulo 4:
  //   n % 4 == 0 → solo mesas de 4
  //   n % 4 == 1 → no podemos hacer [4,...,1]; necesitamos 3 mesas de 3 (3*3=9, 9-1=8 va en mesas de 4)
  //                Ejemplo: 9 → 3+3+3; 13 → 4+3+3+3; 17 → 4+4+3+3+3
  //   n % 4 == 2 → necesitamos 2 mesas de 3 (3+3=6, absorben 2 extras)
  //                Ejemplo: 10 → 4+3+3; 14 → 4+4+3+3
  //   n % 4 == 3 → una mesa de 3 absorbe el sobrante
  //                Ejemplo: 7 → 4+3; 11 → 4+4+3

  const tables = [];
  const rem = n % 4;
  let tablesOf3 = 0;

  if (rem === 0) tablesOf3 = 0;
  else if (rem === 1) tablesOf3 = 3;  // 3 mesas de 3 reemplazan (4+4+1) → 3+3+3
  else if (rem === 2) tablesOf3 = 2;  // 2 mesas de 3 reemplazan (4+2) → 3+3
  else if (rem === 3) tablesOf3 = 1;  // 1 mesa de 3

  // Jugadores que van en mesas de 3
  const playersIn3 = tablesOf3 * 3;
  // Resto en mesas de 4
  const tablesOf4 = (n - playersIn3) / 4;

  for (let i = 0; i < tablesOf4; i++) tables.push(4);
  for (let i = 0; i < tablesOf3; i++) tables.push(3);

  return tables;
}

/**
 * Emparejamiento aleatorio para la ronda 1.
 * @param {Array} players - Array de jugadores [{userId, displayName, score, ...}]
 * @returns {Array} - Array de mesas [{id, players: [...]}]
 */
function randomPairing(players) {
  const shuffled = [...players].sort(() => Math.random() - 0.5);
  return assignToTables(shuffled);
}

/**
 * Emparejamiento tipo Snake/Extremos para rondas 2+.
 * Agrupa los primeros con los últimos de la tabla de posiciones.
 *
 * Con 12 jugadores (ordenados por ranking 1..12):
 *   Mesa 1: puesto 1, 2, 11, 12
 *   Mesa 2: puesto 3, 4, 9, 10
 *   Mesa 3: puesto 5, 6, 7, 8
 *
 * @param {Array} players - Jugadores ordenados por score DESC (puesto 1 = index 0)
 * @returns {Array} - Array de mesas [{id, players: [...]}]
 */
function snakePairing(players) {
  const sizes = calculateTableSizes(players.length);
  const tables = [];
  let lo = 0;
  let hi = players.length - 1;

  for (const size of sizes) {
    const tablePlayers = [];
    let added = 0;

    // Tomar desde los extremos alternando inicio/fin
    while (added < size) {
      if (added % 2 === 0) {
        tablePlayers.push(players[lo++]);
      } else {
        tablePlayers.push(players[hi--]);
      }
      added++;
    }

    tables.push({
      id: `t${tables.length + 1}`,
      players: tablePlayers.map(p => ({
        userId: p.userId,
        displayName: p.displayName,
        score: 0,          // puntos de esta ronda (no acumulado)
        eliminated: false,
        startScore: p.score, // puntos acumulados al entrar a la ronda
      })),
      startTime: null,
      endTime: null,
    });
  }

  return tables;
}

/**
 * Asigna jugadores a mesas según los tamaños calculados.
 * @param {Array} orderedPlayers - Jugadores ya ordenados
 * @returns {Array} - Mesas con jugadores asignados
 */
function assignToTables(orderedPlayers) {
  const sizes = calculateTableSizes(orderedPlayers.length);
  const tables = [];
  let cursor = 0;

  for (let i = 0; i < sizes.length; i++) {
    const size = sizes[i];
    const tablePlayers = orderedPlayers.slice(cursor, cursor + size);
    cursor += size;

    tables.push({
      id: `t${i + 1}`,
      players: tablePlayers.map(p => ({
        userId: p.userId,
        displayName: p.displayName,
        score: 0,
        eliminated: false,
        startScore: p.score || 0,
      })),
      startTime: null,
      endTime: null,
    });
  }

  return tables;
}

/**
 * Genera las mesas para una nueva ronda.
 * @param {Array} players - Estado actual de los jugadores del torneo
 * @param {number} roundNumber - Número de ronda (1 = aleatoria, 2+ = snake)
 * @returns {Array} - Mesas generadas
 */
function generateRound(players, roundNumber) {
  // Solo jugadores activos (no eliminados del torneo)
  const activePlayers = players.filter(p => !p.eliminatedFromTournament);

  if (roundNumber === 1) {
    return randomPairing(activePlayers);
  }

  // Ordenar por score acumulado DESC para snake pairing
  const ranked = [...activePlayers].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    // Desempate por wins
    return (b.wins || 0) - (a.wins || 0);
  });

  return snakePairing(ranked);
}

module.exports = {
  calculateTableSizes,
  randomPairing,
  snakePairing,
  generateRound,
};
