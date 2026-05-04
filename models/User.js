// models/User.js
// Esquema de usuario en MongoDB.

const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  // _id lo genera MongoDB automáticamente (ObjectId).
  // Usamos un campo 'uid' propio para mantener compatibilidad
  // con el código existente que usa strings como 'u1', 'u2', etc.
  // En usuarios nuevos este campo será igual al _id.toString().
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
    // En producción real: guardar el hash bcrypt, nunca el texto plano.
    // Para este MVP lo dejamos en texto plano por simplicidad.
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
}, {
  timestamps: true, // añade createdAt y updatedAt automáticamente
});

module.exports = mongoose.model('User', userSchema);
