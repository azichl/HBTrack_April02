import { 
  collection, doc, getDoc, setDoc, getDocs, onSnapshot, query, deleteDoc, 
  writeBatch, where, orderBy, limit, startAfter, getCountFromServer,
  DocumentSnapshot, addDoc, updateDoc, Timestamp, serverTimestamp
} from 'firebase/firestore';
import { db } from '../firebase';
import { safeParseTimestamp, getYearMonthKey, getCurrentYearMonthKey, classifyLocationType, isHighQualityFix, isValidCoordinate, normalizePttId, makeDeterministicFixDocId } from '../utils/formatting';
import { buildFixes, lastFix, type RawFix, type Fix } from '../utils/positionsEngine';
import { ArgosMessage, StatusHistoryRecord, Transmitter, Position } from '../types';
import { KNOWN_CLS_RAW_LOCATION_DATES, decodeBatteryVoltage } from './argosService';
import { trackedGetDocs, trackedGetDoc, trackedOnSnapshot, trackedOnDocSnapshot } from '../src/perf/firestoreTracked';
import { resolveTimes, parseUtc } from '../src/features/track-order/fixTime';


// ─── System Ingestion Metadata ────────────────────────────────────────────────

/** Saves or updates last data update / ingestion timestamp in Firestore */
export const saveLastIngestTime = async (timestampIso?: string): Promise<string> => {
  const ts = timestampIso || new Date().toISOString();
  try {
    await saveDocument('system_status', 'ingestion', {
      id: 'ingestion',
      last_ingest_time: ts,
      updated_at: ts
    });
  } catch (e) {
    console.warn('[Firestore] Error saving last_ingest_time:', e);
  }
  return ts;
};

/** Loads last data update / ingestion timestamp from Firestore */
export const loadLastIngestTime = async (): Promise<string | null> => {
  try {
    const docSnap = await trackedGetDoc('system_status (ingestion)', doc(db, 'system_status', 'ingestion'));
    if (docSnap.exists()) {
      return docSnap.data().last_ingest_time || null;
    }
  } catch (e) {
    console.warn('[Firestore] Error loading last_ingest_time:', e);
  }
  return null;
};

/** Real-time listener for last data update / ingestion timestamp */
export const subscribeToLastIngestTime = (
  callback: (timestampIso: string | null) => void
): (() => void) => {
  const docRef = doc(db, 'system_status', 'ingestion');
  return trackedOnDocSnapshot('system_status (listener)', docRef, (snapshot) => {
    if (snapshot.exists()) {
      const data = snapshot.data();
      callback(data.last_ingest_time || null);
    } else {
      callback(null);
    }
  }, (error) => {
    console.warn('[Firestore] Error subscribing to last_ingest_time:', error);
  });
};


// ─── Single Document Operations ───────────────────────────────────────────────

/** Saves or updates a document (merge mode) */
export const saveDocument = async (collectionName: string, id: string, data: any) => {
  try {
    const cleanData = JSON.parse(JSON.stringify(data));
    await setDoc(doc(db, collectionName, id), cleanData, { merge: true });
  } catch (error) {
    console.error(`[Firestore] Error saving to ${collectionName}/${id}:`, error);
    throw error;
  }
};

/** Deletes a document */
export const deleteDocument = async (collectionName: string, id: string) => {
  try {
    await deleteDoc(doc(db, collectionName, id));
  } catch (error) {
    console.error(`[Firestore] Error deleting ${collectionName}/${id}:`, error);
    throw error;
  }
};

/**
 * Deletes ALL documents in a collection in batches of 400.
 * Returns the total number of deleted documents.
 */
export const deleteCollection = async (
  collectionName: string,
  onProgress?: (deleted: number) => void
): Promise<number> => {
  const BATCH_LIMIT = 400;
  let totalDeleted = 0;
  let hasMore = true;

  while (hasMore) {
    const q = query(collection(db, collectionName), limit(BATCH_LIMIT));
    const snapshot = await getDocs(q);
    if (snapshot.empty) { hasMore = false; break; }

    const batch = writeBatch(db);
    snapshot.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();
    totalDeleted += snapshot.docs.length;
    onProgress?.(totalDeleted);

    if (snapshot.docs.length < BATCH_LIMIT) hasMore = false;
  }

  console.log(`[Firestore] Deleted ${totalDeleted} docs from ${collectionName}`);
  return totalDeleted;
};


// ─── Batch Operations ─────────────────────────────────────────────────────────

/** Batch write up to 500 documents at a time */
export const batchWriteDocuments = async (collectionName: string, documents: Array<{ id: string; data: any }>) => {
  const BATCH_LIMIT = 400;
  let written = 0;

  for (let i = 0; i < documents.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db);
    const chunk = documents.slice(i, i + BATCH_LIMIT);
    
    chunk.forEach(({ id, data }) => {
      const cleanData = JSON.parse(JSON.stringify(data));
      const ref = doc(db, collectionName, id);
      batch.set(ref, cleanData, { merge: true });
    });

    await batch.commit();
    written += chunk.length;
  }

  console.log(`[Firestore] Batch wrote ${written} docs to ${collectionName}`);
  return written;
};

/** Batch delete up to 400 documents at a time */
export const batchDeleteDocuments = async (collectionName: string, documentIds: string[]) => {
  const BATCH_LIMIT = 400;
  let deleted = 0;

  for (let i = 0; i < documentIds.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db);
    const chunk = documentIds.slice(i, i + BATCH_LIMIT);
    
    chunk.forEach(id => {
      const ref = doc(db, collectionName, id);
      batch.delete(ref);
    });

    await batch.commit();
    deleted += chunk.length;
  }

  console.log(`[Firestore] Batch deleted ${deleted} docs from ${collectionName}`);
  return deleted;
};

// ─── Collection Loading ───────────────────────────────────────────────────────

export const loadCollection = async <T>(collectionName: string): Promise<T[]> => {
  try {
    const snapshot = await trackedGetDocs(collectionName, collection(db, collectionName));
    const data: T[] = [];
    snapshot.forEach((doc) => {
      data.push({ id: doc.id, ...doc.data() } as unknown as T);
    });
    console.log(`[Firestore] Loaded ${data.length} docs from ${collectionName}`);
    return data;
  } catch (error) {
    console.error(`[Firestore] Error loading ${collectionName}:`, error);
    return [];
  }
};

/**
 * Load only RECENT alerts: active (unresolved) + resolved within last 7 days.
 * This avoids reading 900+ archived alert documents on every refresh.
 */
export const loadRecentAlerts = async <T>(): Promise<T[]> => {
  try {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const cutoffISO = sevenDaysAgo.toISOString();

    // Query 1: All active (unresolved) alerts
    const activeQuery = query(
      collection(db, 'alerts'),
      where('status', '!=', 'resolved')
    );

    // Query 2: Recently resolved alerts (last 7 days only)
    const recentResolvedQuery = query(
      collection(db, 'alerts'),
      where('status', '==', 'resolved'),
      where('timestamp', '>=', cutoffISO),
      orderBy('timestamp', 'desc'),
      limit(200)
    );

    const [activeSnap, recentSnap] = await Promise.all([
      trackedGetDocs('alerts (active)', activeQuery),
      trackedGetDocs('alerts (recent resolved)', recentResolvedQuery)
    ]);

    const data: T[] = [];
    const seenIds = new Set<string>();

    activeSnap.forEach((doc) => {
      if (!seenIds.has(doc.id)) {
        seenIds.add(doc.id);
        data.push({ id: doc.id, ...doc.data() } as unknown as T);
      }
    });

    recentSnap.forEach((doc) => {
      if (!seenIds.has(doc.id)) {
        seenIds.add(doc.id);
        data.push({ id: doc.id, ...doc.data() } as unknown as T);
      }
    });

    console.log(`[Firestore] Loaded ${data.length} recent alerts (${activeSnap.size} active + ${recentSnap.size} recent resolved)`);
    return data;
  } catch (error) {
    console.error(`[Firestore] Error loading recent alerts:`, error);
    // Fallback: load all alerts if the optimized query fails (e.g., missing index)
    console.warn('[Firestore] Falling back to loading all alerts...');
    return loadCollection<T>('alerts');
  }
};

