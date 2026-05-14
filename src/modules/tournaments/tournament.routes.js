const express = require('express');
const asyncHandler = require('../../shared/middleware/asyncHandler');
const requireAuth = require('../../shared/middleware/requireAuth');
const validateRequest = require('../../shared/middleware/validateRequest');
const controller = require('./tournament.controller');
const validators = require('./tournament.validators');

const router = express.Router();

router.get('/', asyncHandler(controller.list));
router.post('/', requireAuth, validateRequest(validators.validateCreateTournament), asyncHandler(controller.create));
router.get('/:id/player-suggestions', requireAuth, asyncHandler(controller.playerSuggestions));
router.get('/:id', asyncHandler(controller.detail));

router.post('/:id/players', requireAuth, validateRequest(validators.validateAddPlayer), asyncHandler(controller.addPlayer));
router.delete('/:id/players/:userId', requireAuth, asyncHandler(controller.removePlayer));
router.patch('/:id/players/:userId/score', requireAuth, validateRequest(validators.validatePatchScore), asyncHandler(controller.setPlayerScore));

router.patch('/:id/join-requests/:userId', requireAuth, validateRequest(validators.validateJoinRequestAction), asyncHandler(controller.handleJoinRequest));
router.patch('/:id/invitations/me', requireAuth, validateRequest(validators.validateInvitationAction), asyncHandler(controller.handleInvitation));

router.post('/:id/start', requireAuth, asyncHandler(controller.start));
router.patch('/:id/settings', requireAuth, validateRequest(validators.validateTournamentSettings), asyncHandler(controller.updateSettings));

router.put('/:id/rounds/:roundId/tables', requireAuth, validateRequest(validators.validateReplaceTables), asyncHandler(controller.replaceTables));
router.post('/:id/rounds/:roundId/tables', requireAuth, asyncHandler(controller.addTable));
router.post('/:id/rounds/:roundId/tables/shuffle', requireAuth, asyncHandler(controller.shuffleTables));
router.delete('/:id/rounds/:roundId/tables/:tableId', requireAuth, asyncHandler(controller.deleteTable));
router.patch('/:id/rounds/:roundId/tables/:tableId/players/:userId', requireAuth, validateRequest(validators.validateUpdateTablePlayer), asyncHandler(controller.updateTablePlayer));
router.post('/:id/rounds/:roundId/tables/:tableId/finish', requireAuth, validateRequest(validators.validateFinishTable), asyncHandler(controller.finishTable));
router.post('/:id/rounds/:roundId/tables/:tableId/revise', requireAuth, validateRequest(validators.validateFinishTable), asyncHandler(controller.reviseTable));
router.patch('/:id/players/:userId/status', requireAuth, validateRequest(validators.validateTournamentPlayerStatus), asyncHandler(controller.updateTournamentPlayer));

router.post('/:id/rounds/:roundId/activate', requireAuth, asyncHandler(controller.activateRound));
router.post('/:id/rounds/:roundId/pause', requireAuth, asyncHandler(controller.pauseRound));
router.post('/:id/rounds/:roundId/resume', requireAuth, asyncHandler(controller.resumeRound));
router.patch('/:id/rounds/:roundId/time', requireAuth, validateRequest(validators.validateRoundTime), asyncHandler(controller.updateRoundTime));
router.patch('/:id/rounds/:roundId/editing', requireAuth, validateRequest(validators.validateRoundEditing), asyncHandler(controller.updateRoundEditing));
router.post('/:id/rounds/:roundId/finish', requireAuth, validateRequest(validators.validateFinishRound), asyncHandler(controller.finishRound));
router.post('/:id/finalize-results', requireAuth, asyncHandler(controller.finalizeResults));

module.exports = router;
