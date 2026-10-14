import * as XLSX from 'xlsx';
import { z } from 'zod';
import {
  collection, doc, getDocs, writeBatch, serverTimestamp,
} from 'firebase/firestore';
import { db, auth } from '../../../firebase';
import { normalizePttId } from './pttNormalizer';
import { Transmitter, Bird } from '../../../types';

const STATUS = ['Active', 'Inactive', 'Dead', 'Static test'] as const;
const MAX_ROWS = 500;
const CHUNK = 400; // Firestore batch limit is 500 ops; keep headroom

const str = z.preprocess((v) => (v == null ? '' : String(v).trim()), z.string());
const optNum = z.preprocess(
  (v) => (v === '' || v == null ? undefined : Number(v)),
  z.number().finite().optional()
);
const optDate = z.preprocess(
  (v) => {
    if (v == null || v === '') return undefined;
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    const s = String(v).trim();
    const dmy = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
    return s;
  },
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').optional()
);

export const TransmitterRowSchema = z.object({
  ptt_id: str.pipe(z.string().regex(/^\d{3,10}$/, 'PTT ID must be 3-10 digits')),
  transmitter_model: str.pipe(z.string().min(1, 'Model is required')),
  manufacturer: str.optional(),
  serial_number: str.optional(),
  weight_g: optNum,
  status: str.refine((v): v is typeof STATUS[number] => STATUS.includes(v as any), {
    message: `Must be one of: ${STATUS.join(', ')}`,
  }),
  duty_cycle: str.optional(),
  deployment_date: optDate,
  bird_ring_number: str.optional(),
  species: str.optional(),
  sex: str.optional(),
  origin: str.optional(),
  release_lat: optNum.refine((n) => n === undefined || Math.abs(n) <= 90, 'Latitude must be between -90 and 90'),
  release_lon: optNum.refine((n) => n === undefined || Math.abs(n) <= 180, 'Longitude must be between -180 and 180'),
  notes: str.optional(),
});

export interface RowError {
  row: number;
  ptt_id?: string;
  messages: string[];
}

export interface BulkResult {
  created: number;
  updated: number;
  skippedDuplicates: number;
  linkedBirds: number;
  unlinkedRings: string[];
  errors: RowError[];
}

export async function parseTransmitterWorkbook(file: File) {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array', cellDates: true });
  const ws = wb.Sheets['Transmitters'] ?? wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '', raw: false, dateNF: 'yyyy-mm-dd' });
  
  // Clean headers (remove trailing asterisk from required fields)
  const clean = raw.map((r) =>
    Object.fromEntries(Object.entries(r).map(([k, v]) => [k.replace(/\s*\*\s*$/, '').trim().toLowerCase().replace(/\s+/g, '_'), v]))
  );

  // Normalize field aliases
  const normalized = clean.map((r: any) => ({
    ptt_id: normalizePttId(r.ptt_id || r.platform_id || r.id || r['device_id'] || r['transmitter_id']),
    transmitter_model: r.transmitter_model || r.model || 'Unknown',
    manufacturer: r.manufacturer || '',
    serial_number: r.serial_number || r.serial || '',
    weight_g: r.weight_g || r.weight || undefined,
    status: r.status ? (r.status.charAt(0).toUpperCase() + r.status.slice(1).toLowerCase()) : 'Active',
    duty_cycle: r.duty_cycle || 'Unknown',
    deployment_date: r.deployment_date || r.release_date || undefined,
    bird_ring_number: r.bird_ring_number || r.ring_id || r.ring_number || '',
    species: r.species || 'Houbara Bustard',
    sex: r.sex || 'M',
    origin: r.origin || 'Wild',
    release_lat: r.release_lat || r.lat || r.latitude || undefined,
    release_lon: r.release_lon || r.lon || r.longitude || undefined,
    notes: r.notes || r.comment || '',
  }));

  if (normalized.length > MAX_ROWS) {
    throw new Error(`Max ${MAX_ROWS} rows per upload (found ${normalized.length}).`);
  }
  return normalized;
}

