import { Position, Transmitter } from '../types';

function degreesToRadians(degrees: number) {
  return degrees * (Math.PI / 180);
}

// Safely parse dates including DD/MM/YYYY HH:mm:ss format from Argos API
function safeParseTimestamp(ts: any): number {
    if (!ts) return NaN;
    if (typeof ts === 'number') return ts;
    const str = String(ts);
    const dmyMatch = str.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/);
    if (dmyMatch) {
        const [_, d, m, y, h, min, s] = dmyMatch;
        return Date.UTC(Number(y), Number(m)-1, Number(d), Number(h), Number(min), Number(s));
    }
    const dmyMatch2 = str.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (dmyMatch2) {
        const [_, d, m, y] = dmyMatch2;
        return Date.UTC(Number(y), Number(m)-1, Number(d));
    }
    return new Date(str).getTime();
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
 * Transmitter Status Evaluation automatically calculated:
 * - Active: PTT assigned to bird and continuing moving
 * - Potential mortality: PTT assigned to bird and receiving the same coordinates during last 2 days (type GPS) not dopplers or in circle under 20m from the center point (calculation of center point exists)
 * - Static test: PTT not assigned to bird
 * - Dead: continuing receiving the same coordinates (type GPS) during 10 days / or marked manually
 * - Inactive: the PTT stopped sending data during 1 month (means last data received older by 1 month)
 *
 * Manual status override takes absolute precedence if set on transmitters table.
 */
export function evaluateTransmitterStatus(
  transmitter: Transmitter, 
  positions: any[]
): { status: 'Active' | 'Potential Mortality' | 'Inactive' | 'Static test' | 'Dead', isNesting: boolean } {
  // 1. Manual status override takes precedence
  if (transmitter.manual_status_override) {
    return { status: transmitter.manual_status_override, isNesting: false };
  }

  // Specific fix for transmitter 242086: convert all negative longitudes to positive longitudes
  if (String(transmitter.platform_id) === '242086' && positions && positions.length > 0) {
    positions = positions.map(p => {
      const pLon = p.lon !== undefined ? parseFloat(p.lon) : (p.longitude !== undefined ? parseFloat(p.longitude) : NaN);
      if (!isNaN(pLon) && pLon < 0) {
        const positiveLon = Math.abs(pLon);
        return {
          ...p,
          lon: p.lon !== undefined ? positiveLon : p.lon,
          longitude: p.longitude !== undefined ? positiveLon : p.longitude
        };
      }
      return p;
    });
  }

  // 2. Inactive check: stopped sending data during 1 month (older than 1 month / 30 days)
  let latestDataTs = NaN;

  if (positions && positions.length > 0) {
    positions.forEach(p => {
      const rawTs = p.locationDate || p.timestamp || p.messageDate || (p as any).date;
      const ts = safeParseTimestamp(rawTs);
      if (!isNaN(ts) && (isNaN(latestDataTs) || ts > latestDataTs)) {
        latestDataTs = ts;
      }
    });
  }

  const lastFixTs = safeParseTimestamp(transmitter.last_fix);
  if (!isNaN(lastFixTs) && (isNaN(latestDataTs) || lastFixTs > latestDataTs)) {
    latestDataTs = lastFixTs;
  }

  const lastMsgTs = safeParseTimestamp(transmitter.live?.lastMessageAt);
  if (!isNaN(lastMsgTs) && (isNaN(latestDataTs) || lastMsgTs > latestDataTs)) {
    latestDataTs = lastMsgTs;
  }

  const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
  const now = Date.now();

  // If no data received at all or data older than 1 month -> Inactive
  if (isNaN(latestDataTs) || (now - latestDataTs) > THIRTY_DAYS_MS) {
    return { status: 'Inactive', isNesting: false };
  }

  // 3. Static test check: PTT not assigned to bird
  const isAssignedToBird = Boolean(transmitter.bird_id && String(transmitter.bird_id).trim() !== '');
  if (!isAssignedToBird) {
    return { status: 'Static test', isNesting: false };
  }

  // 4. Filter only valid GPS fixes (type GPS, NOT dopplers)
  const gpsPositions = (positions || []).filter(p => {
    const lat = p.lat !== undefined ? parseFloat(p.lat) : parseFloat(p.latitude);
    const lon = p.lon !== undefined ? parseFloat(p.lon) : parseFloat(p.longitude);
    if (isNaN(lat) || isNaN(lon) || (lat === 0 && lon === 0) || (Math.abs(lat) <= 1 && Math.abs(lon) <= 1)) {
      return false;
    }
    const locType = String(p.locationType || '').toUpperCase().trim();
    const lc = String(p.lc || '').toUpperCase().trim();
    return locType === 'GPS' || lc === 'GPS' || lc === 'G';
  });

  // If no GPS fixes available, but transmitter has transmitted within 1 month and is assigned to bird -> Active
  if (gpsPositions.length === 0) {
    return { status: 'Active', isNesting: false };
  }

  // Sort GPS positions chronologically
  const sortedGps = [...gpsPositions].sort((a, b) => {
    return safeParseTimestamp(a.locationDate || a.timestamp) - safeParseTimestamp(b.locationDate || b.timestamp);
  });

  const latestGps = sortedGps[sortedGps.length - 1];
  const latestGpsTime = safeParseTimestamp(latestGps.locationDate || latestGps.timestamp);

  // Helper: check if a cluster of fixes is at the same coordinates or in a circle under 20m from center point
  const isStationaryCluster = (clusterFixes: any[]): boolean => {
    if (clusterFixes.length < 2) return false;

    // Check exact repeated coordinates
    const firstLat = clusterFixes[0].lat !== undefined ? parseFloat(clusterFixes[0].lat) : parseFloat(clusterFixes[0].latitude);
    const firstLon = clusterFixes[0].lon !== undefined ? parseFloat(clusterFixes[0].lon) : parseFloat(clusterFixes[0].longitude);
    const allExactSame = clusterFixes.every(p => {
      const pLat = p.lat !== undefined ? parseFloat(p.lat) : parseFloat(p.latitude);
      const pLon = p.lon !== undefined ? parseFloat(p.lon) : parseFloat(p.longitude);
      return Math.abs(pLat - firstLat) < 0.00005 && Math.abs(pLon - firstLon) < 0.00005;
    });
    if (allExactSame) return true;

    // Check circle under 20m from median center point
    const center = calculateMedianCenter(clusterFixes);
    let pointsUnder20m = 0;
    clusterFixes.forEach(p => {
      const pLat = p.lat !== undefined ? parseFloat(p.lat) : parseFloat(p.latitude);
      const pLon = p.lon !== undefined ? parseFloat(p.lon) : parseFloat(p.longitude);
      const dist = calculateHaversineDistance(center.lat, center.lon, pLat, pLon);
      if (dist <= 20) {
        pointsUnder20m++;
      }
    });

    return (pointsUnder20m / clusterFixes.length) >= 0.90;
  };

  const TEN_DAYS_MS = 10 * 24 * 60 * 60 * 1000;
  const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;

  // Fixes in the last 10 days relative to latest GPS fix
  const fixes10Days = sortedGps.filter(p => {
    const t = safeParseTimestamp(p.locationDate || p.timestamp);
    return t >= (latestGpsTime - TEN_DAYS_MS) && t <= latestGpsTime;
  });

  if (fixes10Days.length >= 2) {
    const earliest10 = safeParseTimestamp(fixes10Days[0].locationDate || fixes10Days[0].timestamp);
    const span10 = latestGpsTime - earliest10;
    // Spans at least 9.5 days and is stationary (or continuing receiving the same coordinates)
    if (span10 >= (9.5 * 24 * 60 * 60 * 1000) && isStationaryCluster(fixes10Days)) {
      return { status: 'Dead', isNesting: false };
    }
  }

  // Fixes in the last 2 days relative to latest GPS fix
  const fixes2Days = sortedGps.filter(p => {
    const t = safeParseTimestamp(p.locationDate || p.timestamp);
    return t >= (latestGpsTime - TWO_DAYS_MS) && t <= latestGpsTime;
  });

  if (fixes2Days.length >= 2) {
    const earliest2 = safeParseTimestamp(fixes2Days[0].locationDate || fixes2Days[0].timestamp);
    const span2 = latestGpsTime - earliest2;
    // Spans at least 1.8 days (43+ hours) and is stationary
    if (span2 >= (1.8 * 24 * 60 * 60 * 1000) && isStationaryCluster(fixes2Days)) {
      return { status: 'Potential Mortality', isNesting: false };
    }
  }

  // 5. Active: PTT assigned to bird and continuing moving
  return { status: 'Active', isNesting: false };
}

