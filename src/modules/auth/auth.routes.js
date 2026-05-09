const express = require('express');
const asyncHandler = require('../../shared/middleware/asyncHandler');
const validateRequest = require('../../shared/middleware/validateRequest');
const authController = require('./auth.controller');
const { validateLogin, validateRegister } = require('./auth.validators');

const router = express.Router();

router.post('/login', validateRequest(validateLogin), asyncHandler(authController.login));
router.post('/register', validateRequest(validateRegister), asyncHandler(authController.register));
router.post('/logout', asyncHandler(authController.logout));
router.get('/me', asyncHandler(authController.me));
router.get('/profile/:userId', asyncHandler(authController.profile));

module.exports = router;
