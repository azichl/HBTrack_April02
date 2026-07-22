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
 * Pure statistical decision algorithm based on R script parameters:
 * PercPos, Mov50, Mov95, dmax, CopyPasteRate (identical fix ratio), Nday (cluster duration)
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

    // Doppler fixes are excluded from spatial cluster analysis because their inherent 
    // error (often 250m - 1500m) mathematically skews exact spatial clustering.
    return false;
  });

  // Use valid positions for timestamp checks (to detect inactivity)
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

  // If no quality positions exist, default to Active (we have data but it's all Doppler)
  if (qualityPositions.length === 0) {
    return { status: 'Active', isNesting: false };
  }

  // Sort quality positions by timestamp for spatial analysis
  const sorted = [...qualityPositions].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  // 2. Check Static Test (70% of ALL quality points < 20m from global barycenter)
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

  // 3. DBSCAN-inspired spatial cluster evaluation around latest active location
  const latestFix = sorted[sorted.length - 1];
  const latestFixLat = latestFix.lat !== undefined ? parseFloat(latestFix.lat) : parseFloat(latestFix.latitude);
  const latestFixLon = latestFix.lon !== undefined ? parseFloat(latestFix.lon) : parseFloat(latestFix.longitude);

  // Cluster points near latest fix (500m radius around recent location)
  const clusterPoints = sorted.filter(p => {
    const pLat = p.lat !== undefined ? parseFloat(p.lat) : parseFloat(p.latitude);
    const pLon = p.lon !== undefined ? parseFloat(p.lon) : parseFloat(p.longitude);
    return calculateHaversineDistance(latestFixLat, latestFixLon, pLat, pLon) <= 500;
  });

  if (clusterPoints.length >= 3) {
    const clusterSorted = [...clusterPoints].sort((a,b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    const startT = new Date(clusterSorted[0].timestamp).getTime();
    const endT = new Date(clusterSorted[clusterSorted.length - 1].timestamp).getTime();
    const nDay = (endT - startT) / (1000 * 60 * 60 * 24);

    const robustCenter = calculateMedianCenter(clusterPoints);

    // Positions across the full time window of this cluster (startT to endT)
    const windowPositions = sorted.filter(p => {
      const t = new Date(p.timestamp).getTime();
      return t >= startT && t <= endT;
    });

    const percPos = windowPositions.length > 0 ? clusterPoints.length / windowPositions.length : 1.0;

    const distances = windowPositions.map(p => {
      const pLat = p.lat !== undefined ? parseFloat(p.lat) : parseFloat(p.latitude);
      const pLon = p.lon !== undefined ? parseFloat(p.lon) : parseFloat(p.longitude);
      return calculateHaversineDistance(robustCenter.lat, robustCenter.lon, pLat, pLon);
    }).sort((a, b) => a - b);

    const mov50 = distances[Math.floor(distances.length * 0.50)];
    const mov95 = distances[Math.floor(distances.length * 0.95)];

    // Copy/paste rate: consecutive points within 1m
    let copyPasteCount = 0;
    for (let i = 1; i < windowPositions.length; i++) {
      const p1Lat = windowPositions[i-1].lat !== undefined ? parseFloat(windowPositions[i-1].lat) : parseFloat(windowPositions[i-1].latitude);
      const p1Lon = windowPositions[i-1].lon !== undefined ? parseFloat(windowPositions[i-1].lon) : parseFloat(windowPositions[i-1].longitude);
      const p2Lat = windowPositions[i].lat !== undefined ? parseFloat(windowPositions[i].lat) : parseFloat(windowPositions[i].latitude);
      const p2Lon = windowPositions[i].lon !== undefined ? parseFloat(windowPositions[i].lon) : parseFloat(windowPositions[i].longitude);
      if (calculateHaversineDistance(p1Lat, p1Lon, p2Lat, p2Lon) < 1) {
        copyPasteCount++;
      }
    }
    const copyPasteRate = windowPositions.length > 1 ? copyPasteCount / (windowPositions.length - 1) : 0;

    // ── R SCRIPT STATISTICAL / BIOLOGICAL RULES ──
    if (mov50 <= 30) {
      // Indicator 1: Cluster duration > 25 days -> DEATH
      // Incubating eggs takes max 21-25 days. Continuous cluster > 25 days is biologically impossible for a nest.
      if (nDay >= 25 && percPos >= 0.70) {
        return { status: 'Potential Mortality', isNesting: false };
      }

      // Indicator 2: High attendance rate (PercPos >= 85%) -> DEATH
      // A dead bird never leaves the cluster. Nesting females leave daily to forage.
      if (percPos >= 0.85) {
        return { status: 'Potential Mortality', isNesting: false };
      }

      // Indicator 3: High repetition of exact coordinates (CopyPasteRate >= 25% or Mov50 < 1m) -> DEATH
      // Stationary transmitter on the ground repeating exact coordinate strings.
      if (copyPasteRate >= 0.25 || mov50 < 1.0) {
        return { status: 'Potential Mortality', isNesting: false };
      }

      // Indicator 4: Nesting signature
      // Duration 3-25 days, attendance 50-85%, foraging range Mov95 100-2000m.
      if (nDay >= 3 && nDay < 25 && percPos >= 0.50 && mov95 >= 100 && mov95 <= 2000) {
        return { status: 'Active', isNesting: true };
      }

      // Indicator 5: Any other tight cluster with duration >= 3 days -> Potential Mortality
      if (nDay >= 3) {
        return { status: 'Potential Mortality', isNesting: false };
      }
    }
  }

  // 4. Default to Active
  return { status: 'Active', isNesting: false };
}
