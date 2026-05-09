const express = require('express');
const asyncHandler = require('../../shared/middleware/asyncHandler');
const validateRequest = require('../../shared/middleware/validateRequest');
const requireAuth = require('../../shared/middleware/requireAuth');
const userController = require('./user.controller');
const { validateSearchUsers, validateInvitationPolicy } = require('./user.validators');

const router = express.Router();

router.get('/search', validateRequest(validateSearchUsers), asyncHandler(userController.search));
router.patch('/me/preferences', requireAuth, validateRequest(validateInvitationPolicy), asyncHandler(userController.updatePreferences));

module.exports = router;
