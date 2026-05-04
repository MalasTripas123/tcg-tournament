// lib/db.js
// Conexión a MongoDB usando Mongoose.
// Se llama una sola vez al arrancar el servidor.

const mongoose = require('mongoose');

async function connectDB() {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    throw new Error(
      'Falta la variable de entorno MONGODB_URI.\n' +
      'Crea un archivo .env en la raíz del proyecto con:\n' +
      'MONGODB_URI=mongodb+srv://usuario:password@cluster.mongodb.net/tcg-arena'
    );
  }

  try {
    await mongoose.connect(uri);
    console.log('✓  MongoDB conectado:', mongoose.connection.host);
  } catch (err) {
    console.error('✗  Error conectando a MongoDB:', err.message);
    // Terminar el proceso para que Render lo reinicie automáticamente
    process.exit(1);
  }
}

module.exports = { connectDB };
