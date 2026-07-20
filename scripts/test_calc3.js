import fs from 'fs';

const content = fs.readFileSync('/Users/abdelazizchlih/.gemini/antigravity/brain/652266df-aa47-41ec-af19-695008594646/.system_generated/steps/1605/output.txt', 'utf8');

const positions = [];
let currentPos = null;

const lines = content.split('\n');
for (let line of lines) {
    if (line.startsWith('  - __path__:')) {
        if (currentPos) positions.push(currentPos);
        currentPos = {};
    } else if (currentPos && line.trim().length > 0 && !line.startsWith('documents:')) {
        const parts = line.split(':');
        if (parts.length >= 2) {
            const key = parts[0].trim();
            let value = parts.slice(1).join(':').trim();
            if (value.startsWith("'") && value.endsWith("'")) {
                value = value.substring(1, value.length - 1);
            }
            currentPos[key] = value;
        }
    }
}
if (currentPos) positions.push(currentPos);

function degreesToRadians(degrees) {
  return degrees * (Math.PI / 180);
}

function calculateHaversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
  const p1 = degreesToRadians(lat1);
  const p2 = degreesToRadians(lat2);
  const dp = degreesToRadians(lat2 - lat1);
  const dl = degreesToRadians(lon2 - lon1);
  const a = Math.sin(dp / 2) * Math.sin(dp / 2) +
            Math.cos(p1) * Math.cos(p2) *
            Math.sin(dl / 2) * Math.sin(dl / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function calculateBarycenter(positions) {
  if (positions.length === 0) return { lat: 0, lon: 0 };
  let sumLat = 0;
  let sumLon = 0;
  positions.forEach(p => {
    sumLat += p.lat !== undefined ? parseFloat(p.lat) : parseFloat(p.latitude);
    sumLon += p.lon !== undefined ? parseFloat(p.lon) : parseFloat(p.longitude);
  });
  return {
    lat: sumLat / positions.length,
    lon: sumLon / positions.length
  };
}

const validPositions = positions.filter(p => {
  const pLat = p.lat !== undefined ? parseFloat(p.lat) : parseFloat(p.latitude);
  const pLon = p.lon !== undefined ? parseFloat(p.lon) : parseFloat(p.longitude);
  return !(isNaN(pLat) || isNaN(pLon) || (Math.abs(pLat) <= 1 && Math.abs(pLon) <= 1));
});

// JUST GPS POSITIONS
const qualityPositions = validPositions.filter(p => {
    const locType = (p.locationType || '').toUpperCase();
    if (locType === 'GPS') return true;
    const lc = String(p.lc || '').toUpperCase().trim();
    if (lc === 'GPS' || lc === 'G') return true;
    return false;
});

const sorted = [...qualityPositions].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

const globalBarycenter = calculateBarycenter(sorted);
let pointsNearGlobalBarycenter = 0;
sorted.forEach(p => {
  const pLat = p.lat !== undefined ? parseFloat(p.lat) : parseFloat(p.latitude);
  const pLon = p.lon !== undefined ? parseFloat(p.lon) : parseFloat(p.longitude);
  const dist = calculateHaversineDistance(globalBarycenter.lat, globalBarycenter.lon, pLat, pLon);
  if (dist < 20) {
    pointsNearGlobalBarycenter++;
  }
});
console.log(`ONLY GPS POSITIONS:`);
console.log(`Total GPS positions: ${sorted.length}`);
console.log(`Global Barycenter: lat ${globalBarycenter.lat}, lon ${globalBarycenter.lon}`);
console.log(`% near barycenter: ${((pointsNearGlobalBarycenter / sorted.length) * 100).toFixed(2)}%`);
