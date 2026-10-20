/**
 * HBTrack positions engine — PURE functions, no Firebase/React imports.
 * Single source of truth for: parsing CLS rows, de-duplication, classification, ordering,
 * filtering (time window / GPS-Doppler), "last position" and the history path.
 *
 * RULES (from the CLS "Positions" export):
 *  1. The only time that matters is LOCATION date (when the position was computed/acquired).
 *     Message/arrival date is metadata only and is NEVER used to order, filter or pick "latest".
 *  2. One fix = one record, keyed by (pttId, type, locationDate rounded to the second).
 *     "Unit type" (Houbara / DS …) is NOT part of the key — it produced duplicate rows.
 *  3. GPS and DOPPLER are separate types; the ALL/GPS/DOPPLER filter is exact.
 *  4. Points are NEVER hidden except by: type filter, time window (location date), and the Doppler
 *     error-radius rule (> 2000 m by default). No outlier/speed/gap removal. The line is CONTINUOUS.
 *  4. Coordinates are stored with full precision (5+ decimals), never rounded for storage.
 */

export type LocType = 'GPS' | 'DOPPLER';
export type TypeFilter = 'ALL' | LocType;

export interface RawFix {
  pttId: string | number;
  unitType?: string | null;
  locationType: string;                 // 'GPS' | 'Doppler' | 'DOPPLER'
  locationClass?: string | null;        // null for GPS; '0','1','2','3','A','B','Z' for Doppler
  errorRadiusM?: number | null;         // 0 for GPS
  locationDate: string | number | Date; // UTC. Strings without 'Z' are treated as UTC
  lat: number;
  lon: number;
  messageDate?: string | number | Date | null; // metadata only
  deliveries?: number | null;
  revision?: number | null;                    // CLS dopplerRevision: a higher revision of the same location supersedes the lower one
}

export interface Fix {
  id: string;            // `${ptt}_${GPS|DOP}_${epochSeconds}`  (deterministic => idempotent upserts)
  pttId: string;
  type: LocType;
  t: number;             // location date, epoch ms UTC  <-- ordering / filtering key
  lat: number;
  lon: number;
  cls: string | null;
  errorRadiusM: number;
  unitTypes: string[];
  firstMessageMs: number | null; // metadata
  deliveries: number;
  revision: number | null;
}

export const normalizePttId = (v: string | number): string =>
  String(v).trim().replace(/^trans[-_]?/i, '').replace(/\D/g, '').replace(/^0+(?=\d)/, '');

/** Parse a CLS date as UTC. Date objects are taken as-is; strings without a zone are UTC. */
export function parseUtc(v: string | number | Date): number {
  if (v instanceof Date) return v.getTime();
  if (typeof v === 'number') return v < 1e11 ? v * 1000 : v;   // epoch seconds or milliseconds
  const s = v.trim().replace(' ', 'T');
  const hasZone = /(Z|[+-]\d\d:?\d\d)$/.test(s);
  const t = Date.parse(hasZone ? s : `${s}Z`);
  if (Number.isNaN(t)) throw new Error(`Invalid date: ${v}`);
  return t;
}

export function canonType(v: string): LocType {
  if (/gps/i.test(v)) return 'GPS';
  if (/dopp/i.test(v)) return 'DOPPLER';
  throw new Error(`Unknown location type: ${v}`);
}

export const fixId = (ptt: string, type: LocType, tMs: number) =>
  `${ptt}_${type === 'GPS' ? 'GPS' : 'DOP'}_${Math.round(tMs / 1000)}`;

const decimals = (n: number) => (String(n).split('.')[1] ?? '').length;
const validCoord = (lat: number, lon: number) =>
  Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && !(lat === 0 && lon === 0);

