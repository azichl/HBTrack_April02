// fix_zigzag_definitive.cjs
const fs = require('fs');
const path = require('path');

const rootDir = '/Users/abdelazizchlih/HBTrack_April02';
const firestoreServicePath = path.join(rootDir, 'services/firestoreService.ts');

let content = fs.readFileSync(firestoreServicePath, 'utf8');

// 1. Fix the missing `parseUtc` import on line 12
content = content.replace(
  "import { resolveTimes } from '../src/features/track-order/fixTime';",
  "import { resolveTimes, parseUtc } from '../src/features/track-order/fixTime';"
);

// 2. Replace `getHistoricalPositions` so that:
//    a) `argos_positions` is the authoritative source of `locationDate`
//    b) Legacy `positions` docs without `locationDate` (where `timestamp` is actually `messageDate` like 13:19:12.761)
//       are matched by coordinate (lat, lon) against `argos_positions` and NEVER create phantom message-date duplicates!
const startMarker = 'export const getHistoricalPositions = async (transmitterIds: string[], startDate: Date, endDate: Date) => {';
const endMarker = '/** Save positions in batch, using composite key as document ID */';

const startIdx = content.indexOf(startMarker);
const endIdx = content.indexOf(endMarker);

if (startIdx === -1 || endIdx === -1) {
  console.error('❌ Could not locate getHistoricalPositions boundaries in services/firestoreService.ts');
  process.exit(1);
}

