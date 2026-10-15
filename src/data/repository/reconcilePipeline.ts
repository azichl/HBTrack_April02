import { 
  collection, doc, getDocs, setDoc, writeBatch, serverTimestamp, query, limit, orderBy 
} from 'firebase/firestore';
import { db, auth } from '../../../firebase';
import { Transmitter, Bird, Position } from '../../../types';
import { normalizePttId } from './pttNormalizer';
import { safeParseTimestamp, isValidCoordinate, classifyLocationType } from '../../../utils/formatting';
import { KNOWN_CLS_RAW_LOCATION_DATES, decodeBatteryVoltage } from '../../../services/argosService';
import { requestServerRebuild } from './serverSync';

export interface IngestRunLog {
  runId: string;
  timestamp: string;
  status: 'completed' | 'failed' | 'in_progress';
  triggeredBy: string;
  counts: {
    pttsScanned: number;
    transmittersCreated: number;
    transmittersUpdated: number;
    positionsCreated: number;
    birdsLinked: number;
  };
  errors: string[];
  orphans: {
    argosWithoutTransmitter: string[];
    transmitterWithoutBird: string[];
    birdWithoutTransmitter: string[];
    transmitterWithoutFixes: string[];
  };
}

export interface IntegrityReport {
  timestamp: string;
  totalTransmitters: number;
  totalBirds: number;
  totalArgosPtts: number;
  argosWithoutTransmitter: string[];
  transmitterWithoutBird: string[];
  birdWithoutTransmitter: string[];
  transmitterWithoutFixes: string[];
}

const BATCH_SIZE = 400;

/**
 * Idempotent reconciliation pipeline:
 * argos_positions / positions -> clean transmitters, birds, monitoring summary, positions.
 * Never deletes data. Batches <= 400 ops. Records ingest_runs audit doc.
 */
