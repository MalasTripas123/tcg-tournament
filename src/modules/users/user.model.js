const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  uid: {
    type: String,
    required: true,
    unique: true,
  },
  username: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  },
  password: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    default: '',
    trim: true,
  },
  displayName: {
    type: String,
    required: true,
    trim: true,
  },
  role: {
    type: String,
    enum: ['player', 'organizer'],
    default: 'player',
  },
  isLicensed: {
    type: Boolean,
    default: false,
  },
  invitationPolicy: {
    type: String,
    enum: ['manual', 'auto'],
    default: 'manual',
  },
  rankings: [{
    organizerId: { type: String, required: true },
    organizerName: { type: String, default: '' },
    points: { type: Number, default: 0 },
    tournamentsPlayed: { type: Number, default: 0 },
    _id: false,
  }],
}, {
  timestamps: true,
});

module.exports = mongoose.models.User || mongoose.model('User', userSchema);
