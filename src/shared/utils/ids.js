const { v4: uuidv4 } = require('uuid');

function createId() {
  return uuidv4();
}

module.exports = { createId };
