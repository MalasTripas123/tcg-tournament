const test = require('node:test');
const assert = require('node:assert/strict');
const { validateRegister } = require('../../src/modules/auth/auth.validators');

test('validateRegister accepts safe usernames and normalizes them', () => {
  const result = validateRegister({
    body: {
      username: 'User_Dos',
      password: 'secret1',
      displayName: 'User Dos',
      email: '',
    },
  });

  assert.equal(result.body.username, 'user_dos');
});

test('validateRegister rejects usernames that can break HTML or JS attributes', () => {
  assert.throws(() => validateRegister({
    body: {
      username: "bad'user",
      password: 'secret1',
      displayName: 'Bad User',
      email: '',
    },
  }), /solo puede tener letras/);
});