export async function reconcileFromArgos(opts?: {
  onProgress?: (msg: string) => void;
  triggeredBy?: string;
}): Promise<IngestRunLog> {
  const runId = `run-${Date.now()}`;
  const nowIso = new Date().toISOString();
  const uid = auth.currentUser?.uid || 'system';
  opts?.onProgress?.('Starting Argos reconciliation pipeline...');

  const runLog: IngestRunLog = {
    runId,
    timestamp: nowIso,
    status: 'in_progress',
    triggeredBy: opts?.triggeredBy || auth.currentUser?.email || 'manual',
    counts: {
      pttsScanned: 0,
      transmittersCreated: 0,
      transmittersUpdated: 0,
      positionsCreated: 0,
      birdsLinked: 0,
    },
    errors: [],
    orphans: {
      argosWithoutTransmitter: [],
      transmitterWithoutBird: [],
      birdWithoutTransmitter: [],
      transmitterWithoutFixes: [],
    },
  };

  try {
    // 0. Primary path: Attempt authoritative server-side rebuild via Cloud Function
    try {
      opts?.onProgress?.('Attempting server-side rebuild via Cloud Function...');
      const serverResult = await requestServerRebuild();
      if (serverResult && serverResult.ok) {
        opts?.onProgress?.('Server-side rebuild completed successfully.');
        const latestRun = await getLatestIngestRun();
        if (latestRun) return latestRun;
        return {
          runId: serverResult.runId || runId,
          timestamp: nowIso,
          status: 'completed',
          triggeredBy: opts?.triggeredBy || auth.currentUser?.email || 'server-rebuild',
          counts: {
            pttsScanned: serverResult.classifiedCount,
            transmittersCreated: serverResult.transmittersCreated,
            transmittersUpdated: serverResult.transmittersUpdated,
            positionsCreated: serverResult.classifiedCount,
            birdsLinked: 0,
          },
          errors: [],
          orphans: {
            argosWithoutTransmitter: [],
            transmitterWithoutBird: [],
            birdWithoutTransmitter: [],
            transmitterWithoutFixes: [],
          },
        };
      }
    } catch (serverErr: any) {
      opts?.onProgress?.(`Server function unavailable (${serverErr?.message || 'offline'}), running verified client reconcile...`);
    }

    // 1. Fallback: Load existing transmitters, birds, positions, and argos_positions
    opts?.onProgress?.('Loading database records...');
    const [txSnap, birdsSnap, argosSnap, posSnap] = await Promise.all([
      getDocs(collection(db, 'transmitters')),
      getDocs(collection(db, 'birds')),
      getDocs(collection(db, 'argos_positions')),
      getDocs(collection(db, 'positions')),
    ]);

    // Index transmitters by clean PTT ID
    const transmittersMap = new Map<string, Transmitter>();
    txSnap.forEach((d) => {
      const data = d.data();
      const pid = normalizePttId(data.platform_id || d.id);
      if (pid) {
        transmittersMap.set(pid, {
          ...data,
          id: pid,
          platform_id: pid,
        } as Transmitter);
      }
    });

    // Index birds by id and ring_id
    const birdsList: Bird[] = [];
    const birdByRing = new Map<string, Bird>();
    birdsSnap.forEach((d) => {
      const b = { id: d.id, ...d.data() } as Bird;
      birdsList.push(b);
      const ring = (b.ring_id || '').trim();
      if (ring && ring !== 'NA' && ring !== 'N/A') {
        birdByRing.set(ring, b);
      }
    });

    // Group fixes by clean PTT ID
    const fixesByPtt = new Map<string, any[]>();

    argosSnap.forEach((d) => {
      const data = d.data();
      const pid = normalizePttId(data.platformId || data.platform_id || data.transmitter_id);
      if (!pid || pid === 'Unknown') return;
      if (!fixesByPtt.has(pid)) fixesByPtt.set(pid, []);
      fixesByPtt.get(pid)!.push({ ...data, _source: 'argos_positions', _docId: d.id });
    });

    posSnap.forEach((d) => {
      const data = d.data();
      const pid = normalizePttId(data.transmitter_id || data.platformId || data.platform_id);
      if (!pid || pid === 'Unknown') return;
      if (!fixesByPtt.has(pid)) fixesByPtt.set(pid, []);
      fixesByPtt.get(pid)!.push({ ...data, _source: 'positions', _docId: d.id });
    });

    runLog.counts.pttsScanned = fixesByPtt.size;
    opts?.onProgress?.(`Found ${fixesByPtt.size} distinct PTTs in telemetry data.`);

    const transmittersToUpsert: Transmitter[] = [];
    const positionsToCreate: Position[] = [];
    const birdsToUpdate: { birdId: string; transmitterId: string }[] = [];

    // 2. Process each PTT: extract latest valid fix, battery, and coordinates
    for (const [pid, records] of fixesByPtt.entries()) {
      let maxTs = -Infinity;
      let latestFix: any = null;
      let bestBattery: number | undefined;

      records.forEach((r) => {
        const rawLat = r.lat !== undefined ? r.lat : r.latitude;
        let rawLon = r.lon !== undefined ? r.lon : r.longitude;
        const lat = Number(rawLat);
        let lon = Number(rawLon);
        if (pid === '242086' && !isNaN(lon) && lon < 0) lon = Math.abs(lon);

        const rawDataStr = String(r.rawData || r.raw_data || '').trim().toLowerCase();
        const isGps = r.locationType === 'GPS' || (!r.locationType && (!r.lc || r.lc === 'GPS'));
        const rawTs = (r.locationDate || r.gpsLocDate || r.location?.locationDate || r.dateOfPosition)
          ? (r.locationDate || r.gpsLocDate || r.location?.locationDate || r.dateOfPosition)
          : (isGps && rawDataStr && KNOWN_CLS_RAW_LOCATION_DATES[rawDataStr]
              ? KNOWN_CLS_RAW_LOCATION_DATES[rawDataStr]
              : (r.timestamp || r.date || r.msgDatetime));

        const tsMs = safeParseTimestamp(rawTs);

        if (!isNaN(tsMs) && isValidCoordinate(lat, lon)) {
          if (tsMs > maxTs) {
            maxTs = tsMs;
            latestFix = { ...r, lat, lon, tsMs, iso: new Date(tsMs).toISOString() };
          }
        }

        // Battery extraction
        if (r.rawData) {
          const v = decodeBatteryVoltage(r.rawData);
          if (v !== undefined && (bestBattery === undefined || v > bestBattery)) {
            bestBattery = v;
          }
        } else if (r.battery_voltage) {
          const bv = Number(r.battery_voltage);
          if (!isNaN(bv) && bv > 0 && (bestBattery === undefined || bv > bestBattery)) {
            bestBattery = bv;
          }
        }
      });

      const existingTx = transmittersMap.get(pid);
      let matchedBird = birdsList.find((b) => b.assigned_transmitter_id === pid);
      if (!matchedBird && existingTx?.bird_id) {
        matchedBird = birdsList.find((b) => b.id === existingTx.bird_id);
      }
      if (!matchedBird && existingTx?.assigned_bird_ring) {
        matchedBird = birdByRing.get(existingTx.assigned_bird_ring);
      }

      const latestFixIso = latestFix ? latestFix.iso : (existingTx?.last_fix || nowIso);
      const latestLat = latestFix ? latestFix.lat : existingTx?.lat;
      const latestLon = latestFix ? latestFix.lon : existingTx?.lon;

      if (!existingTx) {
        // Discovered a new transmitter (e.g. 244289)!
        const newTx: Transmitter = {
          id: pid,
          platform_id: pid,
          model: 'Unknown (Auto-detected)',
          status: 'Active',
          derived_status: 'Active',
          bird_id: matchedBird?.id || '',
          deployed: true,
          battery_voltage: bestBattery,
          last_fix: latestFixIso,
          lat: latestLat,
          lon: latestLon,
          latitude: latestLat,
          longitude: latestLon,
          last_latitude: latestLat,
          last_longitude: latestLon,
          duty_cycle: 'Unknown',
          assigned_bird_ring: matchedBird?.ring_id || undefined,
        };
        transmittersToUpsert.push(newTx);
        transmittersMap.set(pid, newTx);
        runLog.counts.transmittersCreated++;
      } else {
        // Transmitter exists: check if latest fix or coordinates need update
        const currLastFixMs = safeParseTimestamp(existingTx.last_fix);
        const shouldUpdate =
          isNaN(currLastFixMs) ||
          maxTs >= currLastFixMs ||
          existingTx.lat !== latestLat ||
          existingTx.lon !== latestLon ||
          (!existingTx.bird_id && matchedBird);

        if (shouldUpdate) {
          const updatedTx: Transmitter = {
            ...existingTx,
            id: pid,
            platform_id: pid,
            last_fix: latestFixIso,
            lat: latestLat,
            lon: latestLon,
            latitude: latestLat,
            longitude: latestLon,
            last_latitude: latestLat,
            last_longitude: latestLon,
            battery_voltage: bestBattery ?? existingTx.battery_voltage,
            bird_id: existingTx.bird_id || matchedBird?.id || '',
            assigned_bird_ring: existingTx.assigned_bird_ring || matchedBird?.ring_id,
            status: existingTx.status || 'Active',
            derived_status: existingTx.derived_status || 'Active',
          };
          transmittersToUpsert.push(updatedTx);
          transmittersMap.set(pid, updatedTx);
          runLog.counts.transmittersUpdated++;
        }
      }

      // If matched bird doesn't have assigned_transmitter_id, link it
      if (matchedBird && matchedBird.assigned_transmitter_id !== pid) {
        birdsToUpdate.push({ birdId: matchedBird.id, transmitterId: pid });
        runLog.counts.birdsLinked++;
      }

      // Ensure latest valid fix is present in positions collection
      if (latestFix) {
        const posDocId = `pos-${pid}-${latestFix.tsMs}`;
        positionsToCreate.push({
          id: posDocId,
          transmitter_id: pid,
          timestamp: latestFix.iso,
          lat: latestFix.lat,
          lon: latestFix.lon,
          lc: latestFix.lc || (latestFix.locationType === 'Doppler' ? '3' : 'GPS'),
          is_kalman: false,
          speed_kmh: Number(latestFix.speed_kmh || latestFix.speed || 0),
          course: Number(latestFix.course || 0),
          satellite: latestFix.satellite || 'GPS',
          locationType: classifyLocationType(latestFix.lc, latestFix.locationType, latestFix.satellite),
          messageDate: latestFix.messageDate,
          locationDate: latestFix.iso,
        });
      }
    }

    // 3. Commit batched writes to Firestore
    opts?.onProgress?.(`Writing ${transmittersToUpsert.length} transmitters to Firestore...`);
    for (let i = 0; i < transmittersToUpsert.length; i += BATCH_SIZE) {
      const batch = writeBatch(db);
      const chunk = transmittersToUpsert.slice(i, i + BATCH_SIZE);
      chunk.forEach((t) => {
        const ref = doc(db, 'transmitters', t.platform_id);
        const payload: Record<string, any> = {
          ...t,
          id: t.platform_id,
          platform_id: t.platform_id,
          updatedAt: serverTimestamp(),
          updatedBy: uid,
        };
        Object.keys(payload).forEach((k) => {
          if (payload[k] === undefined) delete payload[k];
        });
        batch.set(ref, payload, { merge: true });
      });
      try {
        await batch.commit();
      } catch (e: any) {
        const msg = `Batch commit failed for transmitters [${i}..${i + chunk.length}]: ${e.message}`;
        runLog.errors.push(msg);
      }
    }

    if (birdsToUpdate.length > 0) {
      opts?.onProgress?.(`Updating ${birdsToUpdate.length} bird transmitter links...`);
      for (let i = 0; i < birdsToUpdate.length; i += BATCH_SIZE) {
        const batch = writeBatch(db);
        const chunk = birdsToUpdate.slice(i, i + BATCH_SIZE);
        chunk.forEach(({ birdId, transmitterId }) => {
          batch.set(
            doc(db, 'birds', birdId),
            { assigned_transmitter_id: transmitterId, updatedAt: serverTimestamp() },
            { merge: true }
          );
        });
        try {
          await batch.commit();
        } catch (e: any) {
          runLog.errors.push(`Bird link batch failed: ${e.message}`);
        }
      }
    }

    if (positionsToCreate.length > 0) {
      opts?.onProgress?.(`Upserting ${positionsToCreate.length} position records...`);
      for (let i = 0; i < positionsToCreate.length; i += BATCH_SIZE) {
        const batch = writeBatch(db);
        const chunk = positionsToCreate.slice(i, i + BATCH_SIZE);
        chunk.forEach((p) => {
          batch.set(doc(db, 'positions', p.id), { ...p, updatedAt: serverTimestamp() }, { merge: true });
        });
        try {
          await batch.commit();
          runLog.counts.positionsCreated += chunk.length;
        } catch (e: any) {
          runLog.errors.push(`Positions batch failed: ${e.message}`);
        }
      }
    }

    // 4. Compute orphans for Integrity Report
    for (const pid of fixesByPtt.keys()) {
      if (!transmittersMap.has(pid)) {
        runLog.orphans.argosWithoutTransmitter.push(pid);
      }
    }

    for (const [pid, t] of transmittersMap.entries()) {
      if (!t.bird_id) {
        runLog.orphans.transmitterWithoutBird.push(pid);
      }
      if (!fixesByPtt.has(pid) || !t.last_fix) {
        runLog.orphans.transmitterWithoutFixes.push(pid);
      }
    }

    for (const b of birdsList) {
      if (!b.assigned_transmitter_id || !transmittersMap.has(normalizePttId(b.assigned_transmitter_id))) {
        runLog.orphans.birdWithoutTransmitter.push(b.ring_id || b.id);
      }
    }

    runLog.status = runLog.errors.length === 0 ? 'completed' : 'failed';

    // 5. Save ingest_run record to Firestore
    await setDoc(doc(db, 'ingest_runs', runId), runLog);
    opts?.onProgress?.('Reconciliation completed successfully.');
  } catch (err: any) {
    runLog.status = 'failed';
    runLog.errors.push(err.message || String(err));
    try {
      await setDoc(doc(db, 'ingest_runs', runId), runLog);
    } catch {
      // Ignore run-log save error
    }
  }

  return runLog;
}

