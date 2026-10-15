import { z } from 'zod';
import { 
  collection, doc, getDoc, getDocs, setDoc, deleteDoc, 
  serverTimestamp, writeBatch 
} from 'firebase/firestore';
import { db, auth } from '../../../firebase';
import { Transmitter } from '../../../types';
import { normalizePttId } from './pttNormalizer';

export const TRANSMITTER_STATUSES = ['Active', 'Inactive', 'Dead', 'Static test'] as const;

export const TransmitterSchema = z.object({
  id: z.string().optional(),
  platform_id: z.preprocess((v) => normalizePttId(v), z.string().min(1, 'PTT ID is required')),
  model: z.preprocess((v) => (v == null || v === '' ? 'Unknown' : String(v).trim()), z.string()),
  status: z.preprocess(
    (v) => (v == null || v === '' ? 'Active' : String(v).trim()),
    z.string()
  ),
  derived_status: z.enum(['Active', 'Potential Mortality', 'Inactive', 'Static test', 'Dead']).optional(),
  manual_status_override: z.enum(['Dead']).nullable().optional(),
  manual_status_set_by: z.string().optional(),
  manual_status_set_at: z.string().optional(),
  inactive_since: z.string().optional(),
  bird_id: z.preprocess((v) => (v == null ? '' : String(v).trim()), z.string()),
  battery_voltage: z.preprocess(
    (v) => (v === '' || v == null ? undefined : Number(v)),
    z.number().finite().optional()
  ),
  last_fix: z.preprocess(
    (v) => (v == null || v === '' ? new Date().toISOString() : String(v)),
    z.string()
  ),
  duty_cycle: z.preprocess((v) => (v == null || v === '' ? 'Unknown' : String(v).trim()), z.string()),
  frequency: z.string().optional(),
  hex_id: z.string().optional(),
  manufacturer: z.string().optional(),
  program_region: z.string().optional(),
  site_location: z.string().optional(),
  satellite_time: z.string().optional(),
  radio_time: z.string().optional(),
  comment: z.string().optional(),
  deployed: z.boolean().default(true),
  assigned_bird_ring: z.string().optional(),
  lat: z.preprocess((v) => (v === '' || v == null ? undefined : Number(v)), z.number().finite().optional()),
  lon: z.preprocess((v) => (v === '' || v == null ? undefined : Number(v)), z.number().finite().optional()),
  latitude: z.preprocess((v) => (v === '' || v == null ? undefined : Number(v)), z.number().finite().optional()),
  longitude: z.preprocess((v) => (v === '' || v == null ? undefined : Number(v)), z.number().finite().optional()),
  last_latitude: z.preprocess((v) => (v === '' || v == null ? undefined : Number(v)), z.number().finite().optional()),
  last_longitude: z.preprocess((v) => (v === '' || v == null ? undefined : Number(v)), z.number().finite().optional()),
});

export type ValidatedTransmitterInput = z.infer<typeof TransmitterSchema>;

/**
 * Creates or updates a transmitter document in Firestore.
 * Always awaited, validated by Zod, doc ID = pttId string.
 */
export async function saveTransmitterToFirestore(rawInput: unknown): Promise<Transmitter> {
  const parsed = TransmitterSchema.parse(rawInput);
  const pttId = parsed.platform_id;
  const docRef = doc(db, 'transmitters', pttId);

  const existingSnap = await getDoc(docRef);
  const exists = existingSnap.exists();
  const uid = auth.currentUser?.uid ?? 'system';

  const payload: Record<string, any> = {
    ...parsed,
    id: pttId,
    platform_id: pttId,
    updatedAt: serverTimestamp(),
    updatedBy: uid,
  };

  if (!exists) {
    payload.createdAt = serverTimestamp();
    payload.createdBy = uid;
  }

  // Remove undefined keys before writing to Firestore
  Object.keys(payload).forEach((k) => {
    if (payload[k] === undefined) delete payload[k];
  });

  await setDoc(docRef, payload, { merge: true });

  // Clean up legacy prefixed document 'trans-${pttId}' if it exists to avoid split-brain
  if (pttId) {
    const legacyRef = doc(db, 'transmitters', `trans-${pttId}`);
    try {
      const legacySnap = await getDoc(legacyRef);
      if (legacySnap.exists()) {
        await deleteDoc(legacyRef);
      }
    } catch {
      // Ignore legacy cleanup error
    }
  }

  return {
    ...parsed,
    id: pttId,
    platform_id: pttId,
  } as Transmitter;
}

