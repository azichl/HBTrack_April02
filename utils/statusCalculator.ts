import { Position, Transmitter } from '../types';

function degreesToRadians(degrees: number) {
  return degrees * (Math.PI / 180);
}

function calculateHaversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; // Earth radius in meters
  const φ1 = degreesToRadians(lat1);
  const φ2 = degreesToRadians(lat2);
  const Δφ = degreesToRadians(lat2 - lat1);
  const Δλ = degreesToRadians(lon2 - lon1);

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // Distance in meters
}

function calculateBarycenter(positions: any[]): { lat: number, lon: number } {
  if (positions.length === 0) return { lat: 0, lon: 0 };
  let sumLat = 0;
  let sumLon = 0;
  positions.forEach(p => {
    sumLat += p.lat !== undefined ? p.lat : p.latitude;
    sumLon += p.lon !== undefined ? p.lon : p.longitude;
  });
  return {
    lat: sumLat / positions.length,
    lon: sumLon / positions.length
  };
}

export function evaluateTransmitterStatus(transmitter: Transmitter, positions: any[]): 'Active' | 'Potential Mortality' | 'Inactive' | 'Static test' {
  if (!positions || positions.length === 0) {
    return 'Inactive';
  }

  // Filter: only use GPS fixes or Doppler fixes with error under 500m, and valid coordinates
  const qualityPositions = positions.filter(p => {
    const pLat = p.lat !== undefined ? parseFloat(p.lat) : parseFloat(p.latitude);
    const pLon = p.lon !== undefined ? parseFloat(p.lon) : parseFloat(p.longitude);
    // Ignore (0,0) or missing coordinates
    if (isNaN(pLat) || isNaN(pLon) || (Math.abs(pLat) <= 1 && Math.abs(pLon) <= 1)) {
        return false;
    }

    const locType = (p.locationType || '').toUpperCase();
    if (locType === 'GPS') return true;
    
    const lc = String(p.lc || '').toUpperCase().trim();
    if (lc === 'GPS' || lc === 'G') return true;

    // Doppler fixes are excluded from spatial analysis because their inherent 
    // error (often 250m - 1500m) mathematically breaks the 20m threshold logic 
    // required for Static Test and Potential Mortality.
    return false;
  });

  // Use valid positions for timestamp checks (to detect inactivity)
  // Even low quality Doppler fixes count as activity, but empty (0,0) messages don't
  const validPositions = positions.filter(p => {
    const pLat = p.lat !== undefined ? parseFloat(p.lat) : parseFloat(p.latitude);
    const pLon = p.lon !== undefined ? parseFloat(p.lon) : parseFloat(p.longitude);
    return !(isNaN(pLat) || isNaN(pLon) || (Math.abs(pLat) <= 1 && Math.abs(pLon) <= 1));
  });

  const allSorted = [...validPositions].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  
  // If no valid positions exist at all, it's inactive
  if (allSorted.length === 0) {
    return 'Inactive';
  }

  const latestPos = allSorted[allSorted.length - 1];
  const latestTime = new Date(latestPos.timestamp).getTime();
  const now = new Date().getTime();

  // 1. Check Inactive (> 10 days since last transmission)
  const daysSinceLastFix = (now - latestTime) / (1000 * 60 * 60 * 24);
  if (daysSinceLastFix > 10) {
    return 'Inactive';
  }

  // If no quality positions exist, default to Active (we have data but it's all low-quality Doppler)
  if (qualityPositions.length === 0) {
    return 'Active';
  }

  // Sort quality positions by timestamp for spatial analysis
  const sorted = [...qualityPositions].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  // 2. Check Static Test (70% of ALL quality points < 20m from global barycenter)
  const globalBarycenter = calculateBarycenter(sorted);
  let pointsNearGlobalBarycenter = 0;
  sorted.forEach(p => {
    const pLat = p.lat !== undefined ? p.lat : p.latitude;
    const pLon = p.lon !== undefined ? p.lon : p.longitude;
    const dist = calculateHaversineDistance(globalBarycenter.lat, globalBarycenter.lon, pLat, pLon);
    if (dist < 20) {
      pointsNearGlobalBarycenter++;
    }
  });

  if ((pointsNearGlobalBarycenter / sorted.length) >= 0.70) {
    return 'Static test';
  }

  // 3. Check Potential Mortality (fixes over the last 4 days are all < 20m from their barycenter)
  // We look at the last 4 days of data leading up to the latest fix.
  const fourDaysAgo = latestTime - (4 * 24 * 60 * 60 * 1000);
  const recentPositions = sorted.filter(p => new Date(p.timestamp).getTime() >= fourDaysAgo);

  if (recentPositions.length > 0) {
    const firstRecentTime = new Date(recentPositions[0].timestamp).getTime();
    const durationDays = (latestTime - firstRecentTime) / (1000 * 60 * 60 * 24);
    
    // Only confidently call it mortality if we have data spanning at least 3 days in this 4-day window
    // Otherwise a bird could have just rested for 12 hours and we call it dead.
    if (durationDays >= 3) {
      const recentBarycenter = calculateBarycenter(recentPositions);
      let allStationary = true;
      for (const p of recentPositions) {
        const pLat = p.lat !== undefined ? p.lat : p.latitude;
        const pLon = p.lon !== undefined ? p.lon : p.longitude;
        const dist = calculateHaversineDistance(recentBarycenter.lat, recentBarycenter.lon, pLat, pLon);
        if (dist >= 20) {
          allStationary = false;
          break;
        }
      }

      if (allStationary) {
        return 'Potential Mortality';
      }
    }
  }

  // 4. Default to Active
  return 'Active';
}