/** Normalise + de-duplicate. Order of input is irrelevant. Invalid rows are returned in `rejected`. */
export function buildFixes(raws: RawFix[]): { fixes: Fix[]; rejected: { row: RawFix; reason: string }[] } {
  const map = new Map<string, Fix>();
  const rejected: { row: RawFix; reason: string }[] = [];

  for (const r of raws) {
    let type: LocType; let t: number;
    try { type = canonType(r.locationType); t = parseUtc(r.locationDate); }
    catch (e) { rejected.push({ row: r, reason: (e as Error).message }); continue; }
    if (!validCoord(r.lat, r.lon)) { rejected.push({ row: r, reason: 'invalid coordinates' }); continue; }

    const ptt = normalizePttId(r.pttId);
    if (!ptt) { rejected.push({ row: r, reason: 'invalid ptt' }); continue; }
    const id = fixId(ptt, type, t);
    const cls = type === 'GPS' ? null : (r.locationClass ?? null);
    const err = type === 'GPS' ? 0 : Number(r.errorRadiusM ?? 0);
    const msg = r.messageDate != null ? parseUtc(r.messageDate) : null;

    const cur = map.get(id);
    if (!cur) {
      map.set(id, { id, pttId: ptt, type, t, lat: r.lat, lon: r.lon, cls, errorRadiusM: err,
        unitTypes: r.unitType ? [r.unitType] : [], firstMessageMs: msg, deliveries: r.deliveries ?? 1, revision: r.revision ?? null });
      continue;
    }
    // a higher CLS revision of the same Doppler location supersedes the earlier one (coordinates, class, error radius)
    if (type === 'DOPPLER' && r.revision != null && (cur.revision == null || r.revision > cur.revision)) {
      cur.lat = r.lat; cur.lon = r.lon; cur.cls = cls ?? cur.cls; if (err > 0) cur.errorRadiusM = err; cur.revision = r.revision;
      if (r.unitType && !cur.unitTypes.includes(r.unitType)) cur.unitTypes.push(r.unitType);
      if (msg != null) cur.firstMessageMs = cur.firstMessageMs == null ? msg : Math.min(cur.firstMessageMs, msg);
      cur.deliveries += r.deliveries ?? 1;
      continue;
    }
    // a LOWER (older) revision arriving late must not touch the stored coordinates / class / error radius
    if (type === 'DOPPLER' && r.revision != null && cur.revision != null && r.revision < cur.revision) {
      if (r.unitType && !cur.unitTypes.includes(r.unitType)) cur.unitTypes.push(r.unitType);
      if (msg != null) cur.firstMessageMs = cur.firstMessageMs == null ? msg : Math.min(cur.firstMessageMs, msg);
      cur.deliveries += r.deliveries ?? 1;
      continue;
    }
    // merge duplicates (e.g. same fix reported under unit types "DS" and "Houbara")
    if (r.unitType && !cur.unitTypes.includes(r.unitType)) cur.unitTypes.push(r.unitType);
    if (type === 'DOPPLER') {
      if (err > cur.errorRadiusM) cur.errorRadiusM = err;       // never lose the error radius (0 = missing)
      if (!cur.cls && cls) cur.cls = cls;
    }
    if (decimals(r.lat) + decimals(r.lon) > decimals(cur.lat) + decimals(cur.lon)) { cur.lat = r.lat; cur.lon = r.lon; } // keep full precision
    if (msg != null) cur.firstMessageMs = cur.firstMessageMs == null ? msg : Math.min(cur.firstMessageMs, msg);
    cur.deliveries += r.deliveries ?? 1;
  }
  return { fixes: [...map.values()].sort(byDateAsc), rejected };
}

export const byDateAsc = (a: Fix, b: Fix) => a.t - b.t || (a.type === b.type ? 0 : a.type === 'GPS' ? -1 : 1) || a.id.localeCompare(b.id);
export const byDateDesc = (a: Fix, b: Fix) => byDateAsc(b, a);

/** Doppler fixes with an error radius above this are rejected (not drawn, not "last", not in the table by default). */
export const DEFAULT_DOPPLER_MAX_ERROR_M = 2000;