/**
 * Updates specific fields on an existing transmitter.
 */
export async function updateTransmitterInFirestore(
  rawPttId: string, 
  updates: Partial<Transmitter>
): Promise<void> {
  const pttId = normalizePttId(rawPttId);
  if (!pttId) throw new Error('Valid PTT ID is required for update');

  const docRef = doc(db, 'transmitters', pttId);
  const uid = auth.currentUser?.uid ?? 'system';

  const cleanUpdates: Record<string, any> = {
    ...updates,
    platform_id: pttId,
    id: pttId,
    updatedAt: serverTimestamp(),
    updatedBy: uid,
  };

  Object.keys(cleanUpdates).forEach((k) => {
    if (cleanUpdates[k] === undefined) delete cleanUpdates[k];
  });

  await setDoc(docRef, cleanUpdates, { merge: true });
}

/**
 * Deletes a transmitter doc and any legacy trans- prefixed counterpart.
 */
export async function deleteTransmitterFromFirestore(rawPttId: string): Promise<void> {
  const pttId = normalizePttId(rawPttId);
  if (!pttId) return;

  const docRef = doc(db, 'transmitters', pttId);
  const legacyRef = doc(db, 'transmitters', `trans-${pttId}`);

  await Promise.allSettled([
    deleteDoc(docRef),
    deleteDoc(legacyRef)
  ]);
}

import { trackedGetDocs } from '../../perf/firestoreTracked';

/**
 * Loads all transmitters without orderBy restrictions so newly created docs are never excluded.
 */
export async function fetchAllTransmittersFromFirestore(): Promise<Transmitter[]> {
  const snap = await trackedGetDocs('transmitters (fetchAllTransmitters)', collection(db, 'transmitters'));
  const list: Transmitter[] = [];

  const seenPtt = new Set<string>();

  snap.forEach((d) => {
    const data = d.data();
    const pid = normalizePttId(data.platform_id || d.id);
    if (!pid || seenPtt.has(pid)) return;
    seenPtt.add(pid);

    list.push({
      id: pid,
      platform_id: pid,
      model: data.model || 'Unknown',
      status: data.status || 'Active',
      derived_status: data.derived_status || data.status || 'Active',
      manual_status_override: data.manual_status_override ?? null,
      manual_status_set_by: data.manual_status_set_by,
      manual_status_set_at: data.manual_status_set_at,
      inactive_since: data.inactive_since,
      bird_id: data.bird_id ? String(data.bird_id) : '',
      battery_voltage: typeof data.battery_voltage === 'number' ? data.battery_voltage : undefined,
      last_fix: data.last_fix || '',
      duty_cycle: data.duty_cycle || 'Unknown',
      frequency: data.frequency,
      hex_id: data.hex_id,
      manufacturer: data.manufacturer,
      program_region: data.program_region,
      site_location: data.site_location,
      satellite_time: data.satellite_time,
      radio_time: data.radio_time,
      comment: data.comment,
      deployed: data.deployed !== false,
      assigned_bird_ring: data.assigned_bird_ring,
      lat: typeof data.lat === 'number' ? data.lat : undefined,
      lon: typeof data.lon === 'number' ? data.lon : undefined,
      latitude: typeof data.latitude === 'number' ? data.latitude : undefined,
      longitude: typeof data.longitude === 'number' ? data.longitude : undefined,
    });
  });

  return list;
}
