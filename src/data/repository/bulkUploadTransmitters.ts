import * as XLSX from 'xlsx';
import { z } from 'zod';
import {
  collection, doc, getDocs, writeBatch, serverTimestamp,
} from 'firebase/firestore';
import { db, auth } from '../../../firebase';
import { normalizePttId } from './pttNormalizer';
import { Transmitter, Bird } from '../../../types';

const STATUS = ['Active', 'Inactive', 'Dead', 'Static test', 'Potential Mortality'] as const;
const MAX_ROWS = 500;
const CHUNK = 400; // Firestore batch limit is 500 ops; keep headroom

const str = z.preprocess((v) => (v == null ? '' : String(v).trim()), z.string());
const optNum = z.preprocess(
  (v) => (v === '' || v == null ? undefined : Number(v)),
  z.number().finite().optional()
);
const optBool = z.preprocess((v) => {
  if (v == null || v === '') return undefined;
  if (typeof v === 'boolean') return v;
  const s = String(v).trim().toLowerCase();
  if (['true', 'yes', 'y', '1', 'deployed'].includes(s)) return true;
  if (['false', 'no', 'n', '0'].includes(s)) return false;
  return undefined;
}, z.boolean().optional());

const optDate = z.preprocess(
  (v) => {
    if (v == null || v === '') return undefined;
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    if (typeof v === 'number' && !isNaN(v)) {
      const d = XLSX.SSF.parse_date_code(v);
      if (d) {
        const mm = String(d.m).padStart(2, '0');
        const dd = String(d.d).padStart(2, '0');
        return `${d.y}-${mm}-${dd}`;
      }
    }
    const s = String(v).trim();
    const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (dmy) {
      const dd = dmy[1].padStart(2, '0');
      const mm = dmy[2].padStart(2, '0');
      return `${dmy[3]}-${mm}-${dd}`;
    }
    const ymd = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (ymd) {
      const mm = ymd[2].padStart(2, '0');
      const dd = ymd[3].padStart(2, '0');
      return `${ymd[1]}-${mm}-${dd}`;
    }
    return s;
  },
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').optional()
);

