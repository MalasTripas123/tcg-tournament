const { ok, created } = require('../../shared/http/responses');
const tournamentService = require('./tournament.service');
const { presentTournament, presentTournamentList } = require('./tournament.presenter');

function viewer(req) {
  return req.session?.userId ? { id: req.session.userId } : null;
}

async function list(req, res) {
  const tournaments = await tournamentService.listTournaments({
    query: req.query.q,
    viewerId: req.session?.userId,
  });
  return ok(res, presentTournamentList(tournaments, viewer(req)));
}

async function detail(req, res) {
  const tournament = await tournamentService.getTournament(req.params.id, req.session?.userId);
  return ok(res, presentTournament(tournament, viewer(req)));
}

async function create(req, res) {
  const tournament = await tournamentService.createTournament(req.validated.body, req.session.userId);
  return created(res, presentTournament(tournament, viewer(req)));
}

async function addPlayer(req, res) {
  const result = await tournamentService.addPlayer(
    req.params.id,
    req.session.userId,
    req.validated.body
  );

  if (result.requested) return ok(res, { ok: true, requested: true, invited: !!result.invited, message: result.message });
  return ok(res, presentTournament(result, viewer(req)));
}

async function playerSuggestions(req, res) {
  const suggestions = await tournamentService.listOrganizerPlayerSuggestions(req.params.id, req.session.userId);
  return ok(res, suggestions);
}

async function removePlayer(req, res) {
  const tournament = await tournamentService.removePlayer(req.params.id, req.session.userId, req.params.userId);
  return ok(res, presentTournament(tournament, viewer(req)));
}

async function setPlayerScore(req, res) {
  const tournament = await tournamentService.setPlayerScore(
    req.params.id,
    req.session.userId,
    req.params.userId,
    req.validated.body.score
  );
  return ok(res, presentTournament(tournament, viewer(req)));
}

async function handleJoinRequest(req, res) {
  const tournament = await tournamentService.handleJoinRequest(
    req.params.id,
    req.session.userId,
    req.params.userId,
    req.validated.body.action
  );
  return ok(res, presentTournament(tournament, viewer(req)));
}

async function handleInvitation(req, res) {
  const tournament = await tournamentService.handleInvitation(
    req.params.id,
    req.session.userId,
    req.validated.body.action
  );
  return ok(res, presentTournament(tournament, viewer(req)));
}

async function start(req, res) {
  const tournament = await tournamentService.startTournament(req.params.id, req.session.userId);
  return ok(res, presentTournament(tournament, viewer(req)));
}

async function updateSettings(req, res) {
  const tournament = await tournamentService.updateTournamentSettings(req.params.id, req.session.userId, req.validated.body);
  return ok(res, presentTournament(tournament, viewer(req)));
}

async function replaceTables(req, res) {
  const tournament = await tournamentService.replaceRoundTables(
    req.params.id,
    req.session.userId,
    req.params.roundId,
    req.validated.body.tables
  );
  return ok(res, presentTournament(tournament, viewer(req)));
}

async function addTable(req, res) {
  const tournament = await tournamentService.addTable(req.params.id, req.session.userId, req.params.roundId);
  return ok(res, presentTournament(tournament, viewer(req)));
}

async function deleteTable(req, res) {
  const tournament = await tournamentService.deleteTable(req.params.id, req.session.userId, req.params.roundId, req.params.tableId);
  return ok(res, presentTournament(tournament, viewer(req)));
}

async function shuffleTables(req, res) {
  const tournament = await tournamentService.shuffleRoundPlayers(req.params.id, req.session.userId, req.params.roundId);
  return ok(res, presentTournament(tournament, viewer(req)));
}

async function updateTablePlayer(req, res) {
  const tournament = await tournamentService.updateTablePlayer(
    req.params.id,
    req.session.userId,
    req.params.roundId,
    req.params.tableId,
    req.params.userId,
    req.validated.body
  );
  return ok(res, presentTournament(tournament, viewer(req)));
}

async function updateTournamentPlayer(req, res) {
  const tournament = await tournamentService.setTournamentPlayerStatus(
    req.params.id,
    req.session.userId,
    req.params.userId,
    req.validated.body
  );
  return ok(res, presentTournament(tournament, viewer(req)));
}

async function finishTable(req, res) {
  const tournament = await tournamentService.finishTable(
    req.params.id,
    req.session.userId,
    req.params.roundId,
    req.params.tableId,
    req.validated.body
  );
  return ok(res, presentTournament(tournament, viewer(req)));
}

async function reviseTable(req, res) {
  const tournament = await tournamentService.reviseTable(
    req.params.id,
    req.session.userId,
    req.params.roundId,
    req.params.tableId,
    req.validated.body
  );
  return ok(res, presentTournament(tournament, viewer(req)));
}

async function activateRound(req, res) {
  const tournament = await tournamentService.activateRound(req.params.id, req.session.userId, req.params.roundId);
  return ok(res, presentTournament(tournament, viewer(req)));
}

async function pauseRound(req, res) {
  const tournament = await tournamentService.pauseRound(req.params.id, req.session.userId, req.params.roundId);
  return ok(res, presentTournament(tournament, viewer(req)));
}

async function resumeRound(req, res) {
  const tournament = await tournamentService.resumeRound(req.params.id, req.session.userId, req.params.roundId);
  return ok(res, presentTournament(tournament, viewer(req)));
}

async function updateRoundTime(req, res) {
  const tournament = await tournamentService.updateRoundTime(
    req.params.id,
    req.session.userId,
    req.params.roundId,
    req.validated.body
  );
  return ok(res, presentTournament(tournament, viewer(req)));
}

async function updateRoundEditing(req, res) {
  const tournament = await tournamentService.updateRoundEditing(
    req.params.id,
    req.session.userId,
    req.params.roundId,
    req.validated.body.unlocked
  );
  return ok(res, presentTournament(tournament, viewer(req)));
}

async function finishRound(req, res) {
  const tournament = await tournamentService.finishRound(
    req.params.id,
    req.session.userId,
    req.params.roundId,
    req.validated.body
  );
  return ok(res, presentTournament(tournament, viewer(req)));
}

async function finalizeResults(req, res) {
  const tournament = await tournamentService.finalizeTournamentResults(req.params.id, req.session.userId);
  return ok(res, presentTournament(tournament, viewer(req)));
}

module.exports = {
  list,
  detail,
  create,
  addPlayer,
  playerSuggestions,
  removePlayer,
  setPlayerScore,
  handleJoinRequest,
  handleInvitation,
  start,
  updateSettings,
  replaceTables,
  addTable,
  deleteTable,
  shuffleTables,
  updateTablePlayer,
  updateTournamentPlayer,
  finishTable,
  reviseTable,
  activateRound,
  pauseRound,
  resumeRound,
  updateRoundTime,
  updateRoundEditing,
  finishRound,
  finalizeResults,
};
