import { 
  collection, doc, getDoc, setDoc, getDocs, onSnapshot, query, deleteDoc, 
  writeBatch, where, orderBy, limit, startAfter, getCountFromServer,
  DocumentSnapshot, addDoc, updateDoc, Timestamp, serverTimestamp
} from 'firebase/firestore';
import { db } from '../firebase';
import { ArgosMessage, StatusHistoryRecord } from '../types';
import { safeParseTimestamp, getYearMonthKey, getCurrentYearMonthKey } from '../utils/formatting';

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
    const docSnap = await getDoc(doc(db, 'system_status', 'ingestion'));
    if (docSnap.exists()) {
      return docSnap.data().last_ingest_time || null;
    }
  } catch (e) {
    console.warn('[Firestore] Error loading last_ingest_time:', e);
  }
  return null;
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
    const snapshot = await getDocs(collection(db, collectionName));
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
      limit(200)
    );

    const [activeSnap, recentSnap] = await Promise.all([
      getDocs(activeQuery),
      getDocs(recentResolvedQuery)
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
  const unsubscribe = onSnapshot(q, (querySnapshot) => {
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
};

export const loadLatestPositionsPerTransmitter = async (transmitterIds: (string | number)[]) => {
  try {
    const promises: Promise<any>[] = [];
    
    transmitterIds.forEach(rawId => {
      const idStr = String(rawId);
      const idNum = Number(rawId);
      const isNumValid = !isNaN(idNum);

      const fetchDocs = (colName: string, fieldName: string, val: string | number) => {
        return getDocs(query(
          collection(db, colName),
          where(fieldName, '==', val),
          orderBy('timestamp', 'desc'),
          limit(5)
        )).then(snap => snap.docs.map(d => ({ docId: d.id, colName, ...d.data() })))
        .catch(() => {
          return getDocs(query(
            collection(db, colName),
            where(fieldName, '==', val),
            limit(20)
          )).then(snap => snap.docs.map(d => ({ docId: d.id, colName, ...d.data() })))
          .catch(() => []);
        });
      };

      const p1 = fetchDocs('positions', 'transmitter_id', idStr);
      const p2 = isNumValid ? fetchDocs('positions', 'transmitter_id', idNum) : Promise.resolve([]);
      const p3 = fetchDocs('positions', 'platformId', idStr);
      const p4 = isNumValid ? fetchDocs('positions', 'platformId', idNum) : Promise.resolve([]);

      const p5 = fetchDocs('argos_positions', 'platformId', idStr);
      const p6 = isNumValid ? fetchDocs('argos_positions', 'platformId', idNum) : Promise.resolve([]);
      const p7 = fetchDocs('argos_positions', 'transmitter_id', idStr);
      const p8 = isNumValid ? fetchDocs('argos_positions', 'transmitter_id', idNum) : Promise.resolve([]);

      promises.push(Promise.all([p1, p2, p3, p4, p5, p6, p7, p8]).then(results => {
        const combinedRaw = results.flat();
        if (combinedRaw.length === 0) return null;

        const normalized = combinedRaw.map((d: any) => {
          const rawLat = d.lat !== undefined ? d.lat : d.latitude;
          let rawLon = d.lon !== undefined ? d.lon : d.longitude;
          let numLon = Number(rawLon);
          if (idStr === '242086' && !isNaN(numLon) && numLon < 0) {
            numLon = Math.abs(numLon);
          }

          return {
            id: d.docId || `pos-${d.id || Date.now()}`,
            transmitter_id: idStr,
            timestamp: d.timestamp || d.locationDate || new Date().toISOString(),
            lat: Number(rawLat),
            lon: numLon,
            lc: d.lc || '3',
            is_kalman: false,
            speed_kmh: Number(d.speed_kmh || d.speed || 0),
            course: Number(d.course || 0),
            satellite: d.satellite || 'GPS',
            locationType: d.locationType || 'GPS'
          };
        }).filter(item => {
          return !isNaN(item.lat) && !isNaN(item.lon) && item.lat !== 0 && item.lon !== 0 && (Math.abs(item.lat) > 0.0001 || Math.abs(item.lon) > 0.0001);
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

  const unsubscribe = onSnapshot(q, (querySnapshot) => {
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
 * Generate a deterministic document ID from platformId + lat + lon + timestamp.
 * If all 4 match, the document is overwritten (no duplicate).
 * Different coordinates or times = separate documents.
 */
function makeArgosDocId(platformId: string, lat: number, lon: number, timestamp: string): string {
  const ts = new Date(timestamp).getTime();
  // Round lat/lon to 6 decimal places to avoid floating point noise
  const latRound = Math.round(lat * 1000000);
  const lonRound = Math.round(lon * 1000000);
  return `${platformId}_${latRound}_${lonRound}_${ts}`;
}

/**
 * Write Argos messages DIRECTLY to Firebase `argos_positions` collection.
 * Uses deterministic IDs so duplicates (same ID + coords + time) are overwritten.
 * Returns number of records written.
 */
export const batchWriteArgosPositions = async (
  messages: ArgosMessage[],
  onProgress?: (written: number, total: number) => void
): Promise<number> => {
  if (messages.length === 0) return 0;

  const BATCH_LIMIT = 400;
  let totalWritten = 0;

  for (let i = 0; i < messages.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db);
    const chunk = messages.slice(i, i + BATCH_LIMIT);
    
    chunk.forEach(msg => {
      const pidStr = String(msg.platformId);
      let lat = parseFloat(msg.lat);
      let lon = parseFloat(msg.lon);
      if (isNaN(lat) || isNaN(lon) || lat === 0 || lon === 0 || (Math.abs(lat) <= 0.0001 && Math.abs(lon) <= 0.0001)) return; // skip zero coords
      
      // Auto-correct negative longitude to positive for transmitter 242086
      if (pidStr === '242086' && lon < 0) {
        lon = Math.abs(lon);
      }

      const docId = makeArgosDocId(pidStr, lat, lon, msg.timestamp);
      const ref = doc(db, 'argos_positions', docId);
      
      batch.set(ref, {
        platformId: pidStr,
        programId: String(msg.programId || ''),
        lat: lat,
        lon: lon,
        lc: String(msg.lc || ''),
        timestamp: msg.timestamp,
        msgType: String(msg.msgType || ''),
        satellite: String(msg.satellite || ''),
        locationType: String(msg.locationType || ''),
        dopplerError: String(msg.dopplerError || ''),
        rawData: String(msg.rawData || ''),
        ingestedAt: new Date().toISOString()
      }, { merge: true }); // merge = overwrite if exists
    });

    await batch.commit();
    totalWritten += chunk.length;
    
    if (onProgress) {
      onProgress(totalWritten, messages.length);
    }
  }

  console.log(`[Firestore] Wrote ${totalWritten} argos_positions to Firebase`);
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
        timestamp: d.timestamp,
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
 * Get all unique platform IDs from argos_positions for the filter dropdown.
 */
export const getArgosTransmitterIds = async (): Promise<string[]> => {
  try {
    // Load all docs but only the platformId field
    // For large datasets, this could be optimized with a separate index collection
    const snapshot = await getDocs(collection(db, 'argos_positions'));
    const ids = new Set<string>();
    snapshot.forEach(doc => {
      const data = doc.data();
      if (data.platformId) ids.add(String(data.platformId));
    });
    return Array.from(ids).sort();
  } catch (error) {
    console.error('[Firestore] Error getting transmitter IDs:', error);
    return [];
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

/** Delete a single coordinate record from both argos_positions and positions */
export const deleteCoordinateRecord = async (argosId: string | undefined, platformId: string, timestamp: string) => {
  console.log('[Firestore] deleteCoordinateRecord called:', { argosId, platformId, timestamp });
  const batch = writeBatch(db);
  
  if (argosId) {
    batch.delete(doc(db, 'argos_positions', argosId));
  } else if (platformId && timestamp) {
    // If we don't have the explicit argosId (e.g. from Monitoring view), search for it
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

export const getHistoricalPositions = async (transmitterIds: string[], startDate: Date, endDate: Date) => {
  console.log('[Firestore] getHistoricalPositions called for PTTs:', transmitterIds.length);
  if (!transmitterIds || transmitterIds.length === 0) {
    return [];
  }

  const startMs = startDate.getTime();
  const endMs   = endDate.getTime();
  const allResults: any[] = [];

  // Helper: classify locationType from lc field
  const classifyLocType = (lc: string, rawLocType: string): 'GPS' | 'Doppler' => {
    const lcUp = lc.toUpperCase();
    const rtUp = rawLocType.toUpperCase();
    if (rtUp === 'GPS' || lcUp === 'GPS' || lcUp === 'G') return 'GPS';
    if (['3', '2', '1', '0', 'A', 'B', 'Z'].includes(lcUp)) return 'Doppler';
    return 'Doppler';
  };

  // Helper: process a Firestore doc snapshot into a position record
  const processDoc = (docSnap: any, pidStr: string, seenKeys: Set<string>): any | null => {
    const d = docSnap.data();
    const docTs = safeParseDate(d.timestamp);
    if (isNaN(docTs) || docTs < startMs || docTs > endMs) return null;

    const lat = Number(d.lat);
    let lon = Number(d.lon);
    if (isNaN(lat) || isNaN(lon) || lat === 0 || lon === 0 || (Math.abs(lat) <= 0.0001 && Math.abs(lon) <= 0.0001)) return null;

    if (pidStr === '242086' && lon < 0) lon = Math.abs(lon);

    const dedupeKey = `${docTs}_${lat.toFixed(4)}_${lon.toFixed(4)}`;
    if (seenKeys.has(dedupeKey)) return null;
    seenKeys.add(dedupeKey);

    return {
      id: docSnap.id,
      transmitter_id: pidStr,
      platformId: pidStr,
      lat, lon,
      timestamp: d.timestamp,
      lc: d.lc || '',
      satellite: d.satellite || '',
      locationType: classifyLocType(String(d.lc || ''), String(d.locationType || '')),
      speed_kmh: d.speed_kmh || 0,
    };
  };

  try {
    for (const pttId of transmitterIds) {
      const pidStr = String(pttId);
      const seenKeys = new Set<string>();
      let pttDocs: any[] = [];

      // ── Primary: query argos_positions ──
      try {
        const qArgos = query(
          collection(db, 'argos_positions'),
          where('platformId', '==', pidStr)
        );
        const snap = await getDocs(qArgos);
        snap.forEach((ds: any) => {
          const rec = processDoc(ds, pidStr, seenKeys);
          if (rec) pttDocs.push(rec);
        });
      } catch (e) {
        console.warn(`[Firestore] argos_positions query failed for ${pidStr}:`, e);
      }

      // ── Fallback: only query positions if argos_positions returned nothing ──
      if (pttDocs.length === 0) {
        try {
          const qPos = query(
            collection(db, 'positions'),
            where('transmitter_id', '==', pidStr)
          );
          const snap = await getDocs(qPos);
          snap.forEach((ds: any) => {
            const rec = processDoc(ds, pidStr, seenKeys);
            if (rec) pttDocs.push(rec);
          });
        } catch (e) {
          console.warn(`[Firestore] positions query failed for ${pidStr}:`, e);
        }
      }

      allResults.push(...pttDocs);
    }

    allResults.sort((a, b) => safeParseDate(a.timestamp) - safeParseDate(b.timestamp));
    console.log(`[Firestore] getHistoricalPositions returning ${allResults.length} records`);
    return allResults;
  } catch (error) {
    console.error('[Firestore] Error in getHistoricalPositions:', error);
    return [];
  }
};


/** Save positions in batch, using composite key as document ID */
export const savePositions = async (positions: Array<{ id: string; [key: string]: any }>) => {
  if (positions.length === 0) return 0;
  
  const documents = positions.map(pos => ({
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
      locationType: pos.locationType || 'Doppler'
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
