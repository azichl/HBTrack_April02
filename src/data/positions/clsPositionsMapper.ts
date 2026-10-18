/**
 * Tolerant mapper: CLS "Positions" row  ->  RawFix (positionsEngine.ts).
 * Works for (a) CLS Positions table / xlsx / csv export headers ("Device ID", "Location date", ...)
 * and (b) JSON keys of the API response (camelCase / snake_case) — keys are matched after
 * lower-casing and stripping every non-alphanumeric character.
 *
 * The exact API field names must be confirmed (Step 0 of the plan: capture the CLS Positions request/response).
 * `unmappedKeys` / `missing` make a wrong guess visible instead of silently dropping data.
 */
import type { RawFix } from './positionsEngine';

const ALIASES: Record<string, string[]> = {
  pttId: ['deviceid', 'platformid', 'pttid', 'ptt', 'argosid', 'deviceidentifier'],
  unitType: ['unittype', 'devicetype', 'unit'],
  locationClass: ['locationclass', 'locclass', 'lc', 'class', 'quality'],
  locationType: ['locationtype', 'loctype', 'positiontype', 'type', 'source'],
  errorRadiusM: ['dopplererrorradiusm', 'dopplererrorradius', 'errorradiusm', 'errorradius', 'errorradiusmeters', 'accuracy', 'dopplererror'],
  locationDate: ['locationdate', 'locdate', 'positiondate', 'locationtime', 'datelocation', 'date', 'time'],
  lon: ['longitude', 'lon', 'lng', 'long', 'x'],
  lat: ['latitude', 'lat', 'y'],
  messageDate: ['messagedate', 'firstmessagedate', 'receiveddate', 'receivedat'],
};

const norm = (k: string) => k.toLowerCase().replace(/[^a-z0-9]/g, '');
const REQUIRED = ['pttId', 'locationType', 'locationDate', 'lat', 'lon'] as const;

export interface MapResult {
  rows: RawFix[];
  unmappedKeys: string[];     // keys present in the data that matched no field (review them)
  missing: string[];          // required fields with no matching key at all  -> stop and fix the mapping
  skipped: { index: number; reason: string }[];
}

export function mapClsPositions(input: Record<string, unknown>[]): MapResult {
  const out: MapResult = { rows: [], unmappedKeys: [], missing: [], skipped: [] };
  if (!input.length) return out;

  // resolve key -> field once, from the union of keys
  const keyToField = new Map<string, string>();
  const seen = new Set<string>();
  for (const r of input) for (const k of Object.keys(r)) seen.add(k);
  for (const k of seen) {
    const n = norm(k);
    for (const [field, names] of Object.entries(ALIASES)) {
      if (names.includes(n) && !([...keyToField.values()].includes(field))) { keyToField.set(k, field); break; }
    }
  }
  const mapped = new Set(keyToField.values());
  out.missing = REQUIRED.filter((f) => !mapped.has(f));
  out.unmappedKeys = [...seen].filter((k) => !keyToField.has(k));
  if (out.missing.length) return out;

  input.forEach((r, index) => {
    const o: Record<string, unknown> = {};
    for (const [k, field] of keyToField) o[field] = r[k];
    const lat = Number(o.lat), lon = Number(o.lon);
    if (o.locationDate == null || o.locationDate === '') { out.skipped.push({ index, reason: 'no location date' }); return; }
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) { out.skipped.push({ index, reason: 'invalid coordinates' }); return; }
    out.rows.push({
      pttId: String(o.pttId),
      unitType: o.unitType != null ? String(o.unitType) : null,
      locationType: String(o.locationType),
      locationClass: o.locationClass == null || o.locationClass === '' ? null : String(o.locationClass),
      errorRadiusM: o.errorRadiusM == null || o.errorRadiusM === '' ? 0 : Number(o.errorRadiusM),
      locationDate: o.locationDate as string | number | Date,
      lat, lon,
      messageDate: (o.messageDate as string | number | Date | undefined) ?? null,
    });
  });
  return out;
}
