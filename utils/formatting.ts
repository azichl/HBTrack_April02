

export const getSystemTimeZone = (): string => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch (e) {
    return 'UTC';
  }
};

export const formatDateTime = (isoString?: string | null, timeZone?: string): string => {
  if (!isoString) return '-';
  try {
    // Ensure the timestamp is parsed as UTC if it lacks a timezone indicator (like Z or +00:00)
    let parsedString = isoString;
    if (!parsedString.endsWith('Z') && !parsedString.match(/[+-]\d{2}:?\d{2}$/)) {
        // Only append Z if it looks like a standard date string without timezone
        parsedString = parsedString.replace(' ', 'T'); // Handle "YYYY-MM-DD HH:mm:ss"
        parsedString += 'Z';
    }

    const date = new Date(parsedString);
    if (isNaN(date.getTime())) return '-';
    
    // Determine target timezone: if specified and not 'system'/'auto'/'local', use it.
    // Otherwise default to the system device's local timezone.
    let targetTz = timeZone;
    if (!targetTz || targetTz === 'system' || targetTz === 'auto' || targetTz === 'local') {
      targetTz = getSystemTimeZone();
    }
    
    return new Intl.DateTimeFormat('en-GB', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
      timeZone: targetTz
    }).format(date).replace(',', '');
  } catch (e) {
    return '-';
  }
};

export const formatBattery = (voltage?: number): string => {
  if (voltage === undefined || voltage === null || voltage === 0) return '-- V';
  return `${voltage.toFixed(1)} V`;
};

export function safeParseTimestamp(ts: any): number {
  if (!ts) return NaN;
  if (typeof ts === 'number') return ts;
  if (typeof ts === 'object') {
    if (typeof ts.seconds === 'number') return ts.seconds * 1000;
    if (typeof ts._seconds === 'number') return ts._seconds * 1000;
    if (ts.toDate && typeof ts.toDate === 'function') {
      try { return ts.toDate().getTime(); } catch (_) {}
    }
  }
  const str = String(ts).trim();
  if (!str) return NaN;

  // DD/MM/YYYY HH:mm:ss or DD/MM/YYYY HH:mm
  const dmyMatch = str.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (dmyMatch) {
    const [_, d, m, y, h, min, s] = dmyMatch;
    return Date.UTC(Number(y), Number(m)-1, Number(d), Number(h), Number(min), Number(s || 0));
  }
  // DD/MM/YYYY
  const dmyMatch2 = str.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (dmyMatch2) {
    const [_, d, m, y] = dmyMatch2;
    return Date.UTC(Number(y), Number(m)-1, Number(d));
  }
  // YYYY-MM-DD HH:mm:ss or YYYY-MM-DD HH:mm (with optional subseconds)
  const ymdMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})[\sT](\d{2}):(\d{2})(?::(\d{2}))?(?:\.(\d+))?/);
  if (ymdMatch) {
    const [_, y, m, d, h, min, s, ms] = ymdMatch;
    let millis = 0;
    if (ms) {
      millis = Number(ms.padEnd(3, '0').slice(0, 3));
    }
    return Date.UTC(Number(y), Number(m)-1, Number(d), Number(h), Number(min), Number(s || 0), millis);
  }

  // Replace space with T for Safari/iOS compatibility
  const isoFormatted = str.includes(' ') && !str.includes('T') ? str.replace(' ', 'T') : str;
  const parsed = new Date(isoFormatted).getTime();
  return isNaN(parsed) ? new Date(str).getTime() : parsed;
}