const newGetHistoricalPositions = `export const getHistoricalPositions = async (transmitterIds: string[], startDate: Date, endDate: Date) => {
  if (!transmitterIds || transmitterIds.length === 0) {
    return [];
  }

  const startMs = startDate.getTime();
  const endMs   = endDate.getTime();
  const allResults: any[] = [];

  const getCoordKey = (lat: number, lon: number) => \`\${lat.toFixed(4)},\${lon.toFixed(4)}\`;

  const processDocToRawFix = (
    docSnap: any,
    pidStr: string,
    sourceCol: 'argos_positions' | 'positions',
    canonicalCoordToLocMs: Map<string, number>
  ): RawFix | null => {
    const d = docSnap.data();
    const rawLat = d.lat !== undefined ? d.lat : d.latitude;
    const rawLon = d.lon !== undefined ? d.lon : d.longitude;
    const lat = Number(rawLat);
    let lon = Number(rawLon);
    if (!isValidCoordinate(lat, lon)) return null;
    if (pidStr === '242086' && lon < 0) lon = Math.abs(lon);

    const coordKey = getCoordKey(lat, lon);
    const isGps = d.locationType === 'GPS' || (!d.locationType && (!d.lc || d.lc === 'GPS'));
    const rawDataStr = String(d.rawData || d.raw_data || '').trim().toLowerCase();

    // Extract explicit GPS/location date fields FIRST (never messageDate or generic timestamp)
    const explicitLoc =
      d.locationDate ||
      d.gpsLocDate ||
      d.location?.locationDate ||
      d.gpsDate ||
      d.gpsDateOfPosition ||
      d.dateOfPosition ||
      d.fixTime;

    let locDateMs: number | null = null;

    if (explicitLoc) {
      locDateMs = safeParseTimestamp(explicitLoc);
    } else if (isGps && rawDataStr && KNOWN_CLS_RAW_LOCATION_DATES[rawDataStr]) {
      locDateMs = safeParseTimestamp(KNOWN_CLS_RAW_LOCATION_DATES[rawDataStr]);
    } else if (sourceCol === 'positions' && canonicalCoordToLocMs.has(coordKey)) {
      // CRITICAL FIX: This doc in 'positions' is a legacy mirror without 'locationDate'
      // (where d.timestamp is the Argos Message Date like 2026-10-26 13:19:12.761 instead of GPS Date 2026-10-25 04:00:00).
      // Map it to its true canonical GPS locationDate from argos_positions so it deduplicates cleanly!
      locDateMs = canonicalCoordToLocMs.get(coordKey)!;
    } else {
      const { fix, message } = resolveTimes(d);
      locDateMs = fix ?? (!isGps ? message : null);
    }

    if (locDateMs == null || isNaN(locDateMs) || locDateMs <= 0) return null;

    // Register authoritative GPS locationDate from argos_positions
    if (sourceCol === 'argos_positions' && !canonicalCoordToLocMs.has(coordKey)) {
      canonicalCoordToLocMs.set(coordKey, locDateMs);
    }

    const { message } = resolveTimes(d);
    const locType: 'GPS' | 'DOPPLER' = isGps ? 'GPS' : 'DOPPLER';
    const locClass = locType === 'GPS' ? null : (d.locationClass || (d.lc !== 'GPS' ? d.lc : null) || null);
    const errRadiusM = locType === 'GPS' ? 0 : (typeof d.errorRadiusM === 'number' ? d.errorRadiusM : (parseFloat(String(d.dopplerError || '0')) || 0));
    const arrivalDate = message != null
      ? new Date(message).toISOString()
      : (d.receivedAt || d.firstMessageDate || d.messageDate || d.msgDatetime || null);

    return {
      pttId: pidStr,
      unitType: d.unitType || d.msgType || 'Houbara',
      locationType: locType,
      locationClass: locClass,
      errorRadiusM: errRadiusM,
      locationDate: new Date(locDateMs).toISOString(),
      lat,
      lon,
      messageDate: arrivalDate,
      deliveries: d.deliveryCount || 1
    };
  };

  try {
    for (const pttId of transmitterIds) {
      const pidStr = normalizePttId(pttId);
      const idNum = Number(pttId);
      const isNumValid = !isNaN(idNum);

      // 1. Check in-memory cache first to avoid redundant Firestore reads
      const cached = transmitterHistoryCache.get(pidStr);
      if (cached && (Date.now() - cached.cachedAt < HISTORY_CACHE_TTL)) {
        const filtered = cached.docs.filter(r => {
          const ts = safeParseTimestamp(r.locationDate || r.timestamp);
          return !isNaN(ts) && ts >= startMs && ts <= endMs;
        });
        allResults.push(...filtered);
        continue;
      }

      // 2. Fetch from Firestore: process argos_positions FIRST so canonical locationDates are known
      const rawFixesForPtt: RawFix[] = [];
      const canonicalCoordToLocMs = new Map<string, number>();

      const argosPromises: Promise<any>[] = [
        getDocs(query(collection(db, 'argos_positions'), where('platformId', '==', pidStr))).catch(() => null)
      ];
      const posPromises: Promise<any>[] = [
        getDocs(query(collection(db, 'positions'), where('transmitter_id', '==', pidStr))).catch(() => null)
      ];

      if (isNumValid && idNum !== Number(pidStr)) {
        argosPromises.push(getDocs(query(collection(db, 'argos_positions'), where('platformId', '==', idNum))).catch(() => null));
        posPromises.push(getDocs(query(collection(db, 'positions'), where('transmitter_id', '==', idNum))).catch(() => null));
      }

      const [argosSnaps, posSnaps] = await Promise.all([
        Promise.all(argosPromises),
        Promise.all(posPromises)
      ]);

      // Pass 1: Authoritative argos_positions
      argosSnaps.forEach(snap => {
        if (!snap) return;
        snap.forEach((ds: any) => {
          const rawFix = processDocToRawFix(ds, pidStr, 'argos_positions', canonicalCoordToLocMs);
          if (rawFix) rawFixesForPtt.push(rawFix);
        });
      });

      // Pass 2: Legacy positions collection (only add if not already covered or map to canonical locationDate)
      posSnaps.forEach(snap => {
        if (!snap) return;
        snap.forEach((ds: any) => {
          const rawFix = processDocToRawFix(ds, pidStr, 'positions', canonicalCoordToLocMs);
          if (rawFix) rawFixesForPtt.push(rawFix);
        });
      });

      const { fixes } = buildFixes(rawFixesForPtt);

      // Strictly sort fixes ascending by true locationDateMs (f.t)
      const sortedFixes = [...fixes].sort((a, b) => a.t - b.t);

      const pttDocs = sortedFixes.map((f: Fix) => {
        const locDateIso = new Date(f.t).toISOString();
        return {
          id: f.id,
          transmitter_id: f.pttId,
          platformId: f.pttId,
          deviceId: f.pttId,
          lat: f.lat,
          lon: f.lon,
          timestamp: locDateIso,
          locationDate: locDateIso,
          lc: (f.type === 'GPS' ? 'GPS' : String(f.cls || 'Z')) as any,
          locationClass: f.cls,
          errorRadiusM: f.errorRadiusM,
          lagMinutes: f.firstMessageMs ? Math.max(0, Math.round((f.firstMessageMs - f.t) / 60000)) : 0,
          delay: f.firstMessageMs ? Math.max(0, Math.round((f.firstMessageMs - f.t) / 60000)) : 0,
          firstMessageDate: f.firstMessageMs ? new Date(f.firstMessageMs).toISOString() : null,
          messageDate: f.firstMessageMs ? new Date(f.firstMessageMs).toISOString() : null,
          receivedAt: f.firstMessageMs ? new Date(f.firstMessageMs).toISOString() : null,
          satellite: f.type === 'GPS' ? 'GPS' : '',
          locationType: f.type,
          speed_kmh: 0,
        };
      });

      // Cache all positions for this transmitter
      transmitterHistoryCache.set(pidStr, { cachedAt: Date.now(), docs: pttDocs });

      // Filter to requested date window by location fix date
      const dateFiltered = pttDocs.filter(r => {
        const ts = safeParseTimestamp(r.locationDate || r.timestamp);
        return !isNaN(ts) && ts >= startMs && ts <= endMs;
      });

      allResults.push(...dateFiltered);
    }

    allResults.sort((a, b) => safeParseTimestamp(a.locationDate || a.timestamp) - safeParseTimestamp(b.locationDate || b.timestamp));
    return allResults;
  } catch (error) {
    console.error('[Firestore] Error in getHistoricalPositions:', error);
    return [];
  }
};

`;

content = content.slice(0, startIdx) + newGetHistoricalPositions + content.slice(endIdx);

// 3. Also fix \`loadAllPositions\` so it prefers \`locationDate\` over \`timestamp\`
content = content.replace(
  'timestamp: d.timestamp,',
  'timestamp: d.locationDate || d.gpsLocDate || d.timestamp,\n        locationDate: d.locationDate || d.gpsLocDate || d.timestamp,'
);

fs.writeFileSync(firestoreServicePath, content, 'utf8');
console.log('✅ Successfully patched services/firestoreService.ts!');
