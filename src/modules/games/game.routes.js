const express = require('express');
const asyncHandler = require('../../shared/middleware/asyncHandler');
const controller = require('./game.controller');

const router = express.Router();

router.get('/', asyncHandler(controller.list));

module.exports = router;