// ─── Real-Time Listeners ──────────────────────────────────────────────────────

export const subscribeToCollection = <T>(
  collectionName: string, 
  callback: (data: T[]) => void
): (() => void) => {
  const q = query(collection(db, collectionName));
  const unsubscribe = trackedOnSnapshot(`collection (listen ${collectionName})`, q, (querySnapshot) => {
    const data: T[] = [];
    querySnapshot.forEach((doc) => {
      data.push({ id: doc.id, ...doc.data() } as unknown as T);
    });
    callback(data);
  }, (error) => {
    console.error(`[Firestore] Subscription error for ${collectionName}:`, error);
  });
  return unsubscribe;
};

// ─── Optimized Position Queries ────────────────────────────────────────────────

const safeParseDate = (ts: any): number => {
    return safeParseTimestamp(ts);
};

export const loadLatestPositionsPerTransmitter = async (transmitterIds: (string | number)[]) => {
  try {
    if (!transmitterIds || transmitterIds.length === 0) return [];

    // Fast-path: Check if either positions or argos_positions have documents
    const [checkPos, checkArgos] = await Promise.all([
      trackedGetDocs('check positions (limit 1)', query(collection(db, 'positions'), limit(1))),
      trackedGetDocs('check argos_positions (limit 1)', query(collection(db, 'argos_positions'), limit(1)))
    ]);

    if (checkPos.empty && checkArgos.empty) {
      console.log('[Firestore] positions & argos_positions are empty, skipping queries');
      return [];
    }

    const promises: Promise<any>[] = [];
    
    transmitterIds.forEach(rawId => {
      const idStr = String(rawId);
      const idNum = Number(rawId);
      const isNumValid = !isNaN(idNum);

      const fetchDocs = (colName: string, fieldName: string, val: string | number) => {
        return trackedGetDocs(`latest ${colName} (${val})`, query(
          collection(db, colName),
          where(fieldName, '==', val),
          orderBy('timestamp', 'desc'),
          limit(10)
        )).then(snap => snap.docs.map(d => ({ docId: d.id, colName, ...d.data() })))
        .catch(() => []);
      };


      const p1 = fetchDocs('positions', 'transmitter_id', idStr);
      const p2 = isNumValid && idNum !== Number(idStr) ? fetchDocs('positions', 'transmitter_id', idNum) : Promise.resolve([]);
      const p3 = fetchDocs('argos_positions', 'platformId', idStr);
      const p4 = isNumValid && idNum !== Number(idStr) ? fetchDocs('argos_positions', 'platformId', idNum) : Promise.resolve([]);

      promises.push(Promise.all([p1, p2, p3, p4]).then(results => {
        const combinedRaw = results.flat();
        if (combinedRaw.length === 0) return null;

        const normalized = combinedRaw.map((d: any) => {
          const rawLat = d.lat !== undefined ? d.lat : d.latitude;
          const parsedLat = Number(rawLat);
          let rawLon = d.lon !== undefined ? d.lon : d.longitude;
          let numLon = Number(rawLon);
          if (idStr === '242086' && !isNaN(numLon) && numLon < 0) {
            numLon = Math.abs(numLon);
          }

          const isGps = d.locationType === 'GPS' || (!d.locationType && (!d.lc || d.lc === 'GPS'));
          const rawDataStr = String(d.rawData || d.raw_data || '').trim().toLowerCase();
          let trueTs = (d.locationDate || d.gpsLocDate || d.location?.locationDate || d.dateOfPosition)
            ? (d.locationDate || d.gpsLocDate || d.location?.locationDate || d.dateOfPosition)
            : (isGps && rawDataStr && KNOWN_CLS_RAW_LOCATION_DATES[rawDataStr]
                ? KNOWN_CLS_RAW_LOCATION_DATES[rawDataStr]
                : (d.timestamp || d.date || d.msgDatetime));

          if (!trueTs) {
            trueTs = d.timestamp || d.date || d.msgDatetime || new Date().toISOString();
          }

          let finalTs = String(trueTs);

          return {
            id: d.docId || `pos-${d.id || Date.now()}`,
            transmitter_id: idStr,
            timestamp: finalTs,
            lat: parsedLat,
            lon: numLon,
            lc: d.lc || (d.locationType === 'Doppler' ? '3' : 'GPS'),
            is_kalman: false,
            speed_kmh: Number(d.speed_kmh || d.speed || 0),
            course: Number(d.course || 0),
            satellite: d.satellite || 'GPS',
            locationType: d.locationType || 'GPS'
          };
        }).filter(item => {
          return isValidCoordinate(item.lat, item.lon);
        });

        if (normalized.length === 0) return null;

        normalized.sort((a, b) => {
          const tsA = safeParseDate(a.timestamp);
          const tsB = safeParseDate(b.timestamp);
          return (isNaN(tsB) ? 0 : tsB) - (isNaN(tsA) ? 0 : tsA);
        });

        return normalized[0];
      }));
    });

    const results = await Promise.all(promises);
    const validPositions = results.filter(p => p !== null);
    
    console.log(`[Firestore] Loaded ${validPositions.length} latest positions (from positions + argos_positions) for ${transmitterIds.length} transmitters`);
    return validPositions;
  } catch (error) {
    console.error(`[Firestore] Error loading latest positions per transmitter:`, error);
    return [];
  }
};

export const loadLatestArgosPositionsPerTransmitter = async (transmitterIds: string[]) => {
  try {
    const promises: Promise<any>[] = [];
    
    transmitterIds.forEach(id => {
      promises.push(
        getDocs(query(
          collection(db, 'argos_positions'),
          where('platformId', '==', id),
          orderBy('timestamp', 'desc'),
          limit(2)
        )).then(snap => {
          if (snap.empty) return [];
          return snap.docs.map(d => ({ id: d.id, ...d.data() }));
        })
      );
    });

    const results = await Promise.all(promises);
    const validPositions = results.flat();
    
    console.log(`[Firestore] Loaded ${validPositions.length} latest argos_positions for ${transmitterIds.length} transmitters`);
    return validPositions;
  } catch (error) {
    console.error(`[Firestore] Error loading latest argos_positions per transmitter:`, error);
    return [];
  }
};

export const loadRecentPositions = async (days: number = 7) => {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    const cutoffISO = cutoffDate.toISOString();

    const q = query(
      collection(db, 'positions'),
      where('timestamp', '>=', cutoffISO)
    );
    const snapshot = await getDocs(q);
    const data: any[] = [];
    snapshot.forEach((doc) => {
      data.push({ id: doc.id, ...doc.data() });
    });
    console.log(`[Firestore] Loaded ${data.length} recent positions (last ${days} days)`);
    return data;
  } catch (error) {
    console.error(`[Firestore] Error loading recent positions:`, error);
    return [];
  }
};

