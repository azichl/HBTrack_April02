const fs = require('fs');
const path = require('path');

const root = '/Users/abdelazizchlih/HBTrack_April02';

// ============================================================================
// 1. PATCH services/firestoreService.ts
// ============================================================================
const fsPath = path.join(root, 'services/firestoreService.ts');
let fsCode = fs.readFileSync(fsPath, 'utf8');

// Fix missing parseUtc reference by replacing parseUtc(...) with safeParseTimestamp(...)
fsCode = fsCode.replace(/parseUtc\(/g, 'safeParseTimestamp(');

// Replace loadAllPositions so it loads from argos_positions + positions and deduplicates by coordinate
const loadAllPosStart = fsCode.indexOf('export const loadAllPositions = async');
const loadAllPosEnd = fsCode.indexOf('export const getArgosTransmitterIds = async');

if (loadAllPosStart !== -1 && loadAllPosEnd !== -1) {
  const newLoadAllPositions = `export const loadAllPositions = async (startDate?: Date, endDate?: Date): Promise<any[]> => {
  try {
    let qPos, qArgos;
    if (startDate && endDate) {
      const sIso = startDate.toISOString();
      const eIso = endDate.toISOString();
      qPos = query(collection(db, 'positions'), where('timestamp', '>=', sIso), where('timestamp', '<=', eIso), orderBy('timestamp', 'desc'));
      qArgos = query(collection(db, 'argos_positions'), where('timestamp', '>=', sIso), where('timestamp', '<=', eIso), orderBy('timestamp', 'desc'));
    } else {
      const defaultStart = new Date();
      defaultStart.setDate(defaultStart.getDate() - 7);
      const sIso = defaultStart.toISOString();
      qPos = query(collection(db, 'positions'), where('timestamp', '>=', sIso), orderBy('timestamp', 'desc'));
      qArgos = query(collection(db, 'argos_positions'), where('timestamp', '>=', sIso), orderBy('timestamp', 'desc'));
    }

    const [snapArgos, snapPos] = await Promise.all([
      getDocs(qArgos).catch(() => null),
      getDocs(qPos).catch(() => null)
    ]);

    const coordToTrueDate = new Map<string, string>();
    const data: any[] = [];
    const seenKey = new Set<string>();

    // 1. Process authoritative argos_positions FIRST
    if (snapArgos) {
      snapArgos.forEach(docSnap => {
        const d = docSnap.data() as any;
        const pid = normalizePttId(d.platformId || d.pttId || d.transmitter_id || '');
        const lat = Number(d.lat ?? d.latitude);
        const lon = Number(d.lon ?? d.longitude);
        if (!pid || !isValidCoordinate(lat, lon)) return;
        const trueLocDate = d.locationDate || d.gpsLocDate || d.timestamp;
        const cKey = \`\${pid}_\${lat.toFixed(4)}_\${lon.toFixed(4)}\`;
        if (trueLocDate && !coordToTrueDate.has(cKey)) {
          coordToTrueDate.set(cKey, trueLocDate);
        }
        const uKey = \`\${pid}_\${trueLocDate}\`;
        if (seenKey.has(uKey)) return;
        seenKey.add(uKey);

        data.push({
          id: docSnap.id,
          _collection: 'argos_positions',
          transmitter_id: pid,
          platformId: pid,
          programId: d.programId || '',
          lat,
          lon,
          lc: d.lc || 'GPS',
          locationType: d.locationType || 'GPS',
          msgType: d.msgType || '',
          dopplerError: d.dopplerError || '',
          timestamp: trueLocDate,
          locationDate: trueLocDate,
          messageDate: d.messageDate || d.firstMessageDate || null,
          satellite: d.satellite || 'GPS',
          speed_kmh: d.speed_kmh || 0,
          course: d.course || 0
        });
      });
    }

    // 2. Process legacy positions collection, mapping any message-date mirror to its true locationDate
    if (snapPos) {
      snapPos.forEach(docSnap => {
        const d = docSnap.data() as any;
        const pid = normalizePttId(d.transmitter_id || d.platformId || '');
        const lat = Number(d.lat ?? d.latitude);
        const lon = Number(d.lon ?? d.longitude);
        if (!pid || !isValidCoordinate(lat, lon)) return;
        const cKey = \`\${pid}_\${lat.toFixed(4)}_\${lon.toFixed(4)}\`;

        // If this coordinate already has an authoritative locationDate in argos_positions, use it!
        const resolvedDate = d.locationDate || d.gpsLocDate || coordToTrueDate.get(cKey) || d.timestamp;
        const uKey = \`\${pid}_\${resolvedDate}\`;
        if (seenKey.has(uKey)) return; // Skip duplicate message-date echo!
        seenKey.add(uKey);

        data.push({
          id: docSnap.id,
          _collection: 'positions',
          transmitter_id: pid,
          platformId: pid,
          programId: '',
          lat,
          lon,
          lc: d.lc || '',
          locationType: d.locationType || '',
          msgType: '',
          dopplerError: '',
          timestamp: resolvedDate,
          locationDate: resolvedDate,
          satellite: d.satellite || '',
          speed_kmh: d.speed_kmh,
          course: d.course
        });
      });
    }

    data.sort((a, b) => safeParseTimestamp(a.locationDate || a.timestamp) - safeParseTimestamp(b.locationDate || b.timestamp));
    return data;
  } catch (error) {
    console.error('[Firestore] Error loading all positions:', error);
    return [];
  }
};

`;
  fsCode = fsCode.slice(0, loadAllPosStart) + newLoadAllPositions + fsCode.slice(loadAllPosEnd);
}

// Replace getHistoricalPositions so legacy `positions` docs without locationDate never override `argos_positions`
const getHistStart = fsCode.indexOf('export const getHistoricalPositions = async');
const getHistEnd = fsCode.indexOf('/** Save positions in batch, using composite key as document ID */');

if (getHistStart !== -1 && getHistEnd !== -1) {
  const newGetHist = `export const getHistoricalPositions = async (transmitterIds: string[], startDate: Date, endDate: Date) => {
  if (!transmitterIds || transmitterIds.length === 0) {
    return [];
  }

  const startMs = startDate.getTime();
  const endMs   = endDate.getTime();
  const allResults: any[] = [];

  try {
    for (const pttId of transmitterIds) {
      const pidStr = normalizePttId(pttId);
      const idNum = Number(pttId);
      const isNumValid = !isNaN(idNum);

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

      const extractFix = (ds: any, sourceCol: 'argos_positions' | 'positions'): RawFix | null => {
        const d = ds.data();
        const lat = Number(d.lat !== undefined ? d.lat : d.latitude);
        let lon = Number(d.lon !== undefined ? d.lon : d.longitude);
        if (!isValidCoordinate(lat, lon)) return null;
        if (pidStr === '242086' && lon < 0) lon = Math.abs(lon);

        const coordKey = \`\${lat.toFixed(4)},\${lon.toFixed(4)}\`;
        const isGps = d.locationType === 'GPS' || (!d.locationType && (!d.lc || d.lc === 'GPS'));
        const rawDataStr = String(d.rawData || d.raw_data || '').trim().toLowerCase();

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
        } else if (sourceCol === 'positions') {
          // If this coordinate is already in argos_positions, use its canonical locationDate!
          if (canonicalCoordToLocMs.has(coordKey)) {
            locDateMs = canonicalCoordToLocMs.get(coordKey)!;
          } else if (typeof d.timestamp === 'string' && /\\.\\d{3}Z$/.test(d.timestamp) && !d.timestamp.endsWith('.000Z')) {
            // Fractional milliseconds (.761Z, .701Z) on a GPS fix in 'positions' means d.timestamp is an Argos Message Reception timestamp!
            // Ignore it if argos_positions has data for this PTT.
            if (canonicalCoordToLocMs.size > 0) return null;
            locDateMs = safeParseTimestamp(d.timestamp);
          } else {
            locDateMs = safeParseTimestamp(d.timestamp);
          }
        } else {
          const { fix, message } = resolveTimes(d);
          locDateMs = fix ?? (!isGps ? message : safeParseTimestamp(d.timestamp));
        }

        if (locDateMs == null || isNaN(locDateMs) || locDateMs <= 0) return null;

        if (sourceCol === 'argos_positions' && !canonicalCoordToLocMs.has(coordKey)) {
          canonicalCoordToLocMs.set(coordKey, locDateMs);
        }

        const locType: 'GPS' | 'DOPPLER' = isGps ? 'GPS' : 'DOPPLER';
        const locClass = locType === 'GPS' ? null : (d.locationClass || (d.lc !== 'GPS' ? d.lc : null) || null);
        const errRadiusM = locType === 'GPS' ? 0 : (typeof d.errorRadiusM === 'number' ? d.errorRadiusM : (parseFloat(String(d.dopplerError || '0')) || 0));
        const arrivalDate = d.messageDate || d.firstMessageDate || d.receivedAt || d.msgDatetime || null;

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

      // Pass 1: Authoritative argos_positions
      argosSnaps.forEach(snap => {
        if (!snap) return;
        snap.forEach((ds: any) => {
          const rf = extractFix(ds, 'argos_positions');
          if (rf) rawFixesForPtt.push(rf);
        });
      });

      // Pass 2: Legacy positions
      posSnaps.forEach(snap => {
        if (!snap) return;
        snap.forEach((ds: any) => {
          const rf = extractFix(ds, 'positions');
          if (rf) rawFixesForPtt.push(rf);
        });
      });

      const { fixes } = buildFixes(rawFixesForPtt);
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

      transmitterHistoryCache.set(pidStr, { cachedAt: Date.now(), docs: pttDocs });

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
  fsCode = fsCode.slice(0, getHistStart) + newGetHist + fsCode.slice(getHistEnd);
}

fs.writeFileSync(fsPath, fsCode, 'utf8');
console.log('✅ Patched services/firestoreService.ts');
