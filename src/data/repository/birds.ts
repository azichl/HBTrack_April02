import { z } from 'zod';
import { 
  collection, doc, getDoc, getDocs, setDoc, deleteDoc, 
  serverTimestamp 
} from 'firebase/firestore';
import { db, auth } from '../../../firebase';
import { Bird } from '../../../types';

export const BirdSchema = z.object({
  id: z.string().optional(),
  ring_id: z.preprocess(
    (v) => (v == null || v === '' ? 'NA' : String(v).trim()),
    z.string()
  ),
  species: z.preprocess(
    (v) => (v == null || v === '' ? 'Houbara Bustard' : String(v).trim()),
    z.string()
  ),
  sex: z.preprocess(
    (v) => {
      const s = String(v || 'M').trim().toUpperCase();
      return s === 'F' ? 'F' : 'M';
    },
    z.enum(['M', 'F'])
  ),
  origin: z.preprocess((v) => (v == null ? 'Wild' : String(v).trim()), z.string()).optional(),
  darvic_number: z.string().optional(),
  hatch_date: z.string().optional(),
  release_date: z.string().optional(),
  release_location: z.preprocess((v) => (v == null ? '' : String(v).trim()), z.string()),
  release_lat: z.preprocess((v) => (v == null ? '' : String(v).trim()), z.string()),
  release_lon: z.preprocess((v) => (v == null ? '' : String(v).trim()), z.string()),
  assigned_transmitter_id: z.preprocess((v) => (v == null ? '' : String(v).trim()), z.string()).optional(),
});

export type ValidatedBirdInput = z.infer<typeof BirdSchema>;

/**
 * Creates or updates a bird in Firestore.
 * Always awaited, validated by Zod, returns full Bird.
 */
export async function saveBirdToFirestore(rawInput: unknown): Promise<Bird> {
  const parsed = BirdSchema.parse(rawInput);
  const rawRid = parsed.ring_id || 'NA';
  const isNA = !rawRid || rawRid.toUpperCase() === 'NA' || rawRid.toUpperCase() === 'N/A';

  // Determine doc ID
  let docId = parsed.id;
  if (!docId || docId === 'bird-NA') {
    if (isNA) {
      docId = `bird-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    } else {
      const cleanRid = rawRid.replace(/^bird-/, '').trim();
      docId = `bird-${cleanRid}`;
    }
  }

  const docRef = doc(db, 'birds', docId);
  const existingSnap = await getDoc(docRef);
  const exists = existingSnap.exists();
  const uid = auth.currentUser?.uid ?? 'system';

  const payload: Record<string, any> = {
    ...parsed,
    id: docId,
    ring_id: rawRid,
    updatedAt: serverTimestamp(),
    updatedBy: uid,
  };

  if (!exists) {
    payload.createdAt = serverTimestamp();
    payload.createdBy = uid;
  }

  Object.keys(payload).forEach((k) => {
    if (payload[k] === undefined) delete payload[k];
  });

  await setDoc(docRef, payload, { merge: true });

  return {
    ...parsed,
    id: docId,
    ring_id: rawRid,
  } as Bird;
}

/**
 * Updates an existing bird in Firestore.
 */
export async function updateBirdInFirestore(id: string, updates: Partial<Bird>): Promise<void> {
  if (!id) throw new Error('Bird ID is required for update');

  const docRef = doc(db, 'birds', id);
  const uid = auth.currentUser?.uid ?? 'system';

  const cleanUpdates: Record<string, any> = {
    ...updates,
    id,
    updatedAt: serverTimestamp(),
    updatedBy: uid,
  };

  Object.keys(cleanUpdates).forEach((k) => {
    if (cleanUpdates[k] === undefined) delete cleanUpdates[k];
  });

  await setDoc(docRef, cleanUpdates, { merge: true });
}

/**
 * Deletes a bird doc from Firestore.
 */
export async function deleteBirdFromFirestore(id: string): Promise<void> {
  if (!id) return;
  await deleteDoc(doc(db, 'birds', id));
}

import { trackedGetDocs } from '../../perf/firestoreTracked';

/**
 * Loads all birds without orderBy restrictions so newly created docs are never excluded.
 */
export async function fetchAllBirdsFromFirestore(): Promise<Bird[]> {
  const snap = await trackedGetDocs('birds (fetchAllBirds)', collection(db, 'birds'));
  const list: Bird[] = [];


  snap.forEach((d) => {
    const data = d.data();
    list.push({
      id: d.id,
      ring_id: data.ring_id || 'NA',
      species: data.species || 'Houbara Bustard',
      sex: data.sex === 'F' ? 'F' : 'M',
      origin: data.origin || 'Wild',
      darvic_number: data.darvic_number || '',
      hatch_date: data.hatch_date || '',
      release_date: data.release_date || '',
      release_location: data.release_location || '',
      release_lat: data.release_lat ? String(data.release_lat) : '',
      release_lon: data.release_lon ? String(data.release_lon) : '',
      assigned_transmitter_id: data.assigned_transmitter_id ? String(data.assigned_transmitter_id) : '',
    });
  });

  return list;
}