export const subscribeToRecentPositions = (days: number, callback: (data: any[]) => void) => {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  const cutoffISO = cutoffDate.toISOString();

  const q = query(
    collection(db, 'positions'),
    where('timestamp', '>=', cutoffISO)
  );

  const unsubscribe = trackedOnSnapshot('positions (listen recent 7d)', q, (querySnapshot) => {
    const data: any[] = [];
    querySnapshot.forEach((doc) => {
      data.push({ id: doc.id, ...doc.data() });
    });
    callback(data);
  }, (error) => {
    console.error(`[Firestore] Subscription error for recent positions:`, error);
  });
  return unsubscribe;
};


// ─── ARGOS POSITIONS — Firebase Direct Storage ─────────────────────────────────
// This is the core of the Firebase-first architecture.
// Argos API data goes DIRECTLY here, bypassing zustand state entirely.

/**
 * Canonical deterministic document ID for an Argos position fix:
 * argos_positions/{ptt}_{GPS|DOP}_{locationDateEpochMs}
 */
export { makeDeterministicFixDocId };

export function makeArgosDocId(platformId: string, lat: number, lon: number, timestamp: string, locationType: string = 'GPS'): string {
  const locDateMs = safeParseTimestamp(timestamp);
  return makeDeterministicFixDocId(platformId, locationType, locDateMs);
}

/**
 * Write Argos messages DIRECTLY to Firebase `argos_positions` collection.
 * Uses canonical deterministic IDs: argos_positions/{pttId}_{GPS|DOP}_{locationDateEpochMs}.
 * Performs in-batch deduplication accumulating deliveryCount, firstMessageDate, lastMessageDate, and lagMinutes.
 * Merges idempotently into Firestore.
 */
export const batchWriteArgosPositions = async (
  messages: ArgosMessage[],
  onProgress?: (written: number, total: number) => void
): Promise<number> => {
  if (messages.length === 0) return 0;

  const rawFixes: RawFix[] = [];
  const metaMap = new Map<string, { programId: string; satellite: string; rawData: string; source: string }>();

  for (const msg of messages) {
    const pidStr = normalizePttId(msg.platformId || (msg as any).pttId || (msg as any).deviceRef);
    if (!pidStr) continue;

    let lat = typeof msg.lat === 'number' ? msg.lat : parseFloat(String(msg.lat));
    let lon = typeof msg.lon === 'number' ? msg.lon : parseFloat(String(msg.lon));
    if (!isValidCoordinate(lat, lon)) continue;
    if (pidStr === '242086' && lon < 0) lon = Math.abs(lon);

    const locType: 'GPS' | 'DOPPLER' = classifyLocationType(msg.lc, msg.locationType, msg.satellite);
    const locDate = msg.locationDate || msg.timestamp;
    const msgDate = msg.messageDate || (msg as any).msgDatetime || locDate;
    const errRadiusM = locType === 'GPS' 
      ? 0 
      : (typeof msg.errorRadiusM === 'number' ? msg.errorRadiusM : (parseFloat(String(msg.dopplerError || '0')) || 0));
    const locClass = locType === 'GPS' ? null : (msg.locationClass || (msg.lc !== 'GPS' ? msg.lc : null) || null);
    const unitType = String((msg as any).unitType || msg.msgType || 'Houbara');

    rawFixes.push({
      pttId: pidStr,
      unitType,
      locationType: locType,
      locationClass: locClass,
      errorRadiusM: errRadiusM,
      locationDate: locDate,
      lat,
      lon,
      messageDate: msgDate,
      deliveries: msg.deliveryCount || 1
    });

    const key = `${pidStr}_${locType}_${locDate}`;
    if (!metaMap.has(key)) {
      metaMap.set(key, {
        programId: String(msg.programId || ''),
        satellite: String(msg.satellite || ''),
        rawData: String(msg.rawData || ''),
        source: (msg as any).source || 'cls-api'
      });
    }
  }

  const { fixes } = buildFixes(rawFixes);

  const items = fixes.map((fix: Fix) => {
    const locDateIso = new Date(fix.t).toISOString();
    const meta = metaMap.get(`${fix.pttId}_${fix.type}_${locDateIso}`) || {
      programId: '',
      satellite: fix.type === 'GPS' ? 'GPS' : '',
      rawData: '',
      source: 'cls-positions'
    };
    const validMsgDateMs = fix.firstMessageMs || fix.t;
    const msgDateIso = new Date(validMsgDateMs).toISOString();
    const lagMinutes = Math.max(0, Math.round((validMsgDateMs - fix.t) / 60000));

    return {
      docId: fix.id,
      pttId: fix.pttId,
      platformId: fix.pttId,
      locationType: fix.type,
      locationDate: locDateIso,
      locationDateMs: fix.t,
      timestamp: locDateIso,
      lat: fix.lat,
      lon: fix.lon,
      locationClass: fix.cls,
      lc: fix.type === 'GPS' ? 'GPS' : String(fix.cls || 'Z'),
      errorRadiusM: fix.errorRadiusM,
      dopplerError: String(fix.errorRadiusM),
      firstMessageMs: validMsgDateMs,
      firstMessageDate: msgDateIso,
      lastMessageMs: validMsgDateMs,
      lastMessageDate: msgDateIso,
      deliveryCount: fix.deliveries,
      lagMinutes,
      unitType: fix.unitTypes[0] || 'Houbara',
      unitTypes: fix.unitTypes,
      msgType: fix.unitTypes[0] || 'Houbara',
      programId: meta.programId,
      satellite: meta.satellite,
      rawData: meta.rawData,
      source: meta.source,
      ingestedAt: new Date().toISOString()
    };
  });

  const BATCH_LIMIT = 400;
  let totalWritten = 0;

  for (let i = 0; i < items.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db);
    const chunk = items.slice(i, i + BATCH_LIMIT);

    chunk.forEach(item => {
      const ref = doc(db, 'argos_positions', item.docId);
      const { docId, firstMessageMs, lastMessageMs, ...dataToWrite } = item;
      batch.set(ref, dataToWrite, { merge: true });
    });

    await batch.commit();
    totalWritten += chunk.length;
    onProgress?.(totalWritten, items.length);
  }

  // Update sync health watchdog
  try {
    await saveDocument('system', 'syncHealth', {
      lastSuccessAt: new Date().toISOString(),
      lastRunId: `run-${Date.now()}`,
      lagSeconds: 0,
      totalPositionsIngested: totalWritten
    });
  } catch (err) {
    console.warn('[Firestore] Could not update syncHealth:', err);
  }

  console.log(`[Firestore] Wrote ${totalWritten} canonical argos_positions docs to Firebase`);
  return totalWritten;
};

/**
 * Load argos positions from Firebase with pagination and optional filters.
 * Returns { data, lastDoc } for cursor-based pagination.
 */
