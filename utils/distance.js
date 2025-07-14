// utils/distance.js
function getDistance(coord1, coord2) {
    const R = 6371e3;
    const φ1 = coord1.lat * Math.PI/180;
    const φ2 = coord2.lat * Math.PI/180;
    const Δφ = (coord2.lat - coord1.lat) * Math.PI/180;
    const Δλ = (coord2.lon - coord1.lon) * Math.PI/180;

    const a = Math.sin(Δφ/2)**2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ/2)**2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function extractLatLonFromLink(link) {
    const match = link.match(/q=(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (!match) throw new Error('Link lokasiPos tidak valid');
    const lat = parseFloat(match[1]);
    const lon = parseFloat(match[2]);
    return { lat, lon };
}

module.exports = { getDistance, extractLatLonFromLink };