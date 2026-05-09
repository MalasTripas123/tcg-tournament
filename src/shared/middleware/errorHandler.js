const ApiError = require('../http/ApiError');

function errorHandler(err, req, res, next) {
  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({
      error: err.message,
      details: err.details,
    });
  }

  if (err?.name === 'ValidationError') {
    return res.status(400).json({ error: err.message });
  }

  if (err?.code === 11000) {
    return res.status(409).json({ error: 'Ya existe un registro con esos datos' });
  }

  if (err instanceof SyntaxError && 'body' in err) {
    return res.status(400).json({ error: 'JSON invalido' });
  }

  console.error(err);
  return res.status(500).json({ error: 'Error interno del servidor' });
}

module.exports = errorHandler;
