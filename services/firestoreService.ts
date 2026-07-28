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

export const loadLatestPositionsPerTransmitter = async (transmitterIds: string[]) => {
  try {
    const promises: Promise<any>[] = [];
    
    transmitterIds.forEach(rawId => {
      const id = String(rawId);
      
      const p1 = getDocs(query(
        collection(db, 'positions'),
        where('transmitter_id', '==', id),
        orderBy('timestamp', 'desc'),
        limit(5)
      )).then(snap => snap.docs.map(d => ({ id: d.id, ...d.data() })));

      const p2 = getDocs(query(
        collection(db, 'argos_positions'),
        where('platformId', '==', id),
        orderBy('timestamp', 'desc'),
        limit(5)
      )).then(snap => snap.docs.map(d => {
        const data = d.data();
        let numLon = Number(data.lon);
        if (id === '242086' && !isNaN(numLon) && numLon < 0) {
          numLon = Math.abs(numLon);
        }
        return {
          id: d.id,
          transmitter_id: String(data.platformId || id),
          timestamp: data.timestamp,
          lat: Number(data.lat),
          lon: numLon,
          lc: data.lc || 'Z',
          is_kalman: false,
          speed_kmh: 0,
          course: 0,
          satellite: data.satellite || 'UNK',
          locationType: data.locationType || 'Doppler'
        };
      }));

      promises.push(Promise.all([p1, p2]).then(([posList, argosList]) => {
        const combined: any[] = [...posList, ...argosList].filter((item: any) => {
          const numLat = Number(item.lat);
          const numLon = Number(item.lon);
          return !isNaN(numLat) && !isNaN(numLon) && numLat !== 0 && numLon !== 0 && (Math.abs(numLat) > 0.0001 || Math.abs(numLon) > 0.0001);
        });
        if (combined.length === 0) return null;

        combined.sort((a: any, b: any) => {
          const tsA = safeParseDate(a.timestamp);
          const tsB = safeParseDate(b.timestamp);
          return (isNaN(tsB) ? 0 : tsB) - (isNaN(tsA) ? 0 : tsA);
        });

        const best: any = combined[0];
        if (String(best.transmitter_id) === '242086' && Number(best.lon) < 0) {
          best.lon = Math.abs(Number(best.lon));
        }

        return best;
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

      // ── Primary: query argos_positions (limit 5000 per PTT to cap reads) ──
      try {
        const qArgos = query(
          collection(db, 'argos_positions'),
          where('platformId', '==', pidStr),
          limit(5000)
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
            where('transmitter_id', '==', pidStr),
            limit(5000)
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
