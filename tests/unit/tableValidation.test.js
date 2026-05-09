const test = require('node:test');
const assert = require('node:assert/strict');
const { validateAndRebuildTables } = require('../../src/modules/tournaments/domain/tableValidation');

test('validateAndRebuildTables preserves player objects while allowing reordering', () => {
  const currentTables = [
    { id: 't1', status: 'pending', players: [{ userId: 'u1', displayName: 'A', score: 1 }] },
    { id: 't2', status: 'pending', players: [{ userId: 'u2', displayName: 'B', score: 2 }] },
  ];
  const incomingTables = [
    { id: 't1', players: [{ userId: 'u2' }] },
    { id: 't2', players: [{ userId: 'u1' }] },
  ];

  const rebuilt = validateAndRebuildTables(currentTables, incomingTables);
  assert.equal(rebuilt[0].players[0].displayName, 'B');
  assert.equal(rebuilt[0].players[0].score, 2);
});

test('validateAndRebuildTables rejects missing players', () => {
  const currentTables = [
    { id: 't1', players: [{ userId: 'u1' }, { userId: 'u2' }] },
  ];
  const incomingTables = [
    { id: 't1', players: [{ userId: 'u1' }] },
  ];

  assert.throws(
    () => validateAndRebuildTables(currentTables, incomingTables),
    /mismos jugadores/
  );
});

test('validateAndRebuildTables keeps disqualified players in bench', () => {
  const currentTables = [
    { id: 't1', type: 'normal', players: [] },
    { id: 'bench', type: 'bench', players: [{ userId: 'u1' }] },
  ];
  const incomingTables = [
    { id: 't1', players: [{ userId: 'u1' }] },
    { id: 'bench', players: [] },
  ];

  assert.throws(
    () => validateAndRebuildTables(currentTables, incomingTables, [{ userId: 'u1', eliminatedFromTournament: true }]),
    /banca/
  );
});
