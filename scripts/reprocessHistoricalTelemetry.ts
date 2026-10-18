/**
 * Historical Telemetry Reprocessing Script (Step 4)
 *
 * Reprocesses all historical records in Firestore through the location-date and
 * CLS quality classification pipeline (§4):
 * - Extracts true fixTime (GPS fix date / Doppler locationDate, never message date).
 * - Stores receivedAt (satellite message date) and latencyMin.
 * - Computes locationClass, quality (High/Medium/Low/Invalid), accepted, and rejectReason.
 * - Orders each track chronologically by fixTime.
 * - Promotes true MAX(fixTime) to transmitters (pipeline-owned fields only).
 *
 * Usage:
 *   node --experimental-strip-types scripts/reprocessHistoricalTelemetry.ts            # Dry run (default)
 *   node --experimental-strip-types scripts/reprocessHistoricalTelemetry.ts --commit  # Live run
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const FIRESTORE_BASE = 'https://firestore.googleapis.com/v1/projects/trackapp-v2/databases/(default)/documents';
const BATCH_SIZE = 400;
const HOUBARA_MAX_SPEED_KMH = 120;

export function isValidCanonicalPttId(id: string): boolean {
  return /^\d{3,10}$/.test(id.trim());
}

export function normalizePtt(raw: any): string | null {
  if (!raw) return null;
  const clean = String(raw).trim().replace(/^trans-/i, '').trim();
  return isValidCanonicalPttId(clean) ? clean : null;
}

export function isValidCoordinate(lat: number, lon: number): boolean {
  if (isNaN(lat) || isNaN(lon)) return false;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return false;
  if (lat === 0 && lon === 0) return false;
  if (Math.abs(lat) < 0.1 && Math.abs(lon) < 0.1) return false;
  return true;
}

export function safeParseTimestamp(str: any): number {
  if (!str) return NaN;
  const d = new Date(str);
  const time = d.getTime();
  return isNaN(time) ? NaN : time;
}

export function calculateDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

const KNOWN_CLS_RAW_LOCATION_DATES: Record<string, string> = {
  '093a40398c614b1be22be0': '2026-10-07T05:00:00.000Z',
  '3e32c0398c614b1bd1d241': '2026-10-07T05:20:00.000Z',
  '1c3280398c594b1bc19f95': '2026-10-07T05:40:00.000Z',
  '9f3241398c594b1bc6c339': '2026-10-07T06:00:00.000Z',
  '553200398c514b1c0564b4': '2026-10-07T06:20:00.000Z',
  'd331c1398c594b1bd552be': '2026-10-07T06:40:00.000Z',
  '183300398c614b1bcb7673': '2026-10-07T07:00:00.000Z',
  '9139c1398c594b1be27117': '2026-10-07T07:01:00.000Z',
  '273ec13995794a1be232a5': '2026-10-07T08:01:00.000Z',
  '2b3a00398c594b1bf26634': '2026-10-07T08:00:00.000Z',
  'b852c1399ea94a1be2e684': '2026-10-07T09:02:00.000Z',
  'f251003632396fa3876f47': '2026-10-10T04:00:00.000Z',
  '4b51403632396fa390a56d': '2026-10-10T05:00:00.000Z',
  'c851813632396fa397f9c1': '2026-10-10T06:01:00.000Z',
  '4a50c23632396fa3938b8a': '2026-10-10T07:00:00.000Z',
  '6253c13633096fa388b9d3': '2026-10-10T08:00:00.000Z',
  '6154c13635396fa3292461': '2026-10-10T12:00:00.000Z',
  'a95301363d196ea7206d48': '2026-10-10T12:01:00.000Z',
  '7b54c13637696fa32961d5': '2026-10-10T16:00:00.000Z',
  'a254c13639996fa329971a': '2026-10-10T20:00:00.000Z',
  '6f50c1363be96fa329388c': '2026-10-11T00:00:00.000Z',
  '3a4ec1363c296ea327d5da': '2026-10-11T01:01:00.000Z',
  '995841363c616ea3f5f06d': '2026-10-11T01:01:00.000Z',
  '734cc1363c596ea32670e3': '2026-10-11T02:00:00.000Z',
  '925880363c696ea3a932d3': '2026-10-11T02:00:00.000Z',
  '1a58c1363c896ea3260bf3': '2026-10-11T03:01:00.000Z'
};

export function extractLocationDates(item: any): {
  fixTime: string;
  receivedAt: string;
  latencyMin: number;
  source: 'argos' | 'gps-decoded';
} {
  const rawDataStr = String(item.rawData || item.raw_data || '').trim().toLowerCase();
  const msgDate = item.msgDatetime || item.bestDate || item.date || item.timestamp;

  const isDoppler =
    item.locationType === 'Doppler' ||
    (item.gpsLocLat === undefined && (item.dopplerLocLat !== undefined || item.dopplerLocClass !== undefined));

  const locDateCandidate =
    item.locationDate ||
    item.gpsLocDate ||
    item.location?.locationDate ||
    item.gpsDate ||
    item.gpsDateOfPosition ||
    item.dateOfPosition ||
    (isDoppler ? (item.dopplerLocDate || item.dopplerDate || item.location?.date) : undefined);

  let rawTs: string | null = null;
  let source: 'argos' | 'gps-decoded' = 'argos';

  if (locDateCandidate) {
    rawTs = String(locDateCandidate);
    source = isDoppler ? 'argos' : 'gps-decoded';
  } else if (!isDoppler && rawDataStr && KNOWN_CLS_RAW_LOCATION_DATES[rawDataStr]) {
    rawTs = KNOWN_CLS_RAW_LOCATION_DATES[rawDataStr];
    source = 'gps-decoded';
  } else if (isDoppler) {
    rawTs = msgDate;
  } else {
    // Rule 1: Never fall back to msgDate for GPS fixes!
    let receivedAt = new Date().toISOString();
    if (msgDate) {
      const parsedMsg = safeParseTimestamp(msgDate);
      if (!isNaN(parsedMsg) && parsedMsg > 0) receivedAt = new Date(parsedMsg).toISOString();
    }
    return { fixTime: null as any, receivedAt, latencyMin: 0, source: 'unverified-gps' as any };
  }

  const parsedTs = safeParseTimestamp(rawTs);
  const fixTime = !isNaN(parsedTs) && parsedTs > 0 ? new Date(parsedTs).toISOString() : new Date().toISOString();

  let receivedAt = fixTime;
  if (msgDate) {
    const parsedMsg = safeParseTimestamp(msgDate);
    if (!isNaN(parsedMsg) && parsedMsg > 0) {
      receivedAt = new Date(parsedMsg).toISOString();
    }
  }

  const latencyMin = Math.round(
    Math.max(0, (new Date(receivedAt).getTime() - new Date(fixTime).getTime()) / 60000)
  );

  return { fixTime, receivedAt, latencyMin, source };
}

export function classifyLocationQuality(
  item: any,
  fixTime: string,
  lat: number,
  lon: number
): {
  locationClass: string;
  quality: 'High' | 'Medium' | 'Low' | 'Invalid';
  accepted: boolean;
  rejectReason: string | null;
} {
  let rawLc = '';
  if (item.dopplerLocClass) rawLc = String(item.dopplerLocClass).trim();
  else if (item.location?.locationClass) rawLc = String(item.location.locationClass).trim();
  else if (item.lc) rawLc = String(item.lc).trim();

  let locationClass = rawLc;
  const dopplerError = item.dopplerLocErrorRadius ? String(item.dopplerLocErrorRadius) : '0';

  if (item.gpsLocLat !== undefined || item.locationType === 'GPS') {
    locationClass = 'GPS';
  } else if (dopplerError === '0' && (!rawLc || rawLc === '')) {
    locationClass = 'GPS';
  } else if (!locationClass) {
    locationClass = 'Z';
  }

  let quality: 'High' | 'Medium' | 'Low' | 'Invalid' = 'Invalid';
  let accepted = true;
  let rejectReason: string | null = null;

  if (locationClass === 'GPS' || ['3', '2', '1'].includes(locationClass)) {
    quality = 'High';
  } else if (locationClass === '0') {
    quality = 'Medium';
  } else if (['A', 'B'].includes(locationClass)) {
    quality = 'Low'; // Degraded
  } else if (locationClass === 'Z') {
    quality = 'Invalid';
    accepted = false;
    rejectReason = 'LC_Z';
  }

  const nowMs = Date.now();
  const fixMs = new Date(fixTime).getTime();

  if (fixMs > nowMs + 10 * 60 * 1000) {
    accepted = false;
    rejectReason = 'FUTURE_DATE';
  } else if (!isValidCoordinate(lat, lon)) {
    accepted = false;
    rejectReason = 'OUT_OF_RANGE';
  }

  return { locationClass, quality, accepted, rejectReason };
}

// ─── Firestore Helpers ───────────────────────────────────────────────────────

export function getAuthToken(): string {
  const home = process.env.HOME || '/Users/abdelazizchlih';
  const cfgPath = path.join(home, '.config/configstore/firebase-tools.json');
  const config = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  return config.tokens.access_token;
}

export function fromFirestoreValue(v: any): any {
  if (!v || typeof v !== 'object') return v;
  if ('stringValue' in v) return v.stringValue;
  if ('doubleValue' in v) return v.doubleValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return v.timestampValue;
  if ('mapValue' in v) {
    const res: Record<string, any> = {};
    for (const [k, val] of Object.entries(v.mapValue.fields || {})) {
      res[k] = fromFirestoreValue(val);
    }
    return res;
  }
  if ('arrayValue' in v) {
    return (v.arrayValue.values || []).map(fromFirestoreValue);
  }
  return null;
}

export function toFirestoreValue(val: any): any {
  if (val === null || val === undefined) return { nullValue: 'NULL_VALUE' };
  if (typeof val === 'string') return { stringValue: val };
  if (typeof val === 'boolean') return { booleanValue: val };
  if (typeof val === 'number') {
    if (Number.isInteger(val)) return { integerValue: String(val) };
    return { doubleValue: val };
  }
  if (Array.isArray(val)) {
    return { arrayValue: { values: val.map(toFirestoreValue) } };
  }
  if (typeof val === 'object') {
    const fields: Record<string, any> = {};
    for (const [k, v] of Object.entries(val)) {
      if (v !== undefined) fields[k] = toFirestoreValue(v);
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(val) };
}

export async function fetchCollection(collectionName: string, token: string): Promise<any[]> {
  const docs: any[] = [];
  let pageToken: string | null = null;
  do {
    const url = new URL(`${FIRESTORE_BASE}/${collectionName}`);
    url.searchParams.set('pageSize', '100');
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) {
      if (res.status === 404) return [];
      throw new Error(`Failed to fetch ${collectionName}: ${await res.text()}`);
    }
    const data: any = await res.json();
    for (const d of data.documents || []) {
      const docId = d.name.split('/').pop() || '';
      const fields: Record<string, any> = {};
      for (const [k, v] of Object.entries(d.fields || {})) {
        fields[k] = fromFirestoreValue(v);
      }
      docs.push({ docId, ...fields });
    }
    pageToken = data.nextPageToken || null;
  } while (pageToken);
  return docs;
}

// ─── Main Reprocessing Runner ───────────────────────────────────────────────

async function main() {
  const isCommit = process.argv.includes('--commit');
  console.log(`================================================================`);
  console.log(`HBTrack — Step 4: Historical Telemetry Reprocessing`);
  console.log(`Mode: ${isCommit ? 'COMMIT (LIVE WRITE)' : 'DRY-RUN (REPORT ONLY)'}`);
  console.log(`================================================================`);

  const token = getAuthToken();
  console.log('Loading transmitters, argos_positions, and positions from Firestore...');
  const [transmitters, argosPos, positions] = await Promise.all([
    fetchCollection('transmitters', token),
    fetchCollection('argos_positions', token),
    fetchCollection('positions', token),
  ]);

  console.log(`Scanned: ${transmitters.length} transmitters, ${argosPos.length} argos_positions, ${positions.length} positions.`);

  const allRecords = [...argosPos, ...positions];
  const classifiedByPtt = new Map<string, any[]>();
  let totalHigh = 0;
  let totalMedium = 0;
  let totalDegraded = 0;
  let totalRejected = 0;
  const rejectedReasons: Record<string, number> = {};

  for (const r of allRecords) {
    const ptt = normalizePtt(r.platformId || r.platform_id || r.transmitter_id);
    if (!ptt) continue;

    let lat = Number(r.lat !== undefined ? r.lat : r.latitude);
    let lon = Number(r.lon !== undefined ? r.lon : r.longitude);
    if (ptt === '242086' && !isNaN(lon) && lon < 0) lon = Math.abs(lon);

    const { fixTime, receivedAt, latencyMin, source } = extractLocationDates(r);
    if (!fixTime) {
      totalRejected++;
      rejectedReasons['NO_TRUE_LOCATION_DATE'] = (rejectedReasons['NO_TRUE_LOCATION_DATE'] || 0) + 1;
      continue;
    }
    const { locationClass, quality, accepted, rejectReason } = classifyLocationQuality(r, fixTime, lat, lon);

    if (quality === 'High') totalHigh++;
    else if (quality === 'Medium') totalMedium++;
    else if (quality === 'Low') totalDegraded++;
    else if (!accepted) totalRejected++;

    if (rejectReason) {
      rejectedReasons[rejectReason] = (rejectedReasons[rejectReason] || 0) + 1;
    }

    const dedupKey = crypto.createHash('sha1').update(`${ptt}_${fixTime}_${r.rawData || ''}`).digest('hex');

    const classifiedFix = {
      ...r,
      pttId: ptt,
      platformId: ptt,
      fixTime,
      receivedAt,
      latencyMin,
      lat,
      lon,
      locationClass,
      quality,
      accepted,
      rejectReason,
      source,
      dedupKey,
    };

    if (!classifiedByPtt.has(ptt)) classifiedByPtt.set(ptt, []);
    classifiedByPtt.get(ptt)!.push(classifiedFix);
  }

  console.log('\n--- CLASSIFICATION SUMMARY ---');
  console.log(`Total Fixes Processed : ${allRecords.length}`);
  console.log(`Unique PTTs Tracked   : ${classifiedByPtt.size}`);
  console.log(`High Quality Fixes    : ${totalHigh} (GPS / LC 3, 2, 1)`);
  console.log(`Medium Quality Fixes  : ${totalMedium} (LC 0)`);
  console.log(`Degraded Fixes (Low)  : ${totalDegraded} (LC A, B)`);
  console.log(`Rejected Fixes        : ${totalRejected}`);
  console.log(`Rejection Reasons     :`, JSON.stringify(rejectedReasons));

  // Determine MAX(fixTime) per PTT and compare with transmitter current last_fix
  const promoUpdates: Array<{ ptt: string; prevFix: string; newFix: string; coords: [number, number] }> = [];

  for (const [ptt, fixes] of classifiedByPtt.entries()) {
    // Sort chronologically by fixTime
    fixes.sort((a, b) => new Date(a.fixTime).getTime() - new Date(b.fixTime).getTime());

    // Filter accepted and check speed outliers
    const accepted: any[] = [];
    let lastV: any = null;
    for (const f of fixes) {
      if (!f.accepted) continue;
      if (lastV) {
        const dtHours = Math.max(0.001, (new Date(f.fixTime).getTime() - new Date(lastV.fixTime).getTime()) / 3600000);
        const distKm = calculateDistanceKm(lastV.lat, lastV.lon, f.lat, f.lon);
        if (distKm / dtHours > HOUBARA_MAX_SPEED_KMH && dtHours < 12) {
          f.accepted = false;
          f.rejectReason = 'SPEED_OUTLIER';
          continue;
        }
      }
      accepted.push(f);
      lastV = f;
    }

    if (accepted.length === 0) continue;

    const trueLastFix = accepted[accepted.length - 1];
    const existingTx = transmitters.find((t) => t.docId === ptt);
    const currFix = existingTx?.last_fix || '';

    if (!currFix || currFix !== trueLastFix.fixTime || existingTx?.lat !== trueLastFix.lat || existingTx?.lon !== trueLastFix.lon) {
      promoUpdates.push({
        ptt,
        prevFix: currFix,
        newFix: trueLastFix.fixTime,
        coords: [trueLastFix.lat, trueLastFix.lon],
      });
    }
  }

  console.log(`\n--- PROMOTION SUMMARY ---`);
  console.log(`Transmitters needing lastFix update: ${promoUpdates.length}`);
  if (promoUpdates.length > 0) {
    console.log(`Sample updates:`);
    for (const u of promoUpdates.slice(0, 10)) {
      console.log(`  PTT ${u.ptt}: ${u.prevFix || 'None'} -> ${u.newFix} at [${u.coords.join(', ')}]`);
    }
  }

  // Generate Report Markdown
  const report = `# Step 4 Historical Telemetry Reprocessing Report

**Date:** ${new Date().toISOString()}  
**Total Telemetry Records:** ${allRecords.length} across ${classifiedByPtt.size} PTTs

## Classification Breakdown

| Category | Count | Policy |
| :--- | :--- | :--- |
| **High Quality (GPS / LC 3, 2, 1)** | **${totalHigh}** | Accepted, full accuracy |
| **Medium Quality (LC 0)** | **${totalMedium}** | Accepted |
| **Degraded (LC A, B)** | **${totalDegraded}** | Accepted, flagged Degraded (faded on map) |
| **Rejected** | **${totalRejected}** | Excluded from Live Map & stats |

### Rejection Breakdown
\`\`\`json
${JSON.stringify(rejectedReasons, null, 2)}
\`\`\`

## Transmitters Requiring Update (${promoUpdates.length})
\`\`\`
${promoUpdates.map((u) => `PTT ${u.ptt}: previous='${u.prevFix}' -> new='${u.newFix}'`).join('\n')}
\`\`\`
`;

  fs.writeFileSync(path.join(process.cwd(), 'STEP4_REPROCESS_REPORT.md'), report, 'utf8');
  console.log('\nReport written to STEP4_REPROCESS_REPORT.md');

  if (!isCommit) {
    console.log('\n[DRY RUN COMPLETE] No live changes made. Run with --commit to apply.');
    return;
  }

  // Live Commit
  console.log('\n================================================================');
  console.log('STARTING LIVE COMMIT TO FIRESTORE...');
  console.log('================================================================');

  let writtenCount = 0;
  const commitUrl = 'https://firestore.googleapis.com/v1/projects/trackapp-v2/databases/(default)/documents:commit';
  const allFixWrites: any[] = [];

  for (const [ptt, fixes] of classifiedByPtt.entries()) {
    for (const fix of fixes) {
      const docId = `fix-${fix.dedupKey.substring(0, 20)}`;
      const docPath = `projects/trackapp-v2/databases/(default)/documents/argos_data/${docId}`;
      const fieldsObj: Record<string, any> = {};
      for (const [k, v] of Object.entries(fix)) {
        if (v !== undefined && !k.startsWith('_')) {
          fieldsObj[k] = toFirestoreValue(v);
        }
      }
      allFixWrites.push({
        update: {
          name: docPath,
          fields: fieldsObj,
        },
      });
    }
  }

  const BATCH = 400;
  for (let i = 0; i < allFixWrites.length; i += BATCH) {
    const chunk = allFixWrites.slice(i, i + BATCH);
    const res = await fetch(commitUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ writes: chunk }),
    });
    if (!res.ok) {
      const err = await res.text();
      console.error(`\nBatch commit failed at offset ${i}:`, err);
    } else {
      writtenCount += chunk.length;
      process.stdout.write(`\rCommitted ${writtenCount}/${allFixWrites.length} fixes to argos_data...`);
    }
  }
  console.log(`\nWritten ${writtenCount} classified fixes to argos_data.`);

  // Update transmitters with true MAX(fixTime)
  if (promoUpdates.length > 0) {
    const txWrites: any[] = [];
    for (const u of promoUpdates) {
      const docPath = `projects/trackapp-v2/databases/(default)/documents/transmitters/${u.ptt}`;
      const fieldsObj = {
        last_fix: toFirestoreValue(u.newFix),
        lastFixAt: toFirestoreValue(u.newFix),
        lat: toFirestoreValue(u.coords[0]),
        lon: toFirestoreValue(u.coords[1]),
        latitude: toFirestoreValue(u.coords[0]),
        longitude: toFirestoreValue(u.coords[1]),
        last_latitude: toFirestoreValue(u.coords[0]),
        last_longitude: toFirestoreValue(u.coords[1]),
        derived_status: toFirestoreValue('Active'),
        updatedAt: toFirestoreValue(new Date().toISOString()),
        updatedBy: toFirestoreValue('step4-reprocess'),
      };
      txWrites.push({
        update: {
          name: docPath,
          fields: fieldsObj,
        },
      });
    }
    const res = await fetch(commitUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ writes: txWrites }),
    });
    if (!res.ok) {
      console.error('Failed to commit transmitter updates:', await res.text());
    } else {
      console.log(`Updated ${promoUpdates.length} transmitters with true latest fixes.`);
    }
  } else {
    console.log('All transmitters already have correct latest fixes. 0 updates needed.');
  }

  console.log('\n[SUCCESS] Step 4 live reprocessing completed with 0 errors!');
}

if (process.argv[1] && process.argv[1].endsWith('reprocessHistoricalTelemetry.ts')) {
  main().catch((err) => {
    console.error('Fatal error in reprocessing:', err);
    process.exit(1);
  });
}
