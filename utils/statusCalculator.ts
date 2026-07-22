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
 * Transmitter Status Evaluation
 * Incorporates 3-day mortality threshold + diurnal incubation & foraging schedule analysis.
 */
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

  // Filter: only use GPS quality fixes for spatial analysis
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

    return false;
  });

  // Valid positions for timestamp check
  const validPositions = positions.filter(p => {
    const pLat = p.lat !== undefined ? parseFloat(p.lat) : parseFloat(p.latitude);
    const pLon = p.lon !== undefined ? parseFloat(p.lon) : parseFloat(p.longitude);
    return !(isNaN(pLat) || isNaN(pLon) || (Math.abs(pLat) <= 1 && Math.abs(pLon) <= 1));
  });

  const allSorted = [...validPositions].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  
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

  if (qualityPositions.length === 0) {
    return { status: 'Active', isNesting: false };
  }

  const sorted = [...qualityPositions].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  // 2. Global Static Test Check (>70% of points < 20m from global center)
  let sumLat = 0, sumLon = 0;
  sorted.forEach(p => {
    sumLat += p.lat !== undefined ? parseFloat(p.lat) : parseFloat(p.latitude);
    sumLon += p.lon !== undefined ? parseFloat(p.lon) : parseFloat(p.longitude);
  });
  const globalCenter = { lat: sumLat / sorted.length, lon: sumLon / sorted.length };
  let pointsNearGlobalBarycenter = 0;
  sorted.forEach(p => {
    const pLat = p.lat !== undefined ? parseFloat(p.lat) : parseFloat(p.latitude);
    const pLon = p.lon !== undefined ? parseFloat(p.lon) : parseFloat(p.longitude);
    const dist = calculateHaversineDistance(globalCenter.lat, globalCenter.lon, pLat, pLon);
    if (dist < 20) {
      pointsNearGlobalBarycenter++;
    }
  });

  if ((pointsNearGlobalBarycenter / sorted.length) >= 0.70) {
    if (transmitter.bird_id && transmitter.bird_id.trim() !== '') {
      return { status: 'Potential Mortality', isNesting: false };
    }
    return { status: 'Static test', isNesting: false };
  }

  // 3. 3-Day Minimum Threshold + Diurnal Incubation/Foraging Schedule Evaluation
  const latestGpsTime = new Date(sorted[sorted.length - 1].timestamp).getTime();
  const windowStart = latestGpsTime - (10 * 24 * 60 * 60 * 1000); // 10-day lookback window
  const recentPositions = sorted.filter(p => new Date(p.timestamp).getTime() >= windowStart);

  if (recentPositions.length >= 3) {
    const firstRecentTime = new Date(recentPositions[0].timestamp).getTime();
    const durationDays = (latestGpsTime - firstRecentTime) / (1000 * 60 * 60 * 24);

    // Rule: Detect Mortality after 3 full days of stationary data
    if (durationDays >= 3.0) {
      const robustCenter = calculateMedianCenter(recentPositions);

      const distances = recentPositions.map(p => {
        const pLat = p.lat !== undefined ? parseFloat(p.lat) : parseFloat(p.latitude);
        const pLon = p.lon !== undefined ? parseFloat(p.lon) : parseFloat(p.longitude);
        return calculateHaversineDistance(robustCenter.lat, robustCenter.lon, pLat, pLon);
      }).sort((a, b) => a - b);

      const mov50 = distances[Math.floor(distances.length * 0.50)];
      const mov95 = distances[Math.floor(distances.length * 0.95)];

      let inside30m = 0;
      distances.forEach(d => { if (d <= 30) inside30m++; });
      const percPos = inside30m / distances.length;

      // Copy/paste rate: consecutive points < 1m
      let copyPasteCount = 0;
      for (let i = 1; i < recentPositions.length; i++) {
        const p1Lat = recentPositions[i-1].lat !== undefined ? parseFloat(recentPositions[i-1].lat) : parseFloat(recentPositions[i-1].latitude);
        const p1Lon = recentPositions[i-1].lon !== undefined ? parseFloat(recentPositions[i-1].lon) : parseFloat(recentPositions[i-1].longitude);
        const p2Lat = recentPositions[i].lat !== undefined ? parseFloat(recentPositions[i].lat) : parseFloat(recentPositions[i].latitude);
        const p2Lon = recentPositions[i].lon !== undefined ? parseFloat(recentPositions[i].lon) : parseFloat(recentPositions[i].longitude);
        if (calculateHaversineDistance(p1Lat, p1Lon, p2Lat, p2Lon) < 1) {
          copyPasteCount++;
        }
      }
      const copyPasteRate = recentPositions.length > 1 ? copyPasteCount / (recentPositions.length - 1) : 0;

      // ── DIURNAL FORAGING vs INCUBATION SCHEDULE ──
      // Estimate local timezone offset from longitude (lon / 15)
      const localOffsetHours = Math.round(robustCenter.lon / 15);
      let foragingFixesCount = 0;
      let foragingFlightsCount = 0; // fixes > 350m away during foraging hours

      recentPositions.forEach(p => {
        const pLat = p.lat !== undefined ? parseFloat(p.lat) : parseFloat(p.latitude);
        const pLon = p.lon !== undefined ? parseFloat(p.lon) : parseFloat(p.longitude);
        const dist = calculateHaversineDistance(robustCenter.lat, robustCenter.lon, pLat, pLon);

        const utcDate = new Date(p.timestamp);
        const localHour = (utcDate.getUTCHours() + localOffsetHours + 24) % 24;

        // User Defined Schedule:
        // Foraging Hours: 05:00-10:00 (morning) or 17:00-20:00 (evening before sunset)
        // Incubation Hours: 10:00-16:00 (midday) or 20:00-04:00 (night)
        const isForagingHour = (localHour >= 5 && localHour < 10) || (localHour >= 17 && localHour < 20);

        if (isForagingHour) {
          foragingFixesCount++;
          if (dist > 350) {
            foragingFlightsCount++;
          }
        }
      });

      // True Nesting requires active foraging flights (>350m) during 5-10 AM or 5-8 PM
      const hasForagingFlights = foragingFixesCount > 0 && (foragingFlightsCount / foragingFixesCount) >= 0.20;

      if (mov50 <= 30) {
        // High attendance (>=80%), tight max spread (mov95 <= 350m), or high repetition -> Potential Mortality
        if (percPos >= 0.80 || mov95 <= 350 || copyPasteRate >= 0.25) {
          return { status: 'Potential Mortality', isNesting: false };
        }

        // Nesting check: Nesting female incubates midday & night, but makes foraging flights (>350m) during morning/evening
        if (hasForagingFlights && mov95 <= 2000) {
          return { status: 'Active', isNesting: true };
        }

        // Default to Potential Mortality after 3+ days if no foraging flights occur
        return { status: 'Potential Mortality', isNesting: false };
      }
    }
  }

  // 4. Default to Active
  return { status: 'Active', isNesting: false };
}
