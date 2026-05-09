function validateRequest(validator) {
  return function validate(req, res, next) {
    try {
      req.validated = validator(req);
      next();
    } catch (err) {
      next(err);
    }
  };
}

module.exports = validateRequest;
