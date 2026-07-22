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
    sumLat += p.lat !== undefined ? parseFloat(p.lat) : parseFloat(p.latitude);
    sumLon += p.lon !== undefined ? parseFloat(p.lon) : parseFloat(p.longitude);
  });
  return {
    lat: sumLat / positions.length,
    lon: sumLon / positions.length
  };
}

function calculateMedianCenter(positions: any[]): { lat: number, lon: number } {
  if (positions.length === 0) return { lat: 0, lon: 0 };
  
  const lats = positions.map(p => p.lat !== undefined ? parseFloat(p.lat) : parseFloat(p.latitude)).sort((a,b) => a - b);
  const lons = positions.map(p => p.lon !== undefined ? parseFloat(p.lon) : parseFloat(p.longitude)).sort((a,b) => a - b);
  
  const midLat = Math.floor(lats.length / 2);
  const medianLat = lats.length % 2 !== 0 ? lats[midLat] : (lats[midLat - 1] + lats[midLat]) / 2;
  
  const midLon = Math.floor(lons.length / 2);
  const medianLon = lons.length % 2 !== 0 ? lons[midLon] : (lons[midLon - 1] + lons[midLon]) / 2;
  
  return { lat: medianLat, lon: medianLon };
}

/**
 * Determines if a bird is in Asia based on its GPS coordinates.
 * Asia range: roughly longitude > 50° (Central Asia, Kazakhstan, Uzbekistan, etc.)
 */
function isInAsiaRegion(center: { lat: number, lon: number }): boolean {
  return center.lon > 50;
}

/**
 * Checks if the current date falls within the reproduction season for a given region.
 * In Asia: March 1 to June 10 (approximate).
 * Outside Asia: nesting can happen year-round (no seasonal restriction applied).
 */
function isReproductionSeason(isAsia: boolean): boolean {
  if (!isAsia) return true; // No seasonal restriction outside Asia
  const now = new Date();
  const month = now.getMonth() + 1; // 1-indexed
  const day = now.getDate();
  // March 1 to June 10
  if (month >= 3 && month <= 5) return true;
  if (month === 6 && day <= 10) return true;
  return false;
}

export function evaluateTransmitterStatus(
  transmitter: Transmitter, 
  positions: any[]
): { status: 'Active' | 'Potential Mortality' | 'Inactive' | 'Static test', isNesting: boolean } {
  const isDeployed = transmitter.bird_id && transmitter.bird_id.trim() !== '';

  // Active, Inactive, and Potential Mortality are reserved for deployed transmitters.
  // Any transmitter not linked to a bird is categorized as a "Static test".
  if (!isDeployed) {
    return { status: 'Static test', isNesting: false };
  }

  if (!positions || positions.length === 0) {
    return { status: 'Inactive', isNesting: false };
  }

  // Filter: only use GPS fixes with valid coordinates for spatial analysis
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
    return { status: 'Inactive', isNesting: false };
  }

  const latestPos = allSorted[allSorted.length - 1];
  const latestTime = new Date(latestPos.timestamp).getTime();
  const now = new Date().getTime();

  // 1. Check Inactive (> 10 days since last transmission)
  const daysSinceLastFix = (now - latestTime) / (1000 * 60 * 60 * 24);
  if (daysSinceLastFix > 10) {
    return { status: 'Inactive', isNesting: false };
  }

  // If no quality positions exist, default to Active (we have data but it's all low-quality Doppler)
  if (qualityPositions.length === 0) {
    return { status: 'Active', isNesting: false };
  }

  // Sort quality positions by timestamp for spatial analysis
  const sorted = [...qualityPositions].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  // 2. Check Static Test (70% of ALL quality points < 20m from global barycenter)
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

  if ((pointsNearGlobalBarycenter / sorted.length) >= 0.70) {
    // If the transmitter is fitted to a bird, it cannot be a "Static test"
    // A bird that is completely stationary is Potentially Dead.
    if (transmitter.bird_id && transmitter.bird_id.trim() !== '') {
      return { status: 'Potential Mortality', isNesting: false };
    }
    return { status: 'Static test', isNesting: false };
  }

  // 3. Check Potential Mortality and Nesting (statistical approach)
  // We look at the last 10 days of data leading up to the latest GPS fix.
  // Use the latest GPS fix timestamp (not the latest Doppler) as the window anchor.
  const latestGpsTime = new Date(sorted[sorted.length - 1].timestamp).getTime();
  const windowStart = latestGpsTime - (10 * 24 * 60 * 60 * 1000);
  const recentPositions = sorted.filter(p => new Date(p.timestamp).getTime() >= windowStart);

  if (recentPositions.length > 0) {
    const firstRecentTime = new Date(recentPositions[0].timestamp).getTime();
    const durationDays = (latestGpsTime - firstRecentTime) / (1000 * 60 * 60 * 24);
    
    // Only confidently analyze if we have data spanning at least 3 days
    if (durationDays >= 3) {
      // Use a robust Median Center instead of Barycenter (mean) to completely ignore GPS outliers
      const robustCenter = calculateMedianCenter(recentPositions);
      
      const distances = recentPositions.map(p => {
        const pLat = p.lat !== undefined ? parseFloat(p.lat) : parseFloat(p.latitude);
        const pLon = p.lon !== undefined ? parseFloat(p.lon) : parseFloat(p.longitude);
        return calculateHaversineDistance(robustCenter.lat, robustCenter.lon, pLat, pLon);
      }).sort((a, b) => a - b);

      if (distances.length >= 3) {
        const mov50 = distances[Math.floor(distances.length * 0.50)];
        const mov95 = distances[Math.floor(distances.length * 0.95)];
        
        let inside30m = 0;
        for (const d of distances) {
          if (d <= 30) inside30m++;
        }
        const percPos = inside30m / distances.length;

        // Determine geographic region for seasonal nesting rules
        const inAsia = isInAsiaRegion(robustCenter);
        const nestingSeason = isReproductionSeason(inAsia);

        // ── DECISION LOGIC ──
        // A stationary bird (mov50 tight) is either dead, nesting, or a GPS-error case.
        if (mov50 <= 25) {
          // Case 1: Very high attendance → clearly stationary → Potential Mortality
          if (percPos >= 0.85) {
            return { status: 'Potential Mortality', isNesting: false };
          }

          // Case 2: Moderate attendance (50-85%) — needs disambiguation
          if (percPos >= 0.50) {
            // If it's outside reproduction season in Asia, nesting is biologically impossible.
            // Any stationary behavior outside the season is Potential Mortality.
            if (!nestingSeason) {
              return { status: 'Potential Mortality', isNesting: false };
            }

            // Inside reproduction season: check if outliers are GPS errors or foraging
            if (mov95 > 3000) {
              // Outliers are massive GPS errors (> 3km), typical of a flipped dead transmitter
              return { status: 'Potential Mortality', isNesting: false };
            } else {
              // Outliers are within a normal foraging range during breeding season
              return { status: 'Active', isNesting: true };
            }
          }

          // Case 3: Low attendance (<50%) but tight core — still suspicious
          // If the bird has a tight median cluster but very low attendance,
          // it's likely dead with lots of error fixes. Flag as mortality.
          // (A living bird with <50% attendance would have mov50 >> 25m from daily movements)
          if (!nestingSeason) {
            return { status: 'Potential Mortality', isNesting: false };
          }
        }
      }
    }
  }

  // 4. Default to Active
  return { status: 'Active', isNesting: false };
}