export async function bulkUploadTransmitters(
  file: File,
  opts: { updateExisting: boolean; dryRun?: boolean; onProgress?: (msg: string) => void }
): Promise<BulkResult> {
  const result: BulkResult = {
    created: 0,
    updated: 0,
    skippedDuplicates: 0,
    linkedBirds: 0,
    unlinkedRings: [],
    errors: [],
  };

  opts.onProgress?.('Parsing Excel file...');
  const rows = await parseTransmitterWorkbook(file);

  // 1. Validate rows; skip sample/example row
  const valid: { rowNo: number; data: z.infer<typeof TransmitterRowSchema> }[] = [];
  const seen = new Set<string>();

  rows.forEach((r, i) => {
    const rowNo = i + 2;
    if (String(r.notes ?? '').toLowerCase().startsWith('example') || String(r.ptt_id) === '244289_example') {
      return;
    }
    const p = TransmitterRowSchema.safeParse(r);
    if (!p.success) {
      result.errors.push({
        row: rowNo,
        ptt_id: String(r.ptt_id ?? ''),
        messages: p.error.issues.map((x) => `${x.path.join('.')}: ${x.message}`),
      });
      return;
    }
    if (seen.has(p.data.ptt_id)) {
      result.errors.push({
        row: rowNo,
        ptt_id: p.data.ptt_id,
        messages: ['Duplicate PTT ID inside the file'],
      });
      return;
    }
    seen.add(p.data.ptt_id);
    valid.push({ rowNo, data: p.data });
  });

  opts.onProgress?.(`Validated ${valid.length} rows (${result.errors.length} validation errors).`);

  // 2. Check which PTTs already exist in Firestore
  const existingSnap = await getDocs(collection(db, 'transmitters'));
  const existingIds = new Set<string>();
  existingSnap.forEach((d) => {
    const pid = normalizePttId(d.data().platform_id || d.id);
    if (pid) existingIds.add(pid);
  });

  // 3. Resolve bird links by ring number
  const birdsSnap = await getDocs(collection(db, 'birds'));
  const birdByRing = new Map<string, Bird>();
  birdsSnap.forEach((d) => {
    const b = { id: d.id, ...d.data() } as Bird;
    const ring = (b.ring_id || '').trim();
    if (ring && ring !== 'NA' && ring !== 'N/A') {
      birdByRing.set(ring, b);
    }
  });

  if (opts.dryRun) {
    valid.forEach((v) => {
      const pid = v.data.ptt_id;
      const exists = existingIds.has(pid);
      if (exists) {
        if (opts.updateExisting) result.updated++;
        else result.skippedDuplicates++;
      } else {
        result.created++;
      }

      if (v.data.bird_ring_number) {
        if (birdByRing.has(v.data.bird_ring_number)) {
          result.linkedBirds++;
        } else if (!result.unlinkedRings.includes(v.data.bird_ring_number)) {
          result.unlinkedRings.push(v.data.bird_ring_number);
        }
      }
    });
    return result;
  }

  // 4. Batch write to Firestore (Batches <= 400)
  const uid = auth.currentUser?.uid ?? 'system';

  for (let i = 0; i < valid.length; i += CHUNK) {
    const slice = valid.slice(i, i + CHUNK);
    const batch = writeBatch(db);
    let c = 0;
    let u = 0;
    let s = 0;
    let l = 0;

    for (const { data } of slice) {
      const exists = existingIds.has(data.ptt_id);
      if (exists && !opts.updateExisting) {
        s++;
        continue;
      }

      const matchedBird = data.bird_ring_number ? birdByRing.get(data.bird_ring_number) : undefined;
      if (matchedBird) {
        l++;
      } else if (data.bird_ring_number && !result.unlinkedRings.includes(data.bird_ring_number)) {
        result.unlinkedRings.push(data.bird_ring_number);
      }

      const docId = data.ptt_id;
      const payload: Record<string, any> = {
        id: docId,
        platform_id: data.ptt_id,
        model: data.transmitter_model,
        manufacturer: data.manufacturer || null,
        serial_number: data.serial_number || null,
        weight_g: data.weight_g ?? null,
        status: data.status,
        derived_status: data.status,
        duty_cycle: data.duty_cycle || 'Unknown',
        deployment_date: data.deployment_date || null,
        bird_id: matchedBird?.id || '',
        assigned_bird_ring: data.bird_ring_number || null,
        species: data.species || 'Houbara Bustard',
        sex: data.sex || 'M',
        origin: data.origin || 'Wild',
        lat: data.release_lat ?? null,
        lon: data.release_lon ?? null,
        latitude: data.release_lat ?? null,
        longitude: data.release_lon ?? null,
        notes: data.notes || null,
        deployed: data.status === 'Active',
        last_fix: data.deployment_date ? new Date(data.deployment_date).toISOString() : new Date().toISOString(),
        updatedAt: serverTimestamp(),
        updatedBy: uid,
        ...(exists ? {} : { createdAt: serverTimestamp(), createdBy: uid, source: 'bulk-upload' }),
      };

      // Remove undefined values
      Object.keys(payload).forEach((k) => {
        if (payload[k] === undefined) delete payload[k];
      });

      batch.set(doc(db, 'transmitters', docId), payload, { merge: true });

      // If matched bird exists, link it
      if (matchedBird) {
        batch.set(doc(db, 'birds', matchedBird.id), {
          assigned_transmitter_id: data.ptt_id,
          updatedAt: serverTimestamp(),
        }, { merge: true });
      }

      exists ? u++ : c++;
    }

    try {
      await batch.commit();
      result.created += c;
      result.updated += u;
      result.skippedDuplicates += s;
      result.linkedBirds += l;
    } catch (e: any) {
      slice.forEach(({ rowNo, data }) => {
        result.errors.push({
          row: rowNo,
          ptt_id: data.ptt_id,
          messages: [`Write chunk failed: ${e?.message || e}`],
        });
      });
    }
  }

  return result;
}
