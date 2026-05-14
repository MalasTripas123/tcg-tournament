const test = require('node:test');
const assert = require('node:assert/strict');
const {
  anonymousNameKey,
  anonymousPlayerIdentity,
} = require('../../src/modules/tournaments/domain/anonymousPlayers');

test('anonymousNameKey ignores spaces and casing only', () => {
  assert.equal(anonymousNameKey('  Juan   Perez '), anonymousNameKey('juanperez'));
  assert.notEqual(anonymousNameKey('Juan Perez!'), anonymousNameKey('Juan Perez'));
});

test('anonymousPlayerIdentity is stable per organizer and normalized name', () => {
  const first = anonymousPlayerIdentity('org1', '  Mesa Local ');
  const second = anonymousPlayerIdentity('org1', 'mesalocal');
  const otherOrganizer = anonymousPlayerIdentity('org2', 'mesalocal');

  assert.equal(first.uid, second.uid);
  assert.notEqual(first.uid, otherOrganizer.uid);
  assert.equal(first.displayName, 'Mesa Local');
  assert.equal(first.isAnonymous, true);
});