/**
 * Shared visibility filter for Live Map.
 * Matches status filters without copy-pasting across views.
 */
export function isVisibleOnLiveMap(
  transmitter: Transmitter, 
  selectedStatus: string = 'active',
  hasFixInCurrentMonth: boolean = true
): boolean {
  const status = transmitter.derived_status || transmitter.status || 'Active';
  const isStatic = status === 'Static test' || status === 'Static Test' || status === 'static';
  if (isStatic && !hasFixInCurrentMonth) {
    return false;
  }

  if (selectedStatus === 'all') {
    if (status === 'Inactive' || status === 'inactive') {
      if (transmitter.inactive_since) {
        const inactiveTime = new Date(transmitter.inactive_since).getTime();
        const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
        if (!isNaN(inactiveTime) && (Date.now() - inactiveTime) > thirtyDaysMs) {
          return false;
        }
      }
    }
    return true;
  }

  if (selectedStatus === 'active') return status === 'Active' || status === 'active';
  if (selectedStatus === 'inactive') return status === 'Inactive' || status === 'inactive';
  if (selectedStatus === 'mortality') return status === 'Potential Mortality';
  if (selectedStatus === 'static') return isStatic;
  if (selectedStatus === 'dead') return status === 'Dead' || status === 'dead';
  return true;
}

export function isVisibleInMonitoring(transmitter: Transmitter, hasCurrentMonthFix: boolean = true): boolean {
  // Transmitters in the registry should remain visible in Live Monitoring.
  // Never silently filter out valid transmitters.
  return true;
}

