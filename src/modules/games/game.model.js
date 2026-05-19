const mongoose = require('mongoose');

const gameFormatSchema = new mongoose.Schema({
  id: { type: String, required: true, trim: true },
  name: { type: String, required: true, trim: true },
}, { _id: false });

const gameSchema = new mongoose.Schema({
  _id: { type: String, required: true, trim: true },
  name: { type: String, required: true, trim: true },
  aliases: [{ type: String, trim: true }],
  formats: [gameFormatSchema],
  active: { type: Boolean, default: true },
  sortOrder: { type: Number, default: 1000 },
}, {
  timestamps: true,
  _id: false,
  id: false,
});

gameSchema.index({ active: 1, sortOrder: 1, name: 1 });

module.exports = mongoose.models.Game || mongoose.model('Game', gameSchema);