export const TransmitterRowSchema = z.object({
  // Transmitters Table Info
  ptt_id: str.pipe(z.string().regex(/^\d{3,10}$/, 'PTT ID must be 3-10 digits')),
  frequency: str.optional(),
  hex_id: str.optional(),
  transmitter_model: str.pipe(z.string().min(1, 'Model is required')),
  manufacturer: str.optional(),
  serial_number: str.optional(),
  weight_g: optNum,
  reception_date: optDate,
  status: str.refine((v): v is typeof STATUS[number] => {
    const lower = v.toLowerCase();
    return STATUS.some((s) => s.toLowerCase() === lower);
  }, {
    message: `Must be one of: ${STATUS.join(', ')}`,
  }),
  deployed: optBool,
  site_location: str.optional(),
  program_region: str.optional(),
  satellite_time: str.optional(),
  radio_time: str.optional(),
  duty_cycle: str.optional(),
  deployment_date: optDate,
  notes: str.optional(),
  comment: str.optional(),

  // Birds Table Info
  bird_ring_number: str.optional(),
  darvic_number: str.optional(),
  species: str.optional(),
  sex: str.optional(),
  origin: str.optional(),
  hatch_date: optDate,
  release_date: optDate,
  release_location: str.optional(),
  release_lat: optNum.refine((n) => n === undefined || Math.abs(n) <= 90, 'Latitude must be between -90 and 90'),
  release_lon: optNum.refine((n) => n === undefined || Math.abs(n) <= 180, 'Longitude must be between -180 and 180'),
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
  createdBirds: number;
  unlinkedRings: string[];
  errors: RowError[];
}

export async function parseTransmitterWorkbook(file: File) {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array', cellDates: true });
  const ws = wb.Sheets['Transmitters'] ?? wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '', raw: false, dateNF: 'yyyy-mm-dd' });
  
  // Clean headers (remove trailing asterisk, spaces, and punctuation)
  const clean = raw.map((r) =>
    Object.fromEntries(
      Object.entries(r).map(([k, v]) => [
        k.replace(/\s*\*\s*$/, '').trim().toLowerCase().replace(/[\s\-_]+/g, '_'),
        v
      ])
    )
  );

  // Normalize status string to canonical case
  const normalizeStatus = (rawStatus: any): string => {
    if (!rawStatus) return 'Active';
    const s = String(rawStatus).trim().toLowerCase();
    const found = STATUS.find((st) => st.toLowerCase() === s);
    return found || 'Active';
  };

  // Normalize field aliases
  const normalized = clean.map((r: any) => {
    const rawStatus = r.status || r.current_status || 'Active';
    const canonicalStatus = normalizeStatus(rawStatus);

    return {
      // Transmitter fields
      ptt_id: normalizePttId(r.ptt_id || r.platform_id || r.id || r['device_id'] || r['transmitter_id']),
      frequency: r.frequency || r.freq || '',
      hex_id: r.hex_id || r.hex || r.hexid || '',
      transmitter_model: r.transmitter_model || r.model || 'Unknown',
      manufacturer: r.manufacturer || r.origin_company || r.company || r.make || '',
      serial_number: r.serial_number || r.serial || r.sn || '',
      weight_g: r.weight_g || r.weight || undefined,
      reception_date: r.reception_date || r.reception || r.date_reception || r.received_date || r.receipt_date || undefined,
      status: canonicalStatus,
      deployed: r.deployed !== undefined && r.deployed !== '' ? r.deployed : undefined,
      site_location: r.site_location || r.site || r.release_site || r.location || '',
      program_region: r.program_region || r.region || '',
      satellite_time: r.satellite_time || r.sat_time || r.duty_cycle || '',
      radio_time: r.radio_time || r.vhf_time || r.radio || '',
      duty_cycle: r.duty_cycle || r.satellite_time || 'Unknown',
      deployment_date: r.deployment_date || r.release_date || undefined,
      notes: r.notes || r.comment || r.comments || '',
      comment: r.comment || r.notes || r.comments || '',

      // Bird fields
      bird_ring_number: r.bird_ring_number || r.ring_id || r.ring_number || r.ring || '',
      darvic_number: r.darvic_number || r.darvic || r.darvic_no || '',
      species: r.species || r.bird_species || 'Houbara Bustard',
      sex: r.sex || r.gender || 'M',
      origin: r.origin || 'Wild',
      hatch_date: r.hatch_date || r.date_hatch || undefined,
      release_date: r.release_date || r.deployment_date || undefined,
      release_location: r.release_location || r.release_site || r.site_location || '',
      release_lat: r.release_lat || r.lat || r.latitude || undefined,
      release_lon: r.release_lon || r.lon || r.longitude || undefined,
    };
  });

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
    createdBirds: 0,
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
    if (ring && ring.toUpperCase() !== 'NA' && ring.toUpperCase() !== 'N/A') {
      birdByRing.set(ring, b);
    }
  });

  if (opts.dryRun) {
    const previewCreatedBirds = new Set<string>();
    valid.forEach((v) => {
      const pid = v.data.ptt_id;
      const exists = existingIds.has(pid);
      if (exists) {
        if (opts.updateExisting) result.updated++;
        else result.skippedDuplicates++;
      } else {
        result.created++;
      }

      const ring = (v.data.bird_ring_number || '').trim();
      if (ring && ring.toUpperCase() !== 'NA' && ring.toUpperCase() !== 'N/A') {
        if (birdByRing.has(ring)) {
          result.linkedBirds++;
        } else if (!previewCreatedBirds.has(ring)) {
          previewCreatedBirds.add(ring);
          result.createdBirds++;
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
    let cb = 0;

    for (const { data } of slice) {
      const exists = existingIds.has(data.ptt_id);
      if (exists && !opts.updateExisting) {
        s++;
        continue;
      }

      const ring = (data.bird_ring_number || '').trim();
      const hasRing = ring && ring.toUpperCase() !== 'NA' && ring.toUpperCase() !== 'N/A';
      let matchedBird = hasRing ? birdByRing.get(ring) : undefined;
      let birdDocId = matchedBird?.id || '';

      // If bird does not exist in Firestore but a valid ring was supplied, create the bird record
      if (hasRing && !matchedBird) {
        birdDocId = `bird-${ring.replace(/^bird-/, '').trim()}`;
        const newBird: Record<string, any> = {
          id: birdDocId,
          ring_id: ring,
          darvic_number: data.darvic_number || null,
          species: data.species || 'Houbara Bustard',
          sex: (data.sex?.toUpperCase().startsWith('F') ? 'F' : 'M') as 'M' | 'F',
          origin: (data.origin?.toLowerCase().includes('wild') ? 'Wild' : 'Breeding'),
          hatch_date: data.hatch_date || null,
          release_date: data.release_date || data.deployment_date || new Date().toISOString().slice(0, 10),
          release_location: data.release_location || data.site_location || 'Unknown',
          release_lat: data.release_lat != null ? String(data.release_lat) : '',
          release_lon: data.release_lon != null ? String(data.release_lon) : '',
          assigned_transmitter_id: data.ptt_id,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          createdBy: uid,
          updatedBy: uid,
        };

        Object.keys(newBird).forEach((k) => {
          if (newBird[k] === undefined) delete newBird[k];
        });

        batch.set(doc(db, 'birds', birdDocId), newBird, { merge: true });
        birdByRing.set(ring, newBird as unknown as Bird);
        cb++;
      } else if (matchedBird) {
        l++;
        // Update existing bird with transmitter and any provided bird details
        const birdUpdates: Record<string, any> = {
          assigned_transmitter_id: data.ptt_id,
          updatedAt: serverTimestamp(),
          updatedBy: uid,
        };
        if (data.darvic_number) birdUpdates.darvic_number = data.darvic_number;
        if (data.species) birdUpdates.species = data.species;
        if (data.sex) birdUpdates.sex = (data.sex.toUpperCase().startsWith('F') ? 'F' : 'M');
        if (data.origin) birdUpdates.origin = data.origin.toLowerCase().includes('wild') ? 'Wild' : 'Breeding';
        if (data.hatch_date) birdUpdates.hatch_date = data.hatch_date;
        if (data.release_date || data.deployment_date) {
          birdUpdates.release_date = data.release_date || data.deployment_date;
        }
        if (data.release_location || data.site_location) {
          birdUpdates.release_location = data.release_location || data.site_location;
        }
        if (data.release_lat != null) birdUpdates.release_lat = String(data.release_lat);
        if (data.release_lon != null) birdUpdates.release_lon = String(data.release_lon);

        batch.set(doc(db, 'birds', matchedBird.id), birdUpdates, { merge: true });
      }

      const isDeployed = data.deployed !== undefined ? data.deployed : (data.status === 'Active');
      const docId = data.ptt_id;
      const payload: Record<string, any> = {
        id: docId,
        platform_id: data.ptt_id,
        frequency: data.frequency || null,
        hex_id: data.hex_id || null,
        model: data.transmitter_model,
        manufacturer: data.manufacturer || null,
        serial_number: data.serial_number || null,
        weight_g: data.weight_g ?? null,
        reception_date: data.reception_date || null,
        status: data.status,
        derived_status: data.status,
        deployed: isDeployed,
        site_location: data.site_location || data.release_location || null,
        program_region: data.program_region || null,
        satellite_time: data.satellite_time || data.duty_cycle || null,
        radio_time: data.radio_time || null,
        duty_cycle: data.duty_cycle || data.satellite_time || 'Unknown',
        deployment_date: data.deployment_date || data.release_date || null,
        bird_id: birdDocId || '',
        assigned_bird_ring: ring || null,
        species: data.species || 'Houbara Bustard',
        sex: (data.sex?.toUpperCase().startsWith('F') ? 'F' : 'M'),
        origin: data.origin || 'Wild',
        lat: data.release_lat ?? null,
        lon: data.release_lon ?? null,
        latitude: data.release_lat ?? null,
        longitude: data.release_lon ?? null,
        notes: data.notes || data.comment || null,
        comment: data.comment || data.notes || null,
        last_fix: data.deployment_date 
          ? new Date(data.deployment_date).toISOString() 
          : (data.reception_date ? new Date(data.reception_date).toISOString() : new Date().toISOString()),
        updatedAt: serverTimestamp(),
        updatedBy: uid,
        ...(exists ? {} : { createdAt: serverTimestamp(), createdBy: uid, source: 'bulk-upload' }),
      };

      // Remove undefined values
      Object.keys(payload).forEach((k) => {
        if (payload[k] === undefined) delete payload[k];
      });

      batch.set(doc(db, 'transmitters', docId), payload, { merge: true });
      exists ? u++ : c++;
    }

    try {
      await batch.commit();
      result.created += c;
      result.updated += u;
      result.skippedDuplicates += s;
      result.linkedBirds += l;
      result.createdBirds += cb;
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
