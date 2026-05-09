const mongoose = require('mongoose');
const { env } = require('./env');

async function connectDB() {
  if (!env.mongodbUri) {
    throw new Error(
      'Falta la variable de entorno MONGODB_URI. Crea un archivo .env con la URI de MongoDB.'
    );
  }

  await mongoose.connect(env.mongodbUri);
  console.log('MongoDB conectado:', mongoose.connection.host);
}

module.exports = { connectDB };