/**
 * Loads the latest ingest run log from Firestore.
 */
export async function getLatestIngestRun(): Promise<IngestRunLog | null> {
  try {
    const q = query(collection(db, 'ingest_runs'), orderBy('timestamp', 'desc'), limit(1));
    const snap = await getDocs(q);
    if (!snap.empty) {
      return snap.docs[0].data() as IngestRunLog;
    }
  } catch (e) {
    console.warn('[IngestRun] Error loading latest ingest run:', e);
  }
  return null;
}

/**
 * Generates an on-demand integrity report analyzing orphaned records across all tables.
 */
export async function generateIntegrityReport(): Promise<IntegrityReport> {
  const [txSnap, birdsSnap, argosSnap] = await Promise.all([
    getDocs(collection(db, 'transmitters')),
    getDocs(collection(db, 'birds')),
    getDocs(collection(db, 'argos_positions')),
  ]);

  const pttsInArgos = new Set<string>();
  argosSnap.forEach((d) => {
    const pid = normalizePttId(d.data().platformId || d.data().platform_id);
    if (pid) pttsInArgos.add(pid);
  });

  const transmitters = new Map<string, Transmitter>();
  txSnap.forEach((d) => {
    const data = d.data();
    const pid = normalizePttId(data.platform_id || d.id);
    if (pid) transmitters.set(pid, data as Transmitter);
  });

  const birds = new Map<string, Bird>();
  birdsSnap.forEach((d) => {
    birds.set(d.id, d.data() as Bird);
  });

  const argosWithoutTransmitter: string[] = [];
  pttsInArgos.forEach((pid) => {
    if (!transmitters.has(pid)) argosWithoutTransmitter.push(pid);
  });

  const transmitterWithoutBird: string[] = [];
  const transmitterWithoutFixes: string[] = [];
  transmitters.forEach((t, pid) => {
    if (!t.bird_id || !birds.has(t.bird_id)) {
      transmitterWithoutBird.push(pid);
    }
    if (!t.last_fix || !pttsInArgos.has(pid)) {
      transmitterWithoutFixes.push(pid);
    }
  });

  const birdWithoutTransmitter: string[] = [];
  birds.forEach((b, bid) => {
    const assigned = normalizePttId(b.assigned_transmitter_id);
    if (!assigned || !transmitters.has(assigned)) {
      birdWithoutTransmitter.push(b.ring_id && b.ring_id !== 'NA' ? b.ring_id : bid);
    }
  });

  return {
    timestamp: new Date().toISOString(),
    totalTransmitters: transmitters.size,
    totalBirds: birds.size,
    totalArgosPtts: pttsInArgos.size,
    argosWithoutTransmitter,
    transmitterWithoutBird,
    birdWithoutTransmitter,
    transmitterWithoutFixes,
  };
}