export function getYearMonthKey(ts: any): string {
  if (!ts) return '';
  const timeMs = safeParseTimestamp(ts);
  if (isNaN(timeMs) || timeMs <= 0) return '';
  const d = new Date(timeMs);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export function getCurrentYearMonthKey(): string {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

/**
 * Accurately determines whether an Argos telemetry fix is GPS or Doppler.
 * Rule: Location Classes '3', '2', '1', '0', 'A', 'B', 'Z' are EXCLUSIVELY Doppler.
 * GPS fixes have LC 'GPS', 'G', or empty string with GPS locationType.
 */
export const classifyLocationType = (lc?: string, rawLocType?: string): 'GPS' | 'Doppler' => {
  const lcUp = String(lc || '').trim().toUpperCase();
  const rtUp = String(rawLocType || '').trim().toUpperCase();

  // If LC is one of the standard Argos Doppler classes, it is ALWAYS Doppler
  if (['3', '2', '1', '0', 'A', 'B', 'Z'].includes(lcUp)) {
    return 'Doppler';
  }

  // If LC is GPS or G, or rawLocType is GPS (and not a Doppler class), it is GPS
  if (lcUp === 'GPS' || lcUp === 'G' || rtUp === 'GPS') {
    return 'GPS';
  }

  if (rtUp === 'DOPPLER') {
    return 'Doppler';
  }

  return 'GPS';
};

/**
 * Validates whether a fix is high quality (GPS or Doppler LC 3, 2, 1).
 * Poor Doppler classes (0, A, B, Z) with error radii > 1.5km are excluded.
 */
export const isHighQualityFix = (lc?: string, locType?: string): boolean => {
  const lcUp = String(lc || '').trim().toUpperCase();
  const type = classifyLocationType(lc, locType);

  if (type === 'GPS') {
    return true;
  }

  // For Doppler, only accept high quality classes (3, 2, 1)
  // LC 3: < 250m
  // LC 2: 250 - 500m
  // LC 1: 500 - 1500m
  // LC 0, A, B, Z: > 1500m or unbounded error -> REJECT
  if (['3', '2', '1'].includes(lcUp)) {
    return true;
  }

  return false;
};

/**
 * Validates whether latitude and longitude are valid non-zero geographic coordinates.
 * Strictly rejects:
 * - NaN, null, undefined
 * - Out of bounds (|lat| > 90 or |lon| > 180)
 * - Exact zero (lat === 0 or lon === 0)
 * - Near-zero / "Null Island" noise in Gulf of Guinea / Equatorial Guinea (|lat| < 1 && |lon| < 1)
 */
export const isValidCoordinate = (lat: any, lon: any): boolean => {
  if (lat === undefined || lat === null || lon === undefined || lon === null) return false;
  const numLat = typeof lat === 'number' ? lat : parseFloat(String(lat));
  const numLon = typeof lon === 'number' ? lon : parseFloat(String(lon));

  if (isNaN(numLat) || isNaN(numLon)) return false;
  if (Math.abs(numLat) > 90 || Math.abs(numLon) > 180) return false;
  if (numLat === 0 || numLon === 0) return false;
  if (Math.abs(numLat) < 1 && Math.abs(numLon) < 1) return false;

  return true;
};

/**
 * Seamlessly matches a transmitter's bird_id or assigned_bird_ring to a Bird object.
 * Checks by b.id, b.ring_id, and prefix-stripped variants to ensure compatibility.
 */
export const findBirdForTransmitter = (birds: any[], birdIdOrTransmitter?: any): any | undefined => {
  if (!birdIdOrTransmitter || !birds || birds.length === 0) return undefined;
  let targetId = '';
  let targetRing = '';
  if (typeof birdIdOrTransmitter === 'string') {
    targetId = birdIdOrTransmitter.trim();
  } else if (typeof birdIdOrTransmitter === 'object') {
    targetId = birdIdOrTransmitter.bird_id ? String(birdIdOrTransmitter.bird_id).trim() : '';
    targetRing = birdIdOrTransmitter.assigned_bird_ring ? String(birdIdOrTransmitter.assigned_bird_ring).trim() : '';
  }

  const targets = [targetId, targetRing].filter(Boolean);
  if (targets.length === 0) return undefined;

  return birds.find(b => {
    if (!b) return false;
    return targets.some(target => {
      const strippedTarget = target.replace(/^bird-/, '');
      if (b.id === target || b.ring_id === target) return true;
      if (b.ring_id && b.ring_id.replace(/^bird-/, '') === strippedTarget) return true;
      if (b.id && b.id.replace(/^bird-/, '') === strippedTarget) return true;
      return false;
    });
  });
};

/**
 * Checks if a Bird is linked to a Transmitter.
 */
export const isBirdLinkedToTransmitter = (bird: any, transmitter: any): boolean => {
  if (!bird || !transmitter) return false;
  const targetId = transmitter.bird_id ? String(transmitter.bird_id).trim() : '';
  const targetRing = transmitter.assigned_bird_ring ? String(transmitter.assigned_bird_ring).trim() : '';
  
  const targets = [targetId, targetRing].filter(Boolean);
  if (targets.length === 0) return false;

  return targets.some(target => {
    const strippedTarget = target.replace(/^bird-/, '');
    if (target === bird.id || target === bird.ring_id) return true;
    if (bird.ring_id && bird.ring_id.replace(/^bird-/, '') === strippedTarget) return true;
    if (bird.id && bird.id.replace(/^bird-/, '') === strippedTarget) return true;
    return false;
  });
};