export interface FilterOpts {
  pttIds?: string[];
  type?: TypeFilter;
  fromMs?: number;                  // inclusive, LOCATION date
  toMs?: number;                    // inclusive, LOCATION date
  /** Doppler error-radius limit in metres. Default 2000. Pass Infinity to disable. GPS is never affected.
   *  A Doppler fix with error 0/unknown is kept (flagged by `qualityOf` as 'unknown_error'). */
  dopplerMaxErrorM?: number;
}

export type Quality = 'ok' | 'doppler_error_gt_limit' | 'unknown_error';
export function qualityOf(f: Fix, limitM = DEFAULT_DOPPLER_MAX_ERROR_M): Quality {
  if (f.type === 'GPS') return 'ok';
  if (!(f.errorRadiusM > 0)) return 'unknown_error';
  return f.errorRadiusM > limitM ? 'doppler_error_gt_limit' : 'ok';
}

/** Split into accepted / rejected so the Argos table can show "Rejected (n)" instead of silently dropping rows. */
export function partitionByQuality(fixes: Fix[], limitM = DEFAULT_DOPPLER_MAX_ERROR_M) {
  const accepted: Fix[] = [], rejected: Fix[] = [];
  for (const f of fixes) (qualityOf(f, limitM) === 'doppler_error_gt_limit' ? rejected : accepted).push(f);
  return { accepted, rejected };
}

export function filterFixes(fixes: Fix[], o: FilterOpts = {}): Fix[] {
  const ptts = o.pttIds?.length ? new Set(o.pttIds.map(normalizePttId)) : null;
  const limit = o.dopplerMaxErrorM ?? DEFAULT_DOPPLER_MAX_ERROR_M;
  return fixes.filter((f) =>
    (!ptts || ptts.has(f.pttId)) &&
    (!o.type || o.type === 'ALL' || f.type === o.type) &&
    (o.fromMs == null || f.t >= o.fromMs) &&
    (o.toMs == null || f.t <= o.toMs) &&
    qualityOf(f, limit) !== 'doppler_error_gt_limit');
}

/** Newest by LOCATION date inside the active type filter (and the Doppler error rule). */
export function lastFix(fixes: Fix[], type: TypeFilter = 'ALL', dopplerMaxErrorM = DEFAULT_DOPPLER_MAX_ERROR_M): Fix | null {
  let best: Fix | null = null;
  for (const f of fixes) {
    if (type !== 'ALL' && f.type !== type) continue;
    if (qualityOf(f, dopplerMaxErrorM) === 'doppler_error_gt_limit') continue;
    if (!best || byDateDesc(f, best) < 0) best = f;
  }
  return best;
}

export function haversineKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const R = 6371.0088, r = Math.PI / 180;
  const dLat = (bLat - aLat) * r, dLon = (bLon - aLon) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export interface TrackOpts extends FilterOpts {
  /** OPTIONAL and OFF by default. The history path is continuous: the line is never cut unless you pass these. */
  maxGapHours?: number;
  maxSpeedKmh?: number;
}
export interface Track { points: Fix[]; segments: Fix[][]; distanceKm: number }

/** History path = every point that passes the filter, strictly chronological by LOCATION date, ONE continuous line. */
export function buildTrack(fixes: Fix[], o: TrackOpts = {}): Track {
  const pts = filterFixes(fixes, o).sort(byDateAsc);
  const maxGap = o.maxGapHours != null ? o.maxGapHours * 3_600_000 : Infinity;
  const maxSpeed = o.maxSpeedKmh ?? Infinity;
  const segments: Fix[][] = [];
  let cur: Fix[] = [];
  let dist = 0;
  for (const p of pts) {
    const prev = cur[cur.length - 1];
    if (prev) {
      const dt = p.t - prev.t;
      const d = haversineKm(prev.lat, prev.lon, p.lat, p.lon);
      const speed = dt > 0 ? d / (dt / 3_600_000) : 0;
      if (dt > maxGap || speed > maxSpeed) { segments.push(cur); cur = []; }
      else dist += d;
    }
    cur.push(p);
  }
  if (cur.length) segments.push(cur);
  return { points: pts, segments, distanceKm: dist };
}

