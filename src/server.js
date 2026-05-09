const { env } = require('./config/env');
const { connectDB } = require('./config/db');
const { createApp } = require('./app');
const { seedUsers } = require('./modules/users/user.service');

async function start() {
  await connectDB();
  await seedUsers();

  const app = createApp();
  app.listen(env.port, () => {
    console.log(`TCG Arena corriendo en http://localhost:${env.port}`);
    console.log(`Entorno: ${env.nodeEnv}`);
  });
}

start().catch(err => {
  console.error('No se pudo iniciar el servidor:', err.message);
  process.exit(1);
});
