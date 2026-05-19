require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { connectDB } = require('../src/config/db');
const gameRepository = require('../src/modules/games/game.repository');

function slugify(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normalizeCatalogEntry(entry) {
  const id = slugify(entry.id || entry.name);
  if (!id || !entry.name) throw new Error('Entrada de juego invalida');
  const formats = Array.isArray(entry.formats) ? entry.formats : [];
  return {
    _id: id,
    name: String(entry.name).trim(),
    aliases: Array.isArray(entry.aliases) ? entry.aliases.map(alias => String(alias).trim()).filter(Boolean) : [],
    formats: formats.map(format => ({
      id: slugify(format),
      name: String(format).trim(),
    })).filter(format => format.id && format.name),
    active: entry.active !== false,
    sortOrder: Number.isFinite(Number(entry.sortOrder)) ? Number(entry.sortOrder) : 1000,
  };
}

async function main() {
  const catalogPath = path.join(__dirname, '..', 'data', 'game-catalog.json');
  const raw = fs.readFileSync(catalogPath, 'utf8');
  const catalog = JSON.parse(raw).map(normalizeCatalogEntry);

  await connectDB();
  const result = await gameRepository.upsertGames(catalog);
  console.log(`Catalogo de juegos sincronizado: ${catalog.length} entradas`);
  console.log(`Upserts: ${result.upsertedCount || 0}, modificados: ${result.modifiedCount || 0}`);
  process.exit(0);
}

main().catch(err => {
  console.error('No se pudo sincronizar el catalogo de juegos:', err);
  process.exit(1);
});