/** Time presets resolved on LOCATION date. `now` injectable for tests. */
export function presetWindow(preset: 'LAST_POSITION' | '24H' | '7D' | '30D' | '1Y' | '2Y', now = Date.now()) {
  const H = 3_600_000;
  const span = { '24H': 24 * H, '7D': 168 * H, '30D': 720 * H, '1Y': 8760 * H, '2Y': 17520 * H } as const;
  return preset === 'LAST_POSITION' ? { fromMs: undefined, toMs: now } : { fromMs: now - span[preset], toMs: now };
}

/* ------------------------------------------------------------------------------------------------
 * Map layers — what the Live Map draws for each LOCATION TYPE button (all by LOCATION date):
 *   GPS     : line + markers through GPS points only
 *   DOPPLER : line + markers through Doppler points only (error radius <= 2000 m)
 *   ALL     : ONE continuous line through ALL points (GPS + accepted Doppler), chronological
 * Nothing else is removed. Optional styling hint: `style[i]` tells the renderer how to draw the segment
 * ending at point i (thicker for GPS->GPS) — purely visual, no point is hidden.
 * ---------------------------------------------------------------------------------------------- */
export type SegmentKind = 'GPS' | 'TOUCHING_DOPPLER';

export interface StyledSegment {
  points: [number, number][];
  kind: SegmentKind;
}

export interface LayerOpts extends TrackOpts { type: TypeFilter }
export interface MapLayers {
  line: Track;
  markers: Fix[];
  segmentKind: ('gps' | 'doppler' | 'mixed')[];
  styledSegments?: StyledSegment[];
}

export function mapLayers(fixes: Fix[], o: LayerOpts): MapLayers {
  const line = buildTrack(fixes, o);
  const pts = line.points;
  const segmentKind = pts.map((p, i) => {
    if (i === 0) return p.type === 'GPS' ? 'gps' : 'doppler';
    const a = pts[i - 1].type, b = p.type;
    return a === 'GPS' && b === 'GPS' ? 'gps' : a === 'DOPPLER' && b === 'DOPPLER' ? 'doppler' : 'mixed';
  }) as MapLayers['segmentKind'];

  const styledSegments: StyledSegment[] = [];
  for (let i = 1; i < pts.length; i++) {
    const p1 = pts[i - 1];
    const p2 = pts[i];
    const kind: SegmentKind = (p1.type === 'GPS' && p2.type === 'GPS') ? 'GPS' : 'TOUCHING_DOPPLER';
    styledSegments.push({
      points: [[p1.lat, p1.lon], [p2.lat, p2.lon]],
      kind
    });
  }

  return { line, markers: pts, segmentKind, styledSegments };
}

/**
 * QA signature measured on every CLS GPS date (1,040 message rows + 65 positions): seconds = 0 and no fractional part
 * (Doppler dates always carry fractional seconds). A GPS fix whose date has seconds/milliseconds is an ARRIVAL time that was
 * stamped as a location date (e.g. the app popup "Last fix 14:38:10 · GPS"). Quarantine such rows; never draw them.
 */
export function isSuspectGpsDate(v: Pick<Fix, 'type' | 't'> | string | number | Date): boolean {
  if (typeof v === 'object' && v !== null && !(v instanceof Date) && 'type' in v && 't' in v) {
    return v.type === 'GPS' && v.t % 60_000 !== 0;
  }
  try {
    const t = typeof v === 'number' ? (v < 1e11 ? v * 1000 : v) : parseUtc(v as string | Date);
    const d = new Date(t);
    return d.getUTCSeconds() !== 0 || d.getUTCMilliseconds() !== 0;
  } catch {
    return true;
  }
}