export const loadArgosPositions = async (options: {
  platformId?: string;
  startDate?: string;
  endDate?: string;
  pageSize?: number;
  lastDocument?: DocumentSnapshot;
  searchQuery?: string;
}): Promise<{ data: any[]; lastDoc: DocumentSnapshot | null; totalEstimate: number }> => {
  try {
    const { platformId, startDate, endDate, pageSize = 100, lastDocument } = options;
    
    let constraints: any[] = [];
    
    if (platformId) {
      constraints.push(where('platformId', '==', platformId));
    }
    if (startDate) {
      constraints.push(where('timestamp', '>=', startDate));
    }
    if (endDate) {
      constraints.push(where('timestamp', '<=', endDate));
    }
    
    constraints.push(orderBy('timestamp', 'desc'));
    constraints.push(limit(pageSize));
    
    if (lastDocument) {
      constraints.push(startAfter(lastDocument));
    }
    
    const q = query(collection(db, 'argos_positions'), ...constraints);
    const snapshot = await getDocs(q);
    
    const data: any[] = [];
    snapshot.forEach(docSnap => {
      data.push({ id: docSnap.id, ...docSnap.data(), _docRef: docSnap });
    });
    
    const lastDoc = snapshot.docs.length > 0 
      ? snapshot.docs[snapshot.docs.length - 1] 
      : null;
    
    // Get total count (approximate)
    let totalEstimate = data.length;
    try {
      const countQuery = platformId 
        ? query(collection(db, 'argos_positions'), where('platformId', '==', platformId))
        : query(collection(db, 'argos_positions'));
      const countSnap = await getCountFromServer(countQuery);
      totalEstimate = countSnap.data().count;
    } catch {
      // Count might fail on older Firestore SDKs, use data length as fallback
    }
    
    return { data, lastDoc, totalEstimate };
  } catch (error) {
    console.error('[Firestore] Error loading argos_positions:', error);
    return { data: [], lastDoc: null, totalEstimate: 0 };
  }
};

/**
 * Load argos positions from Firebase efficiently without pagination.
 * Use for client-side filtering and bulk operations.
 * Defaults to the last 7 days to conserve read quota.
 */
export const loadAllArgosPositions = async (startDate?: Date, endDate?: Date): Promise<any[]> => {
  try {
    let q;
    if (startDate && endDate) {
      q = query(
        collection(db, 'argos_positions'),
        where('timestamp', '>=', startDate.toISOString()),
        where('timestamp', '<=', endDate.toISOString()),
        orderBy('timestamp', 'desc')
      );
    } else {
      const defaultStart = new Date();
      defaultStart.setDate(defaultStart.getDate() - 7);
      q = query(
        collection(db, 'argos_positions'),
        where('timestamp', '>=', defaultStart.toISOString()),
        orderBy('timestamp', 'desc')
      );
    }

    const snapshot = await getDocs(q);
    const data: any[] = [];
    snapshot.forEach(docSnap => {
      data.push({ id: docSnap.id, _collection: 'argos_positions', ...(docSnap.data() as any) });
    });
    console.log(`[Firestore] Loaded ${data.length} total argos positions.`);
    return data;
  } catch (error) {
    console.error('[Firestore] Error loading all argos_positions:', error);
    return [];
  }
};

/**
 * Load positions (the collection used by Live Tracking map and Database UI).
 * Defaults to the last 7 days to conserve read quota.
 */
export const loadAllPositions = async (startDate?: Date, endDate?: Date): Promise<any[]> => {
  try {
    let q;
    if (startDate && endDate) {
      q = query(
        collection(db, 'positions'),
        where('timestamp', '>=', startDate.toISOString()),
        where('timestamp', '<=', endDate.toISOString()),
        orderBy('timestamp', 'desc')
      );
    } else {
      const defaultStart = new Date();
      defaultStart.setDate(defaultStart.getDate() - 7);
      q = query(
        collection(db, 'positions'),
        where('timestamp', '>=', defaultStart.toISOString()),
        orderBy('timestamp', 'desc')
      );
    }

    const snapshot = await getDocs(q);
    const data: any[] = [];
    snapshot.forEach(docSnap => {
      const d = docSnap.data() as any;
      data.push({
        id: docSnap.id,
        _collection: 'positions',
        platformId: d.transmitter_id || '',
        programId: '',
        lat: d.lat,
        lon: d.lon,
        lc: d.lc || '',
        locationType: d.locationType || '',
        msgType: '',
        dopplerError: '',
        timestamp: d.locationDate || d.gpsLocDate || d.timestamp,
        locationDate: d.locationDate || d.gpsLocDate || d.timestamp,
        satellite: d.satellite || '',
        speed_kmh: d.speed_kmh,
        course: d.course
      });
    });
    console.log(`[Firestore] Loaded ${data.length} total positions.`);
    return data;
  } catch (error) {
    console.error('[Firestore] Error loading all positions:', error);
    return [];
  }
};

/**
 * Get all unique platform IDs across transmitters, argos_positions, and positions.
 */
export const getArgosTransmitterIds = async (): Promise<string[]> => {
  try {
    const [snapTx, snapArgos, snapPos] = await Promise.all([
      getDocs(collection(db, 'transmitters')),
      getDocs(collection(db, 'argos_positions')),
      getDocs(collection(db, 'positions'))
    ]);
    const ids = new Set<string>();
    snapTx.forEach(doc => {
      const data = doc.data();
      const pid = data.platform_id || data.id;
      if (pid) ids.add(String(pid).replace(/^trans-/, '').trim());
    });
    snapArgos.forEach(doc => {
      const data = doc.data();
      const pid = data.platformId || data.platform_id || data.transmitter_id;
      if (pid) ids.add(String(pid).replace(/^trans-/, '').trim());
    });
    snapPos.forEach(doc => {
      const data = doc.data();
      const pid = data.transmitter_id;
      if (pid) ids.add(String(pid).replace(/^trans-/, '').trim());
    });
    return Array.from(ids).filter(Boolean).sort();
  } catch (error) {
    console.error('[Firestore] Error getting transmitter IDs:', error);
    return [];
  }
};

/**
 * Synchronizes transmitters and positions from the argos_positions and positions collections.
 * 1. Discovers all platform IDs present in argos_positions or positions.
 * 2. Auto-creates transmitter records in Firestore for any newly discovered platform IDs (e.g. 244289).
 * 3. Extracts the latest valid fix (lat, lon, last_fix, battery) for each platform ID and updates the transmitter in Firestore if newer.
 * 4. Ensures corresponding position records exist in the positions collection for live mapping.
 * Returns the fresh, synchronized transmitters and positions.
 */
