require('dotenv').config();

const { connectDB } = require('../src/config/db');
const locationRepository = require('../src/modules/locations/location.repository');

const CHILE_ABIERTO_COMUNAS_URL = 'https://chileabierto.cl/api/v1/comunas';
const CHILE_REGION_LABELS = {
  1: 'Región de Tarapacá',
  2: 'Región de Antofagasta',
  3: 'Región de Atacama',
  4: 'Región de Coquimbo',
  5: 'Región de Valparaíso',
  6: "Región del Libertador General Bernardo O'Higgins",
  7: 'Región del Maule',
  8: 'Región del Biobío',
  9: 'Región de La Araucanía',
  10: 'Región de Los Lagos',
  11: 'Región de Aysén del General Carlos Ibáñez del Campo',
  12: 'Región de Magallanes y de la Antártica Chilena',
  13: 'Región Metropolitana de Santiago',
  14: 'Región de Los Ríos',
  15: 'Región de Arica y Parinacota',
  16: 'Región de Ñuble',
};

function normalizeText(value) {
  return String(value || '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function slugify(value) {
  return normalizeText(value)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function regionLabel(regionName, regionId) {
  const mapped = CHILE_REGION_LABELS[Number(regionId)];
  if (mapped) return mapped;
  const name = String(regionName || '').trim();
  if (!name) return '';
  return /^region/i.test(normalizeText(name)) ? name : `Región de ${name}`;
}

function normalizeChileComuna(comuna) {
  const locality = String(comuna.name || '').trim();
  const region = regionLabel(comuna.region_name, comuna.region_id);
  const country = 'Chile';
  const sourceCode = String(comuna.code || '').trim();
  const id = sourceCode ? `cl-${sourceCode}` : `cl-${slugify(region)}-${slugify(locality)}`;
  const label = `${locality}, ${region}, ${country}`;
  const searchText = normalizeText([
    label,
    locality,
    region,
    comuna.province_name,
    country,
    sourceCode,
  ].filter(Boolean).join(' '));

  return {
    _id: id,
    label,
    locality,
    region,
    province: String(comuna.province_name || '').trim(),
    country,
    countryCode: 'CL',
    lat: Number.isFinite(Number(comuna.lat)) ? Number(comuna.lat) : null,
    lng: Number.isFinite(Number(comuna.lng)) ? Number(comuna.lng) : null,
    provider: 'chileabierto',
    sourceCode,
    searchText,
    active: true,
  };
}

async function fetchChileLocations() {
  const response = await fetch(CHILE_ABIERTO_COMUNAS_URL, {
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'tcg-tour-location-seed',
    },
  });
  if (!response.ok) throw new Error(`Chile Abierto respondio ${response.status}`);
  const payload = await response.json();
  const comunas = Array.isArray(payload.data) ? payload.data : [];
  if (!comunas.length) throw new Error('Chile Abierto no retorno comunas');
  return comunas.map(normalizeChileComuna);
}

async function main() {
  const locations = await fetchChileLocations();
  await connectDB();
  const result = await locationRepository.upsertLocations(locations);
  console.log(`Catalogo de ubicaciones sincronizado: ${locations.length} comunas`);
  console.log(`Upserts: ${result.upsertedCount || 0}, modificados: ${result.modifiedCount || 0}`);
  process.exit(0);
}

main().catch(err => {
  console.error('No se pudo sincronizar el catalogo de ubicaciones:', err);
  process.exit(1);
});
