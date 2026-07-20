import fs from 'fs';

// Rough parser for the YAML output from the MCP tool
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

console.log(`Parsed ${positions.length} positions.`);

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

function evaluateTransmitterStatus(transmitter, positions) {
  if (!positions || positions.length === 0) {
    return 'Inactive';
  }

  const qualityPositions = positions.filter(p => {
    const pLat = p.lat !== undefined ? parseFloat(p.lat) : parseFloat(p.latitude);
    const pLon = p.lon !== undefined ? parseFloat(p.lon) : parseFloat(p.longitude);
    if (isNaN(pLat) || isNaN(pLon) || (Math.abs(pLat) <= 1 && Math.abs(pLon) <= 1)) {
        return false;
    }

    const locType = (p.locationType || '').toUpperCase();
    if (locType === 'GPS') return true;
    
    const lc = String(p.lc || '').toUpperCase().trim();
    if (lc === 'GPS' || lc === 'G') return true;

    const dopplerErr = parseFloat(p.dopplerError || '0');
    if (dopplerErr > 0 && dopplerErr < 500) return true;
    
    if (['1', '2', '3'].includes(lc)) return true;
    
    return false;
  });

  const validPositions = positions.filter(p => {
    const pLat = p.lat !== undefined ? parseFloat(p.lat) : parseFloat(p.latitude);
    const pLon = p.lon !== undefined ? parseFloat(p.lon) : parseFloat(p.longitude);
    return !(isNaN(pLat) || isNaN(pLon) || (Math.abs(pLat) <= 1 && Math.abs(pLon) <= 1));
  });

  const allSorted = [...validPositions].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  
  if (allSorted.length === 0) {
    return 'Inactive';
  }

  const latestPos = allSorted[allSorted.length - 1];
  const latestTime = new Date(latestPos.timestamp).getTime();
  const now = new Date().getTime();

  console.log(`[DEBUG] qualityPositions: ${qualityPositions.length}, validPositions: ${validPositions.length}`);
  console.log(`[DEBUG] latestTime: ${new Date(latestTime).toISOString()}`);
  
  const daysSinceLastFix = (now - latestTime) / (1000 * 60 * 60 * 24);
  console.log(`[DEBUG] daysSinceLastFix: ${daysSinceLastFix.toFixed(2)}`);
  
  if (daysSinceLastFix > 10) {
    return 'Inactive';
  }

  if (qualityPositions.length === 0) {
    return 'Active';
  }

  const sorted = [...qualityPositions].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  const globalBarycenter = calculateBarycenter(sorted);
  console.log(`[DEBUG] Global Barycenter: lat ${globalBarycenter.lat}, lon ${globalBarycenter.lon}`);

  let pointsNearGlobalBarycenter = 0;
  sorted.forEach(p => {
    const pLat = p.lat !== undefined ? parseFloat(p.lat) : parseFloat(p.latitude);
    const pLon = p.lon !== undefined ? parseFloat(p.lon) : parseFloat(p.longitude);
    const dist = calculateHaversineDistance(globalBarycenter.lat, globalBarycenter.lon, pLat, pLon);
    if (dist < 20) {
      pointsNearGlobalBarycenter++;
    }
  });

  const pctNear = pointsNearGlobalBarycenter / sorted.length;
  console.log(`[DEBUG] % near barycenter: ${(pctNear * 100).toFixed(2)}%`);
  
  if (pctNear >= 0.70) {
    return 'Static test';
  }

  const fourDaysAgo = latestTime - (4 * 24 * 60 * 60 * 1000);
  const recentPositions = sorted.filter(p => new Date(p.timestamp).getTime() >= fourDaysAgo);
  console.log(`[DEBUG] recentPositions: ${recentPositions.length}`);

  if (recentPositions.length > 0) {
    const firstRecentTime = new Date(recentPositions[0].timestamp).getTime();
    const durationDays = (latestTime - firstRecentTime) / (1000 * 60 * 60 * 24);
    console.log(`[DEBUG] durationDays: ${durationDays.toFixed(2)}`);
    
    if (durationDays >= 3) {
      const recentBarycenter = calculateBarycenter(recentPositions);
      let allStationary = true;
      let maxDist = 0;
      for (const p of recentPositions) {
        const pLat = p.lat !== undefined ? parseFloat(p.lat) : parseFloat(p.latitude);
        const pLon = p.lon !== undefined ? parseFloat(p.lon) : parseFloat(p.longitude);
        const dist = calculateHaversineDistance(recentBarycenter.lat, recentBarycenter.lon, pLat, pLon);
        if (dist > maxDist) maxDist = dist;
        if (dist >= 20) {
          allStationary = false;
        }
      }

      console.log(`[DEBUG] max distance from 4-day barycenter: ${maxDist.toFixed(2)}m`);
      if (allStationary) {
        return 'Potential Mortality';
      }
    }
  }

  return 'Active';
}

const status = evaluateTransmitterStatus({ id: 't1' }, positions);
console.log(`RESULT: ${status}`);
