function presentLocation(location) {
  return {
    id: location._id || location.id,
    label: location.label,
    locality: location.locality,
    region: location.region,
    province: location.province || '',
    country: location.country,
    countryCode: location.countryCode,
    lat: location.lat ?? null,
    lng: location.lng ?? null,
  };
}

function presentLocations(locations) {
  return (locations || []).map(presentLocation);
}

module.exports = {
  presentLocation,
  presentLocations,
};
