function ok(res, data) {
  return res.json(data);
}

function created(res, data) {
  return res.status(201).json(data);
}

function noContent(res) {
  return res.status(204).end();
}

module.exports = { ok, created, noContent };
