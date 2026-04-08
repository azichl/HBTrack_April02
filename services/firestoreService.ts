import { 
  collection, doc, setDoc, getDocs, onSnapshot, query, deleteDoc, 
  writeBatch, where, orderBy, limit, startAfter, getCountFromServer,
  DocumentSnapshot
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
    console.error(`[Firestore] Listener error on ${collectionName}:`, error);
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

/**
 * Delete all argos_positions (with optional platformId filter)
 */
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
  } catch (error) {
    console.error('[Firestore] Error deleting argos_positions:', error);
    return 0;
  }
};

// ─── Position-Specific Operations ─────────────────────────────────────────────

/** Fetch historical positions for specific transmitters within a date range */
export const getHistoricalPositions = async (transmitterIds: string[], startDate: Date, endDate: Date) => {
  if (!transmitterIds || transmitterIds.length === 0) return [];
  
  try {
    const chunks = [];
    for (let i = 0; i < transmitterIds.length; i += 10) {
      chunks.push(transmitterIds.slice(i, i + 10));
    }

    let allPositions: any[] = [];
    const startISO = startDate.toISOString();
    const endISO = endDate.toISOString();

    for (const chunk of chunks) {
      const q = query(
        collection(db, 'positions'),
        where('transmitter_id', 'in', chunk),
        where('timestamp', '>=', startISO),
        where('timestamp', '<=', endISO)
      );
      
      const snapshot = await getDocs(q);
      snapshot.forEach(doc => {
        allPositions.push({ id: doc.id, ...doc.data() });
      });
    }

    allPositions.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    return allPositions;
  } catch (error) {
    console.error('[Firestore] Error fetching historical positions:', error);
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
