const mongoose = require('mongoose');

const locationSchema = new mongoose.Schema({
  _id: { type: String, required: true, trim: true },
  label: { type: String, required: true, trim: true },
  locality: { type: String, required: true, trim: true },
  region: { type: String, required: true, trim: true },
  province: { type: String, default: '', trim: true },
  country: { type: String, required: true, trim: true },
  countryCode: { type: String, required: true, trim: true, uppercase: true },
  lat: { type: Number, default: null },
  lng: { type: Number, default: null },
  provider: { type: String, default: 'local', trim: true },
  sourceCode: { type: String, default: '', trim: true },
  searchText: { type: String, default: '', trim: true },
  active: { type: Boolean, default: true },
}, {
  timestamps: true,
  _id: false,
  id: false,
});

locationSchema.index({ active: 1, countryCode: 1, locality: 1 });
locationSchema.index({ searchText: 1 });

module.exports = mongoose.models.Location || mongoose.model('Location', locationSchema);
