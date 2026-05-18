const mongoose = require('mongoose');

const tablePlayerSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  displayName: { type: String, required: true },
  isAnonymous: { type: Boolean, default: false },
  anonymousKey: { type: String, default: '' },
  yellowCards: { type: Number, default: 0, min: 0, max: 2 },
  redCard: { type: Boolean, default: false },
  score: { type: Number, default: 0 },
  eliminated: { type: Boolean, default: false },
  startScore: { type: Number, default: 0 },
}, { _id: false });

const tableSchema = new mongoose.Schema({
  id: { type: String, required: true },
  type: { type: String, enum: ['normal', 'bench'], default: 'normal' },
  players: [tablePlayerSchema],
  status: { type: String, enum: ['pending', 'active', 'finished'], default: 'pending' },
  startTime: { type: Number, default: null },
  endTime: { type: Number, default: null },
  result: { type: String, enum: ['winner', 'draw', 'none', null], default: null },
  winner: {
    userId: String,
    displayName: String,
  },
  drawPlayers: [{
    userId: String,
    displayName: String,
    _id: false,
  }],
}, { _id: false });

const roundSchema = new mongoose.Schema({
  id: { type: String, required: true },
  number: { type: Number, required: true },
  tables: [tableSchema],
  status: { type: String, enum: ['pending', 'active', 'finished'], default: 'pending' },
  startTime: { type: Number, default: null },
  endTime: { type: Number, default: null },
  timeLimitMinutes: { type: Number, min: 0, default: null },
  pausedAt: { type: Number, default: null },
  totalPausedMs: { type: Number, default: 0 },
  tableEditingUnlocked: { type: Boolean, default: false },
}, { _id: false });

const tournamentPlayerSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  displayName: { type: String, required: true },
  isAnonymous: { type: Boolean, default: false },
  anonymousKey: { type: String, default: '' },
  yellowCards: { type: Number, default: 0, min: 0, max: 2 },
  redCard: { type: Boolean, default: false },
  score: { type: Number, default: 0 },
  manualScore: { type: Number, default: 0 },
  wins: { type: Number, default: 0 },
  losses: { type: Number, default: 0 },
  draws: { type: Number, default: 0 },
  eliminatedFromTournament: { type: Boolean, default: false },
  disqualifiedAt: { type: Number, default: null },
}, { _id: false });

const joinRequestSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  displayName: { type: String, required: true },
  type: { type: String, enum: ['join', 'invite'], default: 'join' },
  status: { type: String, enum: ['pending', 'accepted', 'rejected'], default: 'pending' },
  requestedAt: { type: Number, default: () => Date.now() },
  invitedBy: { type: String, default: '' },
}, { _id: false });

const prizeSchema = new mongoose.Schema({
  type: { type: String, enum: ['text', 'card', 'credit'], required: true },
  value: { type: String, default: '' },
  imageUrl: { type: String, default: '' },
  creditCount: { type: Number, default: 0, min: 0 },
  creditValue: { type: Number, default: 0, min: 0 },
  distribution: [{
    place: { type: Number, required: true, min: 1 },
    credits: { type: Number, required: true, min: 0 },
    percentage: { type: Number, default: 0, min: 0, max: 100 },
    _id: false,
  }],
}, { _id: false });

const moderatorSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  displayName: { type: String, required: true },
  username: { type: String, default: '' },
  active: { type: Boolean, default: true },
  addedAt: { type: Number, default: () => Date.now() },
  addedBy: { type: String, default: '' },
  removedAt: { type: Number, default: null },
  removedBy: { type: String, default: '' },
  completedAt: { type: Number, default: null },
}, { _id: false });

const moderatorEventSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  displayName: { type: String, default: '' },
  action: { type: String, enum: ['add', 'remove'], required: true },
  at: { type: Number, default: () => Date.now() },
  phase: { type: String, default: '' },
  actorId: { type: String, default: '' },
}, { _id: false });

const auditLogSchema = new mongoose.Schema({
  type: { type: String, required: true },
  actorId: { type: String, default: '' },
  at: { type: Number, default: () => Date.now() },
  phase: { type: String, default: '' },
  payload: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { _id: false });

const appealSchema = new mongoose.Schema({
  id: { type: String, required: true },
  userId: { type: String, required: true },
  displayName: { type: String, default: '' },
  reason: { type: String, default: '' },
  status: { type: String, enum: ['pending', 'reviewed', 'resolved'], default: 'pending' },
  createdAt: { type: Number, default: () => Date.now() },
}, { _id: false });

const tournamentSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  name: { type: String, required: true, trim: true },
  bannerUrl: { type: String, default: '', trim: true },
  organizerId: { type: String, required: true },
  organizerName: { type: String, required: true },
  organizerUsername: { type: String, default: '' },
  scheduledStartAt: { type: Number, default: null },
  totalRounds: { type: Number, required: true, min: 1 },
  roundDuration: { type: Number, required: true, min: 0 },
  minPlayers: { type: Number, default: null, min: 2 },
  maxPlayers: { type: Number, default: null, min: 2 },
  status: { type: String, enum: ['lobby', 'active', 'review', 'finished'], default: 'lobby' },
  deletedAt: { type: Number, default: null },
  deletedBy: { type: String, default: '' },
  deletionReason: { type: String, default: '' },
  deletionSnapshot: { type: mongoose.Schema.Types.Mixed, default: null },
  visibility: { type: String, enum: ['public', 'approval', 'private'], default: 'public' },
  isRanked: { type: Boolean, default: false },
  pairingMethod: { type: String, enum: ['snake', 'random', 'balanced'], default: 'snake' },
  tableMode: { type: String, enum: ['multi', 'versus'], default: 'multi' },
  rankingApplied: { type: Boolean, default: false },
  rankingFormulaVersion: { type: Number, default: 0 },
  rankingDeltas: [{
    userId: { type: String, required: true },
    displayName: { type: String, default: '' },
    isAnonymous: { type: Boolean, default: false },
    anonymousKey: { type: String, default: '' },
    points: { type: Number, default: 0 },
    rank: { type: Number, default: 0 },
    _id: false,
  }],
  prizes: [prizeSchema],
  moderators: [moderatorSchema],
  moderatorEvents: [moderatorEventSchema],
  auditLog: [auditLogSchema],
  appeals: [appealSchema],
  players: [tournamentPlayerSchema],
  joinRequests: [joinRequestSchema],
  rounds: [roundSchema],
  currentRound: { type: Number, default: 0 },
}, {
  timestamps: true,
  _id: false,
  id: false,
});

tournamentSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.models.Tournament || mongoose.model('Tournament', tournamentSchema);
