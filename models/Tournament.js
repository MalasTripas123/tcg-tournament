// models/Tournament.js
// Esquema de torneo en MongoDB.
//
// Guardamos todo el torneo en un solo documento porque:
//  - Las rondas y mesas siempre se leen y escriben junto con el torneo.
//  - El torneo más grande (20 rondas × 10 mesas × 4 jugadores) sigue
//    siendo pequeño (<100KB), muy por debajo del límite de 16MB de MongoDB.
//  - Simplifica enormemente las rutas: no hay JOINs ni populate().

const mongoose = require('mongoose');

// ── Jugador dentro de una mesa (durante una ronda) ──────────────
const tablePlayerSchema = new mongoose.Schema({
  userId:      { type: String, required: true },
  displayName: { type: String, required: true },
  score:       { type: Number, default: 0 },
  eliminated:  { type: Boolean, default: false },
  startScore:  { type: Number, default: 0 }, // score acumulado al entrar a la ronda
}, { _id: false }); // _id: false porque no necesitamos IDs individuales aquí

// ── Mesa (pod) dentro de una ronda ──────────────────────────────
const tableSchema = new mongoose.Schema({
  id:        { type: String, required: true }, // 't1', 't2', etc.
  players:   [tablePlayerSchema],
  status:    { type: String, enum: ['pending','active','finished'], default: 'pending' },
  startTime: { type: Number, default: null }, // timestamp ms
  endTime:   { type: Number, default: null },
  result:    { type: String, enum: ['winner','draw','none',null], default: null },
  winner:    {
    userId:      String,
    displayName: String,
  },
  drawPlayers: [{
    userId:      String,
    displayName: String,
    _id: false,
  }],
}, { _id: false });

// ── Ronda ────────────────────────────────────────────────────────
const roundSchema = new mongoose.Schema({
  id:        { type: String, required: true }, // UUID
  number:    { type: Number, required: true },
  tables:    [tableSchema],
  status:    { type: String, enum: ['pending','active','finished'], default: 'pending' },
  startTime: { type: Number, default: null },
  endTime:   { type: Number, default: null },
}, { _id: false });

// ── Jugador inscrito en el torneo ────────────────────────────────
const tournamentPlayerSchema = new mongoose.Schema({
  userId:                 { type: String, required: true },
  displayName:            { type: String, required: true },
  score:                  { type: Number, default: 0 },
  wins:                   { type: Number, default: 0 },
  losses:                 { type: Number, default: 0 },
  draws:                  { type: Number, default: 0 },
  eliminatedFromTournament: { type: Boolean, default: false },
}, { _id: false });

// ── Solicitud de ingreso ─────────────────────────────────────────
const joinRequestSchema = new mongoose.Schema({
  userId:      { type: String, required: true },
  displayName: { type: String, required: true },
  status:      { type: String, enum: ['pending','accepted','rejected'], default: 'pending' },
  requestedAt: { type: Number, default: () => Date.now() },
}, { _id: false });

// ── Premio ───────────────────────────────────────────────────────
const prizeSchema = new mongoose.Schema({
  type:     { type: String, enum: ['text','card'], required: true },
  value:    { type: String, default: '' },
  imageUrl: { type: String, default: '' },
}, { _id: false });

// ── Torneo (documento raíz) ──────────────────────────────────────
const tournamentSchema = new mongoose.Schema({
  // Usamos el _id de MongoDB como ID del torneo (UUID string para compatibilidad)
  _id:           { type: String, required: true }, // UUID generado en el servidor
  name:          { type: String, required: true, trim: true },
  organizerId:   { type: String, required: true }, // uid del organizador
  organizerName: { type: String, required: true },
  totalRounds:   { type: Number, required: true, min: 1 },
  roundDuration: { type: Number, required: true, min: 1 }, // minutos
  status: {
    type: String,
    enum: ['lobby','active','finished'],
    default: 'lobby',
  },
  visibility: {
    type: String,
    enum: ['public','approval','private'],
    default: 'public',
  },
  isRanked:     { type: Boolean, default: false },
  prizes:       [prizeSchema],
  players:      [tournamentPlayerSchema],
  joinRequests: [joinRequestSchema],
  rounds:       [roundSchema],
  currentRound: { type: Number, default: 0 },
}, {
  timestamps: true,
  // Decirle a Mongoose que no genere su propio _id (lo ponemos nosotros)
  _id: false,
  id: false,
});

// Índice para buscar torneos por estado (útil al listar activos primero)
tournamentSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('Tournament', tournamentSchema);
