import { z } from 'zod';
import { 
  collection, doc, getDoc, getDocs, setDoc, deleteDoc, 
  serverTimestamp, writeBatch 
} from 'firebase/firestore';
import { db, auth } from '../../../firebase';
import { Position } from '../../../types';
import { normalizePttId } from './pttNormalizer';

export const PositionSchema = z.object({
  id: z.string().optional(),
  transmitter_id: z.preprocess((v) => normalizePttId(v), z.string().min(1, 'Transmitter ID is required')),
  timestamp: z.string().min(1, 'Timestamp is required'),
  lat: z.number().refine((n) => Math.abs(n) <= 90 && n !== 0, 'Valid latitude required (-90..90, non-zero)'),
  lon: z.number().refine((n) => Math.abs(n) <= 180 && n !== 0, 'Valid longitude required (-180..180, non-zero)'),
  lc: z.enum(['3', '2', '1', '0', 'A', 'B', 'Z']).or(z.string()).default('3'),
  is_kalman: z.boolean().default(false),
  speed_kmh: z.number().default(0),
  course: z.number().default(0),
  satellite: z.string().default('GPS'),
  locationType: z.enum(['GPS', 'Doppler']).optional(),
  messageDate: z.string().optional(),
  locationDate: z.string().optional(),
});

/**
 * Links a transmitter to a bird bidirectionally in Firestore.
 */
export async function linkTransmitterToBird(
  rawPttId: string, 
  birdId: string, 
  birdRing?: string
): Promise<void> {
  const pttId = normalizePttId(rawPttId);
  if (!pttId || !birdId) throw new Error('Both PTT ID and Bird ID are required to link.');

  const txRef = doc(db, 'transmitters', pttId);
  const birdRef = doc(db, 'birds', birdId);
  const uid = auth.currentUser?.uid ?? 'system';

  const batch = writeBatch(db);
  batch.set(txRef, {
    bird_id: birdId,
    assigned_bird_ring: birdRing || null,
    updatedAt: serverTimestamp(),
    updatedBy: uid,
  }, { merge: true });

  batch.set(birdRef, {
    assigned_transmitter_id: pttId,
    updatedAt: serverTimestamp(),
    updatedBy: uid,
  }, { merge: true });

  await batch.commit();
}

/**
 * Unlinks a transmitter from its bird.
 */
export async function unlinkTransmitter(rawPttId: string, birdId?: string): Promise<void> {
  const pttId = normalizePttId(rawPttId);
  if (!pttId) return;

  const txRef = doc(db, 'transmitters', pttId);
  const uid = auth.currentUser?.uid ?? 'system';
  const batch = writeBatch(db);

  batch.set(txRef, {
    bird_id: '',
    assigned_bird_ring: null,
    updatedAt: serverTimestamp(),
    updatedBy: uid,
  }, { merge: true });

  if (birdId) {
    const birdRef = doc(db, 'birds', birdId);
    batch.set(birdRef, {
      assigned_transmitter_id: '',
      updatedAt: serverTimestamp(),
      updatedBy: uid,
    }, { merge: true });
  }

  await batch.commit();
}

/**
 * Saves a single position to Firestore.
 */
export async function savePositionToFirestore(rawInput: unknown): Promise<Position> {
  const parsed = PositionSchema.parse(rawInput);
  const posId = parsed.id || `pos-${parsed.transmitter_id}-${new Date(parsed.timestamp).getTime()}`;
  const posRef = doc(db, 'positions', posId);

  const payload: Record<string, any> = {
    ...parsed,
    id: posId,
    createdAt: serverTimestamp(),
  };

  await setDoc(posRef, payload, { merge: true });
  return { ...parsed, id: posId } as Position;
}
