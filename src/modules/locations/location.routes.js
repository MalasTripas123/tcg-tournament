const express = require('express');
const asyncHandler = require('../../shared/middleware/asyncHandler');
const validateRequest = require('../../shared/middleware/validateRequest');
const controller = require('./location.controller');
const validators = require('./location.validators');

const router = express.Router();

router.get('/search', validateRequest(validators.validateLocationSearch), asyncHandler(controller.search));

module.exports = router;
