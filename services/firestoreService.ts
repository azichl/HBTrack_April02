import { 
  collection, doc, setDoc, getDocs, onSnapshot, query, deleteDoc, 
  writeBatch, where, orderBy, limit, startAfter, getCountFromServer,
  DocumentSnapshot, addDoc, updateDoc, Timestamp, serverTimestamp
} from 'firebase/firestore';
import { db } from '../firebase';
import { ArgosMessage } from '../types';

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

export const loadLatestPositionsPerTransmitter = async (transmitterIds: string[]) => {
  try {
    const promises: Promise<any>[] = [];
    
    transmitterIds.forEach(id => {
      // 1 latest position (whether GPS or Doppler)
      promises.push(
        getDocs(query(
          collection(db, 'positions'),
          where('transmitter_id', '==', id),
          orderBy('timestamp', 'desc'),
          limit(1)
        )).then(snap => snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() })
      );
    });

    const results = await Promise.all(promises);
    const validPositions = results.filter(p => p !== null);
    
    console.log(`[Firestore] Loaded ${validPositions.length} latest positions for ${transmitterIds.length} transmitters`);
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
      const lat = parseFloat(msg.lat);
      const lon = parseFloat(msg.lon);
      if (isNaN(lat) || isNaN(lon)) return; // skip invalid coords
      
      const docId = makeArgosDocId(String(msg.platformId), lat, lon, msg.timestamp);
      const ref = doc(db, 'argos_positions', docId);
      
      batch.set(ref, {
        platformId: String(msg.platformId),
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

/** Fetch historical positions for specific transmitters within a date range.
 *  Queries argos_positions (primary data store) using platformId.
 *  Falls back to the processed positions collection if needed.
 */
export const getHistoricalPositions = async (transmitterIds: string[], startDate: Date, endDate: Date) => {
  console.log('[Firestore] getHistoricalPositions called with:', { transmitterIds, startDate, endDate });
  if (!transmitterIds || transmitterIds.length === 0) {
    console.log('[Firestore] getHistoricalPositions: No transmitter IDs provided.');
    return [];
  }

  const startISO = startDate.toISOString();
  const endISO   = endDate.toISOString();
  console.log('[Firestore] query time range (ISO):', { startISO, endISO });

  // ── 1. Query argos_positions (primary source, always has data) ─────────────
  try {
    let allArgosPositions: any[] = [];

    // Firestore 'in' supports max 30 values; chunk if needed
    for (let i = 0; i < transmitterIds.length; i += 10) {
      const chunk = transmitterIds.slice(i, i + 10);

      // Query per PTT to avoid needing a composite index on 'in' + range
      for (const pttId of chunk) {
        console.log(`[Firestore] Querying argos_positions for PTT: ${pttId}`);
        const q = query(
          collection(db, 'argos_positions'),
          where('platformId', '==', String(pttId)),
          where('timestamp', '>=', startISO),
          where('timestamp', '<=', endISO),
          orderBy('timestamp', 'asc'),
          limit(5000)
        );
        const snap = await getDocs(q);
        console.log(`[Firestore] PTT ${pttId} returned ${snap.size} documents from argos_positions`);
        snap.forEach(docSnap => {
          const d = docSnap.data();
          allArgosPositions.push({
            id: docSnap.id,
            transmitter_id: String(d.platformId || pttId), // normalise field name
            platformId: String(d.platformId || pttId),
            lat: Number(d.lat),
            lon: Number(d.lon),
            timestamp: d.timestamp,
            lc: d.lc || '',
            satellite: d.satellite || '',
            locationType: d.locationType || 'Doppler',
            speed_kmh: d.speed_kmh || 0,
          });
        });
      }
    }

    if (allArgosPositions.length > 0) {
      allArgosPositions.sort((a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );
      console.log(`[Firestore] Loaded ${allArgosPositions.length} historical positions from argos_positions`);
      return allArgosPositions;
    } else {
      console.log('[Firestore] No positions found in argos_positions, falling back to positions.');
    }
  } catch (error) {
    console.warn('[Firestore] argos_positions query failed, falling back to positions:', error);
  }

  // ── 2. Fallback: query processed positions collection ──────────────────────
  try {
    let allPositions: any[] = [];

    for (let i = 0; i < transmitterIds.length; i += 10) {
      const chunk = transmitterIds.slice(i, i + 10);

      for (const pttId of chunk) {
        console.log(`[Firestore] Fallback query: positions for PTT: ${pttId}`);
        const q = query(
          collection(db, 'positions'),
          where('transmitter_id', '==', String(pttId)),
          where('timestamp', '>=', startISO),
          where('timestamp', '<=', endISO),
          orderBy('timestamp', 'asc'),
          limit(5000)
        );
        const snap = await getDocs(q);
        console.log(`[Firestore] Fallback PTT ${pttId} returned ${snap.size} documents from positions`);
        snap.forEach(docSnap => {
          const d = docSnap.data();
          allPositions.push({
            id: docSnap.id,
            ...d,
            transmitter_id: String(d.transmitter_id || pttId),
            lat: Number(d.lat),
            lon: Number(d.lon),
            timestamp: d.timestamp,
            locationType: d.locationType || 'Doppler',
          });
        });
      }
    }

    allPositions.sort((a, b) =>
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
    console.log(`[Firestore] Loaded ${allPositions.length} historical positions from positions (fallback)`);
    return allPositions;
  } catch (error) {
    console.error('[Firestore] Error fetching historical positions fallback:', error);
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