export const syncTransmittersFromArgosData = async (): Promise<{
  transmitters: Transmitter[];
  positions: Position[];
  createdCount: number;
  updatedCount: number;
}> => {
  try {
    const [txSnap, argosSnap, posSnap] = await Promise.all([
      trackedGetDocs('syncTransmitters (transmitters)', collection(db, 'transmitters')),
      trackedGetDocs('syncTransmitters (argos_positions)', collection(db, 'argos_positions')),
      trackedGetDocs('syncTransmitters (positions)', collection(db, 'positions'))
    ]);


    const transmittersMap = new Map<string, Transmitter>();
    txSnap.forEach(docSnap => {
      const data = docSnap.data() as Transmitter;
      const pid = String(data.platform_id || data.id || '').replace(/^trans-/, '').trim();
      if (pid) {
        transmittersMap.set(pid, { ...data, id: docSnap.id, platform_id: pid });
      }
    });

    // Group all tracking records by clean platform ID
    const recordsByPid = new Map<string, any[]>();
    argosSnap.forEach(docSnap => {
      const data = docSnap.data();
      const pid = String(data.platformId || data.platform_id || data.transmitter_id || '').replace(/^trans-/, '').trim();
      if (!pid || pid === 'Unknown') return;
      if (!recordsByPid.has(pid)) recordsByPid.set(pid, []);
      recordsByPid.get(pid)!.push({ ...data, _id: docSnap.id, _col: 'argos_positions' });
    });

    posSnap.forEach(docSnap => {
      const data = docSnap.data();
      const pid = String(data.transmitter_id || data.platformId || data.platform_id || '').replace(/^trans-/, '').trim();
      if (!pid || pid === 'Unknown') return;
      if (!recordsByPid.has(pid)) recordsByPid.set(pid, []);
      recordsByPid.get(pid)!.push({ ...data, _id: docSnap.id, _col: 'positions' });
    });

    let createdCount = 0;
    let updatedCount = 0;
    const missingPositionsDocs: Position[] = [];

    // For every platform ID found in argos_positions or positions:
    for (const [rawPid, records] of recordsByPid.entries()) {
      const pid = normalizePttId(rawPid);
      if (!pid) continue;

      let bestBattery: number | undefined;
      let maxMessageMs = -Infinity;
      const rawFixes: RawFix[] = [];

      records.forEach(r => {
        const rawLat = r.lat !== undefined ? r.lat : r.latitude;
        const rawLon = r.lon !== undefined ? r.lon : r.longitude;
        const lat = Number(rawLat);
        let lon = Number(rawLon);
        if (pid === '242086' && !isNaN(lon) && lon < 0) lon = Math.abs(lon);
        if (!isValidCoordinate(lat, lon)) return;

        const locType: 'GPS' | 'DOPPLER' = classifyLocationType(r.lc, r.locationType, r.satellite);
        const locDateStr = r.locationDate || r.gpsLocDate || r.location?.locationDate || r.dateOfPosition || r.timestamp;
        const locDateMs = safeParseTimestamp(locDateStr);
        if (isNaN(locDateMs) || locDateMs <= 0) return;

        const msgDateMs = safeParseTimestamp(r.messageDate || r.firstMessageDate || r.msgDatetime || locDateStr);
        if (!isNaN(msgDateMs) && msgDateMs > maxMessageMs) {
          maxMessageMs = msgDateMs;
        }

        if (r.rawData) {
          const v = decodeBatteryVoltage(r.rawData);
          if (v !== undefined && (bestBattery === undefined || v > bestBattery)) bestBattery = v;
        } else if (r.battery_voltage) {
          const bv = Number(r.battery_voltage);
          if (!isNaN(bv) && bv > 0 && (bestBattery === undefined || bv > bestBattery)) bestBattery = bv;
        }

        rawFixes.push({
          pttId: pid,
          unitType: r.unitType || r.msgType || 'Houbara',
          locationType: locType,
          locationClass: locType === 'GPS' ? null : (r.locationClass || r.lc || null),
          errorRadiusM: locType === 'GPS' ? 0 : (typeof r.errorRadiusM === 'number' ? r.errorRadiusM : (parseFloat(String(r.dopplerError || '0')) || 0)),
          locationDate: new Date(locDateMs).toISOString(),
          lat,
          lon,
          messageDate: r.messageDate || r.firstMessageDate || r.msgDatetime || null,
          deliveries: r.deliveryCount || 1
        });
      });

      const { fixes: pttFixes } = buildFixes(rawFixes);
      const latestRecord = lastFix(pttFixes, 'ALL');
      const latestGpsRecord = lastFix(pttFixes, 'GPS');
      const latestDopplerRecord = lastFix(pttFixes, 'DOPPLER');

      // Ensure every canonical fix exists in positions collection
      pttFixes.forEach(f => {
        const isoTs = new Date(f.t).toISOString();
        missingPositionsDocs.push({
          id: f.id,
          transmitter_id: pid,
          timestamp: isoTs,
          lat: f.lat,
          lon: f.lon,
          lc: (f.type === 'GPS' ? 'GPS' : (f.cls || '3')) as any,
          locationClass: f.cls,
          is_kalman: false,
          speed_kmh: 0,
          course: 0,
          satellite: f.type === 'GPS' ? 'GPS' : 'Argos',
          locationType: f.type,
          messageDate: f.firstMessageMs ? new Date(f.firstMessageMs).toISOString() : isoTs,
          locationDate: isoTs,
          errorRadiusM: f.errorRadiusM
        });
      });

      const liveDerived: any = {
        lastFix: latestRecord ? {
          type: latestRecord.type,
          date: new Date(latestRecord.t).toISOString(),
          lat: latestRecord.lat,
          lon: latestRecord.lon,
          class: latestRecord.cls,
          errorRadiusM: latestRecord.errorRadiusM
        } : undefined,
        lastGps: latestGpsRecord ? {
          date: new Date(latestGpsRecord.t).toISOString(),
          lat: latestGpsRecord.lat,
          lon: latestGpsRecord.lon
        } : undefined,
        lastDoppler: latestDopplerRecord ? {
          date: new Date(latestDopplerRecord.t).toISOString(),
          lat: latestDopplerRecord.lat,
          lon: latestDopplerRecord.lon,
          class: latestDopplerRecord.cls || 'Z',
          errorRadiusM: latestDopplerRecord.errorRadiusM
        } : undefined,
        lastMessageAt: maxMessageMs > 0 ? new Date(maxMessageMs).toISOString() : (latestRecord ? new Date(latestRecord.t).toISOString() : undefined),
        firstFixAt: pttFixes.length > 0 ? new Date(pttFixes[0].t).toISOString() : undefined,
        fixCount: pttFixes.length,
        updatedByRun: `run-${Date.now()}`
      };

      const existingTx = transmittersMap.get(pid);
      if (!existingTx) {
        // Discovered a new transmitter from tracking data (e.g. 244289)! Create it in Firestore!
        const latestFixIso = latestRecord ? new Date(latestRecord.t).toISOString() : new Date().toISOString();
        const newTx: Transmitter = {
          id: pid,
          platform_id: pid,
          model: 'Unknown (Auto-detected)',
          status: 'active',
          derived_status: 'Active',
          bird_id: '',
          deployed: true,
          battery_voltage: bestBattery,
          last_fix: latestFixIso,
          lat: latestRecord ? latestRecord.lat : undefined,
          lon: latestRecord ? latestRecord.lon : undefined,
          latitude: latestRecord ? latestRecord.lat : undefined,
          longitude: latestRecord ? latestRecord.lon : undefined,
          last_latitude: latestRecord ? latestRecord.lat : undefined,
          last_longitude: latestRecord ? latestRecord.lon : undefined,
          duty_cycle: 'Unknown',
          live: liveDerived
        };
        await saveDocument('transmitters', pid, newTx);
        transmittersMap.set(pid, newTx);
        createdCount++;
      } else {
        // Transmitter exists, update with latest derived state strictly based on max(locationDate)
        const currLastFixMs = safeParseTimestamp(existingTx.last_fix);
        const isNewer = isNaN(currLastFixMs) || (latestRecord && latestRecord.t >= currLastFixMs) || !existingTx.lat || !existingTx.lon;
        
        const updates: Partial<Transmitter> = {
          id: pid,
          platform_id: pid,
          live: liveDerived,
          ...(bestBattery !== undefined ? { battery_voltage: bestBattery } : {})
        };

        if (isNewer && latestRecord) {
          updates.last_fix = new Date(latestRecord.t).toISOString();
          updates.lat = latestRecord.lat;
          updates.lon = latestRecord.lon;
          updates.latitude = latestRecord.lat;
          updates.longitude = latestRecord.lon;
          updates.last_latitude = latestRecord.lat;
          updates.last_longitude = latestRecord.lon;
        }

        await saveDocument('transmitters', pid, updates);
        Object.assign(existingTx, updates);
        updatedCount++;
      }
    }

    // Save missing positions to positions collection in Firestore
    if (missingPositionsDocs.length > 0) {
      const documents = missingPositionsDocs.map(p => ({ id: p.id, data: p }));
      await batchWriteDocuments('positions', documents);
    }

    // Collect all final positions from Firestore
    const allFinalPositions: Position[] = [];
    const seenPosIds = new Set<string>();
    posSnap.forEach(d => {
      allFinalPositions.push({ id: d.id, ...(d.data() as any) });
      seenPosIds.add(d.id);
    });
    missingPositionsDocs.forEach(p => {
      if (!seenPosIds.has(p.id)) {
        allFinalPositions.push(p);
        seenPosIds.add(p.id);
      }
    });

    console.log(`[Firestore] syncTransmittersFromArgosData complete: ${createdCount} created, ${updatedCount} updated, ${transmittersMap.size} total transmitters`);

    return {
      transmitters: Array.from(transmittersMap.values()),
      positions: allFinalPositions,
      createdCount,
      updatedCount
    };
  } catch (error) {
    console.error('[Firestore] Error in syncTransmittersFromArgosData:', error);
    throw error;
  }
};

