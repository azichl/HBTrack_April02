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
}

export const normalizePttId = (v: string | number): string =>
  String(v).trim().replace(/^trans[-_]?/i, '').replace(/\D/g, '').replace(/^0+(?=\d)/, '');

/** Parse a CLS date as UTC. Date objects are taken as-is; strings without a zone are UTC. */
export function parseUtc(v: string | number | Date): number {
  if (v instanceof Date) return v.getTime();
  if (typeof v === 'number') return v;
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
        unitTypes: r.unitType ? [r.unitType] : [], firstMessageMs: msg, deliveries: r.deliveries ?? 1 });
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

export interface FilterOpts {
  pttIds?: string[];
  type?: TypeFilter;
  fromMs?: number;                  // inclusive, LOCATION date
  toMs?: number;                    // inclusive, LOCATION date
  dopplerMaxErrorM?: number;        // optional quality gate (default: off)
  excludeClasses?: string[];        // e.g. ['Z']
}

export function filterFixes(fixes: Fix[], o: FilterOpts = {}): Fix[] {
  const ptts = o.pttIds?.length ? new Set(o.pttIds.map(normalizePttId)) : null;
  return fixes.filter((f) =>
    (!ptts || ptts.has(f.pttId)) &&
    (!o.type || o.type === 'ALL' || f.type === o.type) &&
    (o.fromMs == null || f.t >= o.fromMs) &&
    (o.toMs == null || f.t <= o.toMs) &&
    !(f.type === 'DOPPLER' && o.dopplerMaxErrorM != null && f.errorRadiusM > o.dopplerMaxErrorM) &&
    !(f.cls && o.excludeClasses?.includes(f.cls)));
}

/** Newest by LOCATION date inside the active type filter. */
export function lastFix(fixes: Fix[], type: TypeFilter = 'ALL'): Fix | null {
  let best: Fix | null = null;
  for (const f of fixes) {
    if (type !== 'ALL' && f.type !== type) continue;
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
  maxGapHours?: number;   // break the line on gaps longer than this (default 48)
  maxSpeedKmh?: number;   // break the line when implied speed exceeds this (default 120)
}
export interface Track { points: Fix[]; segments: Fix[][]; distanceKm: number }

/** History path: filtered fixes, strictly chronological by LOCATION date, split on gaps/speed jumps. */
export function buildTrack(fixes: Fix[], o: TrackOpts = {}): Track {
  const pts = filterFixes(fixes, o).sort(byDateAsc);
  const maxGap = (o.maxGapHours ?? 48) * 3_600_000;
  const maxSpeed = o.maxSpeedKmh ?? 120;
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
 * Map layers — what the Live Map draws for each LOCATION TYPE button.
 *  GPS     : line + markers = GPS only
 *  DOPPLER : line + markers = Doppler only
 *  ALL     : line = GPS only (more accurate); Doppler shown as small hollow DOTS, not connected.
 *            Optional: Doppler fixes that fall inside a GPS gap (> gapFillHours with no GPS) are added
 *            to the line so a long GPS outage is not drawn as one straight jump.
 * ---------------------------------------------------------------------------------------------- */
export interface LayerOpts extends TrackOpts {
  type: TypeFilter;
  fillGapsWithDoppler?: boolean; // default false
  gapFillHours?: number;         // default 3
}
export interface MapLayers { line: Track; markers: Fix[]; dopplerDots: Fix[] }

export function mapLayers(fixes: Fix[], o: LayerOpts): MapLayers {
  const base = { ...o, type: 'ALL' as TypeFilter };
  if (o.type === 'GPS' || o.type === 'DOPPLER') {
    const line = buildTrack(fixes, { ...o, type: o.type });
    return { line, markers: line.points, dopplerDots: [] };
  }
  const gps = filterFixes(fixes, { ...base, type: 'GPS' }).sort(byDateAsc);
  const dop = filterFixes(fixes, { ...base, type: 'DOPPLER' }).sort(byDateAsc);
  let lineSrc = gps;
  if (o.fillGapsWithDoppler && gps.length) {
    const H = (o.gapFillHours ?? 3) * 3_600_000;
    const fill = dop.filter((d) => !gps.some((g) => Math.abs(g.t - d.t) <= H));
    lineSrc = [...gps, ...fill].sort(byDateAsc);
  } else if (o.fillGapsWithDoppler && !gps.length) {
    lineSrc = dop;
  }
  const line = buildTrack(lineSrc, { ...o, type: 'ALL' });
  return { line, markers: gps, dopplerDots: dop };
}
