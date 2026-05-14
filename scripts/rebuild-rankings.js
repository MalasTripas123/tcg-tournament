const mongoose = require('mongoose');
const { connectDB } = require('../src/config/db');
const tournamentService = require('../src/modules/tournaments/tournament.service');

async function main() {
  await connectDB();
  await tournamentService.rebuildAllOrganizerRankings();
  console.log('Rankings oficiales reconstruidos correctamente.');
}

main()
  .catch(error => {
    console.error('No se pudieron reconstruir los rankings:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