/**
 * Get total count of argos_positions
 */
export const getArgosPositionCount = async (platformId?: string): Promise<number> => {
  try {
    const q = platformId
      ? query(collection(db, 'argos_positions'), where('platformId', '==', platformId))
      : query(collection(db, 'argos_positions'));
    const snap = await getCountFromServer(q);
    return snap.data().count;
  } catch {
    return 0;
  }
};

export const deleteArgosPositions = async (platformId?: string): Promise<number> => {
  try {
    const q = platformId
      ? query(collection(db, 'argos_positions'), where('platformId', '==', platformId))
      : query(collection(db, 'argos_positions'));
    
    const snapshot = await getDocs(q);
    const BATCH_LIMIT = 400;
    let deleted = 0;
    
    const docs = snapshot.docs;
    for (let i = 0; i < docs.length; i += BATCH_LIMIT) {
      const batch = writeBatch(db);
      const chunk = docs.slice(i, i + BATCH_LIMIT);
      chunk.forEach(d => batch.delete(d.ref));
      await batch.commit();
      deleted += chunk.length;
    }
    
    console.log(`[Firestore] Deleted ${deleted} argos_positions`);
    return deleted;
  } catch (err) {
    console.error('Error deleting argos positions:', err);
    throw err;
  }
};

/**
 * Reset coordinate tracking fields on a single transmitter in Firestore.
 */
export const resetTransmitterCoordinates = async (platformId: string): Promise<void> => {
  const cleanPid = String(platformId).replace(/^trans-/, '').trim();
  const resetFields = {
    lat: null,
    lon: null,
    latitude: null,
    longitude: null,
    last_latitude: null,
    last_longitude: null,
    last_fix: null,
    battery_voltage: null,
    speed: null,
    derived_status: 'inactive'
  };

  try {
    await saveDocument('transmitters', cleanPid, resetFields);
    console.log(`[Firestore] Reset coordinates for transmitter ${cleanPid}`);
  } catch (err) {
    console.warn(`[Firestore] Failed to reset transmitter coordinates for ${cleanPid}:`, err);
  }

  // Also clean legacy prefixed doc if exists
  try {
    const legacyDocId = `trans-${cleanPid}`;
    await saveDocument('transmitters', legacyDocId, resetFields);
  } catch {
    // Ignore legacy doc reset failure
  }
};

/**
 * Reset coordinate tracking fields on ALL transmitters in Firestore.
 * Transmitters inventory and bird linkages remain fully intact.
 */
export const resetAllTransmitterCoordinates = async (onProgress?: (msg: string) => void): Promise<number> => {
  try {
    const txSnap = await getDocs(collection(db, 'transmitters'));
    if (txSnap.empty) return 0;

    onProgress?.(`Resetting coordinates on ${txSnap.size} transmitters...`);
    const BATCH_LIMIT = 400;
    const docs = txSnap.docs;
    let resetCount = 0;

    for (let i = 0; i < docs.length; i += BATCH_LIMIT) {
      const batch = writeBatch(db);
      const chunk = docs.slice(i, i + BATCH_LIMIT);
      chunk.forEach(d => {
        batch.update(d.ref, {
          lat: null,
          lon: null,
          latitude: null,
          longitude: null,
          last_latitude: null,
          last_longitude: null,
          last_fix: null,
          battery_voltage: null,
          speed: null,
          derived_status: 'inactive'
        });
      });
      await batch.commit();
      resetCount += chunk.length;
      onProgress?.(`Reset coordinates on ${resetCount}/${docs.length} transmitters...`);
    }

    clearTransmitterHistoryCache();
    console.log(`[Firestore] Reset coordinates on ${resetCount} transmitters successfully`);
    return resetCount;
  } catch (err) {
    console.error('[Firestore] Error resetting all transmitter coordinates:', err);
    throw err;
  }
};

/**
 * Clear all tracking data from Firebase (argos_positions and positions collections).
 * Guaranteed to NEVER delete transmitters or birds, but resets tracking coordinates on transmitters so Monitoring and Live Tracking are clean.
 */
export const clearAllTrackingData = async (
  scope: 'all' | 'argos_positions' | 'positions' = 'all',
  onProgress?: (msg: string) => void
): Promise<{ argosDeleted: number; positionsDeleted: number; transmittersReset: number }> => {
  let argosDeleted = 0;
  let positionsDeleted = 0;
  let transmittersReset = 0;

  try {
    if (scope === 'all' || scope === 'argos_positions') {
      onProgress?.('Deleting Argos raw positions from Firebase...');
      argosDeleted = await deleteCollection('argos_positions', (count) => {
        onProgress?.(`Deleting Argos raw records: ${count} deleted...`);
      });
    }

    if (scope === 'all' || scope === 'positions') {
      onProgress?.('Deleting map positions from Firebase...');
      positionsDeleted = await deleteCollection('positions', (count) => {
        onProgress?.(`Deleting map position records: ${count} deleted...`);
      });
    }

    // Reset coordinates on all transmitters so Live Monitoring doesn't retain ghost coordinates
    if (scope === 'all' || scope === 'positions') {
      transmittersReset = await resetAllTransmitterCoordinates(onProgress);
    }

    clearTransmitterHistoryCache();
    console.log(`[Firestore] clearAllTrackingData completed: ${argosDeleted} argos_positions, ${positionsDeleted} positions, ${transmittersReset} transmitters reset`);
    return { argosDeleted, positionsDeleted, transmittersReset };
  } catch (err) {
    console.error('Error in clearAllTrackingData:', err);
    throw err;
  }
};

/** Delete a single coordinate record from both argos_positions and positions, AND reset coordinates on the transmitter */
export const deleteCoordinateRecord = async (argosId: string | undefined, platformId: string, timestamp?: string) => {
  console.log('[Firestore] deleteCoordinateRecord called:', { argosId, platformId, timestamp });
  const batch = writeBatch(db);
  
  if (argosId) {
    batch.delete(doc(db, 'argos_positions', argosId));
  } else if (platformId && timestamp) {
    const argosQ = query(
      collection(db, 'argos_positions'),
      where('platformId', '==', String(platformId)),
      where('timestamp', '==', timestamp)
    );
    const argosSnap = await getDocs(argosQ);
    argosSnap.forEach(d => batch.delete(d.ref));
  }
  
  if (platformId && timestamp) {
    const posQ = query(
      collection(db, 'positions'),
      where('transmitter_id', '==', String(platformId)),
      where('timestamp', '==', timestamp)
    );
    const posSnap = await getDocs(posQ);
    posSnap.forEach(d => batch.delete(d.ref));
  }
  
  await batch.commit();

  // Reset the coordinate fields on the transmitter document so Live Monitoring immediately clears it
  if (platformId) {
    await resetTransmitterCoordinates(platformId);
    clearTransmitterHistoryCache(platformId);
  }
};

/** Bulk delete records by a specific collection and list of IDs */
export const bulkDeleteRecords = async (collectionName: string, docIds: string[]) => {
  const BATCH_LIMIT = 400;
  let deleted = 0;
  for (let i = 0; i < docIds.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db);
    const chunk = docIds.slice(i, i + BATCH_LIMIT);
    chunk.forEach(id => batch.delete(doc(db, collectionName, id)));
    await batch.commit();
    deleted += chunk.length;
  }
  return deleted;
};

/** Bulk update records by a specific collection, list of IDs, and partial data */
export const bulkUpdateRecords = async (collectionName: string, docIds: string[], data: any) => {
  const BATCH_LIMIT = 400;
  let updated = 0;
  for (let i = 0; i < docIds.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db);
    const chunk = docIds.slice(i, i + BATCH_LIMIT);
    chunk.forEach(id => batch.update(doc(db, collectionName, id), data));
    await batch.commit();
    updated += chunk.length;
  }
  return updated;
};

// ─── Position-Specific Operations ─────────────────────────────────────────────

interface CachedTransmitterHistory {
  cachedAt: number;
  docs: any[];
}
const transmitterHistoryCache = new Map<string, CachedTransmitterHistory>();
const HISTORY_CACHE_TTL = 30 * 60 * 1000; // 30 minutes cache

export const clearTransmitterHistoryCache = (platformId?: string) => {
  if (platformId) {
    transmitterHistoryCache.delete(String(platformId));
  } else {
    transmitterHistoryCache.clear();
  }
};

export const getHistoricalPositions = async (transmitterIds: string[], startDate: Date, endDate: Date) => {
  if (!transmitterIds || transmitterIds.length === 0) {
    return [];
  }

  const startMs = startDate.getTime();
  const endMs   = endDate.getTime();
  const allResults: any[] = [];

  const getCoordKey = (lat: number, lon: number) => `${lat.toFixed(4)},${lon.toFixed(4)}`;

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

/** Save positions in batch, using composite key as document ID */
export const savePositions = async (positions: Array<{ id: string; [key: string]: any }>) => {
  const validPositions = positions.filter(pos => isValidCoordinate(pos.lat, pos.lon));
  if (validPositions.length === 0) return 0;
  
  const documents = validPositions.map(pos => ({
    id: pos.id,
    data: {
      transmitter_id: pos.transmitter_id,
      timestamp: pos.timestamp,
      lat: pos.lat,
      lon: pos.lon,
      lc: pos.lc,
      is_kalman: pos.is_kalman,
      speed_kmh: pos.speed_kmh,
      course: pos.course,
      satellite: pos.satellite,
      locationType: classifyLocationType(pos.lc, pos.locationType, pos.satellite)
    }
  }));

  return batchWriteDocuments('positions', documents);
};

/** Cleanup disabled — retain all data */
export const cleanupOldPositions = async () => {
  console.log('[Firestore] Cleanup disabled to retain historical tracking data permanently.');
  return 0;
};

/**
 * Static Test Month Archiving Service
 * Groups positions for static test transmitters by month (YYYY-MM).
 * Past months (older than current month) are archived into Firestore collection `static_test_archives`.
 */
export const archiveStaticTestSessions = async (
  positions: any[],
  transmitters: any[]
): Promise<number> => {
  try {
    const currentYM = getCurrentYearMonthKey();

    const staticTxIds = new Set<string>();
    transmitters.forEach(t => {
      const st = t.derived_status || t.status || '';
      if (st === 'Static test' || st === 'Static Test' || st === 'static') {
        staticTxIds.add(String(t.platform_id));
      }
    });

    if (staticTxIds.size === 0) return 0;

    const grouped = new Map<string, { pid: string; ym: string; fixes: any[] }>();

    positions.forEach(p => {
      const pid = String(p.transmitter_id || p.platformId || p.platform_id || '');
      if (!staticTxIds.has(pid)) return;

      const ym = getYearMonthKey(p.timestamp);
      if (!ym) return;

      const key = `${pid}_${ym}`;
      if (!grouped.has(key)) {
        grouped.set(key, { pid, ym, fixes: [] });
      }
      grouped.get(key)!.fixes.push(p);
    });

    const archiveDocs: Array<{ id: string; data: any }> = [];

    grouped.forEach(({ pid, ym, fixes }, key) => {
      if (ym < currentYM && fixes.length > 0) {
        const sortedFixes = [...fixes].sort((a, b) => safeParseTimestamp(a.timestamp) - safeParseTimestamp(b.timestamp));
        archiveDocs.push({
          id: key,
          data: {
            id: key,
            transmitter_id: pid,
            year_month: ym,
            status: 'Static test',
            start_date: sortedFixes[0].timestamp,
            end_date: sortedFixes[sortedFixes.length - 1].timestamp,
            total_fixes: fixes.length,
            positions: sortedFixes,
            archived_at: new Date().toISOString()
          }
        });
      }
    });

    if (archiveDocs.length > 0) {
      await batchWriteDocuments('static_test_archives', archiveDocs);
      console.log(`[Firestore] Archived ${archiveDocs.length} past static test monthly sessions`);
    }

    return archiveDocs.length;
  } catch (error) {
    console.error('[Firestore] Error archiving static test sessions:', error);
    return 0;
  }
};

/**
 * Transmitter Status History Archiving Service
 * Records status transitions linked by date and duration.
 */
export const recordStatusTransition = async (
  platform_id: string,
  newStatus: 'Active' | 'Potential Mortality' | 'Inactive' | 'Static test' | 'Dead',
  bird_id?: string,
  setBy: string = 'system',
  comment?: string
): Promise<StatusHistoryRecord | null> => {
  try {
    const pidStr = String(platform_id);
    const nowIso = new Date().toISOString();

    // Query active status records for this transmitter
    const q = query(
      collection(db, 'status_history'),
      where('platform_id', '==', pidStr)
    );
    const snap = await getDocs(q);
    const historyDocs = snap.docs.map(d => ({ id: d.id, ...d.data() } as StatusHistoryRecord));
    
    // Find open record (where end_date is null or undefined)
    const openRecord = historyDocs.find(r => !r.end_date);

    if (openRecord) {
      if (openRecord.status === newStatus) {
        // Status has not changed, keep current open record
        return openRecord;
      }

      // Close previous status record
      const startMs = safeParseTimestamp(openRecord.start_date);
      const nowMs = Date.now();
      const durationDays = isNaN(startMs) ? 1 : Math.max(1, Math.ceil((nowMs - startMs) / (1000 * 60 * 60 * 24)));

      await saveDocument('status_history', openRecord.id, {
        end_date: nowIso,
        duration_days: durationDays
      });
    }

    // Open new status history record
    const newRecordId = `sh_${pidStr}_${Date.now()}`;
    const newRecord: StatusHistoryRecord = {
      id: newRecordId,
      transmitter_id: pidStr,
      platform_id: pidStr,
      bird_id: bird_id || '',
      status: newStatus,
      start_date: nowIso,
      end_date: null,
      duration_days: 1,
      set_by: setBy,
      comment: comment || `Status updated to ${newStatus}`,
      created_at: nowIso
    };

    await saveDocument('status_history', newRecordId, newRecord);
    console.log(`[Firestore] Recorded status transition for PTT ${pidStr}: -> ${newStatus}`);
    return newRecord;
  } catch (error) {
    console.error(`[Firestore] Error recording status transition for ${platform_id}:`, error);
    return null;
  }
};

export const loadStatusHistoryForTransmitter = async (platform_id: string): Promise<StatusHistoryRecord[]> => {
  try {
    const q = query(
      collection(db, 'status_history'),
      where('platform_id', '==', String(platform_id))
    );
    const snap = await getDocs(q);
    const docs = snap.docs.map(d => ({ id: d.id, ...d.data() } as StatusHistoryRecord));
    docs.sort((a, b) => safeParseTimestamp(a.start_date) - safeParseTimestamp(b.start_date));
    return docs;
  } catch (error) {
    console.error(`[Firestore] Error loading status history for ${platform_id}:`, error);
    return [];
  }
};

export const loadAllStatusHistory = async (): Promise<StatusHistoryRecord[]> => {
  try {
    const docs = await loadCollection<StatusHistoryRecord>('status_history');
    docs.sort((a, b) => safeParseTimestamp(a.start_date) - safeParseTimestamp(b.start_date));
    return docs;
  } catch (error) {
    console.error('[Firestore] Error loading all status history:', error);
    return [];
  }
};

/**
 * Get status of transmitter at specific historical date
 */
export const getStatusAtDate = (
  history: StatusHistoryRecord[],
  targetDate: string | Date
): 'Active' | 'Potential Mortality' | 'Inactive' | 'Static test' | 'Dead' | 'Unknown' => {
  const targetMs = typeof targetDate === 'string' ? safeParseTimestamp(targetDate) : targetDate.getTime();
  if (isNaN(targetMs)) return 'Unknown';

  const sorted = [...history].sort((a, b) => safeParseTimestamp(a.start_date) - safeParseTimestamp(b.start_date));
  for (const record of sorted) {
    const startMs = safeParseTimestamp(record.start_date);
    const endMs = record.end_date ? safeParseTimestamp(record.end_date) : Infinity;
    if (targetMs >= startMs && targetMs <= endMs) {
      return record.status;
    }
  }

  return 'Unknown';
};

// ─── Sync Helpers ─────────────────────────────────────────────────────────────

export const syncTransmitters = async (transmitters: Array<{ id: string; [key: string]: any }>) => {
  const documents = transmitters.map(t => ({
    id: t.id,
    data: { ...t }
  }));
  return batchWriteDocuments('transmitters', documents);
};

export const syncBirds = async (birds: Array<{ id: string; [key: string]: any }>) => {
  const documents = birds.map(b => ({
    id: b.id,
    data: { ...b }
  }));
  return batchWriteDocuments('birds', documents);
};

export const syncAlerts = async (alerts: Array<{ id: string; [key: string]: any }>) => {
  const documents = alerts.map(a => ({
    id: a.id,
    data: { ...a }
  }));
  return batchWriteDocuments('alerts', documents);
};

// ─── Support Tickets ──────────────────────────────────────────────────────────

export interface SupportTicket {
  id: string;
  subject: string;
  description: string;
  status: 'open' | 'in-progress' | 'resolved';
  priority: 'low' | 'medium' | 'high';
  createdBy: string;       // uid of creator
  createdByName: string;   // display name
  createdByEmail: string;  // email
  created: string;         // ISO date string
  lastUpdate: string;      // ISO date string
  resolvedBy?: string | null;    // name of who resolved
}

/** Create a new support ticket */
export const createTicket = async (ticket: Omit<SupportTicket, 'id'>): Promise<string> => {
  try {
    const docRef = await addDoc(collection(db, 'support_tickets'), {
      ...ticket,
      createdAt: serverTimestamp()
    });
    // Update the doc with its own ID for easy reference
    await updateDoc(docRef, { id: docRef.id });
    return docRef.id;
  } catch (error) {
    console.error('[Firestore] Error creating ticket:', error);
    throw error;
  }
};

/** Update a ticket (status change, etc.) */
export const updateTicket = async (ticketId: string, updates: Partial<SupportTicket>): Promise<void> => {
  try {
    const docRef = doc(db, 'support_tickets', ticketId);
    await updateDoc(docRef, { ...updates, lastUpdate: new Date().toISOString().split('T')[0] });
  } catch (error) {
    console.error(`[Firestore] Error updating ticket ${ticketId}:`, error);
    throw error;
  }
};

/** Subscribe to all tickets (real-time) */
export const subscribeToTickets = (
  callback: (tickets: SupportTicket[]) => void
): (() => void) => {
  const q = query(collection(db, 'support_tickets'));
  return onSnapshot(q, (snapshot) => {
    const tickets: SupportTicket[] = snapshot.docs.map(d => ({
      ...d.data(),
      id: d.id
    } as SupportTicket));
    // Sort by created date descending
    tickets.sort((a, b) => (b.created || '').localeCompare(a.created || ''));
    callback(tickets);
  }, (error) => {
    console.error('[Firestore] Error subscribing to tickets:', error);
  });
};

export const purgeInvalidCoordinates = async (onProgress?: (msg: string) => void) => {
  let count = 0;
  try {
    // Purge positions
    onProgress?.('Fetching positions...');
    const posRef = collection(db, 'positions');
    const posSnap = await getDocs(posRef);
    const posBatch = [];
    let currentBatch = writeBatch(db);
    let ops = 0;

    posSnap.forEach(doc => {
       const data = doc.data();
       const lat = Number(data.lat);
       const lon = Number(data.lon);
       if (Math.abs(lat) < 1 || Math.abs(lon) < 1 || isNaN(lat) || isNaN(lon)) {
         currentBatch.delete(doc.ref);
         ops++;
         count++;
         if (ops === 490) {
           posBatch.push(currentBatch);
           currentBatch = writeBatch(db);
           ops = 0;
         }
       }
    });
    if (ops > 0) posBatch.push(currentBatch);

    for(let i=0; i < posBatch.length; i++) {
      await posBatch[i].commit();
      onProgress?.(`Deleted batch ${i+1}/${posBatch.length} from positions`);
    }

    // Purge argos_positions
    onProgress?.('Fetching argos_positions...');
    const argosRef = collection(db, 'argos_positions');
    const argosSnap = await getDocs(argosRef);
    const argosBatch = [];
    currentBatch = writeBatch(db);
    ops = 0;
    
    argosSnap.forEach(doc => {
       const data = doc.data();
       const lat = Number(data.lat);
       const lon = Number(data.lon);
       if (Math.abs(lat) < 1 || Math.abs(lon) < 1 || isNaN(lat) || isNaN(lon)) {
         currentBatch.delete(doc.ref);
         ops++;
         count++;
         if (ops === 490) {
           argosBatch.push(currentBatch);
           currentBatch = writeBatch(db);
           ops = 0;
         }
       }
    });
    if (ops > 0) argosBatch.push(currentBatch);
    
    for(let i=0; i < argosBatch.length; i++) {
      await argosBatch[i].commit();
      onProgress?.(`Deleted batch ${i+1}/${argosBatch.length} from argos_positions`);
    }

    onProgress?.(`✅ Purged ${count} invalid coordinates from database!`);
  } catch (err) {
    console.error('Purge error:', err);
    onProgress?.(`❌ Purge error: ${(err as any).message}`);
  }
  return count;
};
