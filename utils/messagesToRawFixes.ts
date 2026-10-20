/**
 * Messages -> position fixes WITHOUT using the message date.
 * Supports TWO shapes:
 *  (a) CLS Messages table / export headers:  "Device ID", "Message date", "GPS Date of position", "GPS Latitude", "Doppler Date", …
 *  (b) CLS API JSON (seen in your log): deviceRef, msgDatetime, acqDatetime, gpsLocDatetime/gpsLocLon/gpsLocLat,
 *      dopplerDatetime / dopplerAcqDatetime / dopplerLocLon / dopplerLocLat / dopplerLocErrorRadius / dopplerLocClass /
 *      dopplerLocId / dopplerRevision, programRef, category, subCategory …
 * The first run in your app failed with "2637 messages retrieved, but 0 fixes extracted": the converter only knew shape (a).
 *
 * Three things MUST be verified on real data (helpers below, do not assume):
 *   1. which key is the PTT / Device ID (deviceRef vs deviceUid vs modemRef)         -> inspectMessageSchema(messages, knownPtts)
 *   2. which Doppler date equals CLS "Location date" (dopplerDatetime vs dopplerAcqDatetime) -> calibrateDopplerDate(messages, reference)
 *   3. GPS date = gpsLocDatetime (whole minutes)                                      -> built-in check
 */
import type { Fix, RawFix } from './positionsEngine';
import { parseUtc } from './positionsEngine';

const norm = (k: string) => k.toLowerCase().replace(/[^a-z0-9]/g, '');

export const KEYS = {
  ptt: ['deviceid', 'pttid', 'deviceref'],                       // NOT deviceuid / modemref unless chosen via options.idField
  msgDate: ['messagedate', 'msgdatetime'],
  gpsDate: ['gpsdateofposition', 'gpsdate', 'gpslocdatetime'],
  gpsLat: ['gpslatitude', 'gpslat', 'gpsloclat'],
  gpsLon: ['gpslongitude', 'gpslon', 'gpsloclon'],
  dopDate: ['dopplerdate', 'dopplerdatetime'],
  dopLat: ['dopplerlatitude', 'dopplerlat', 'dopplerloclat'],
  dopLon: ['dopplerlongitude', 'dopplerlon', 'dopplerloclon'],
  dopErr: ['dopplererrorradius', 'dopplererrorradiusm', 'dopplerlocerrorradius', 'errorradius'],
  dopClass: ['dopplerclass', 'dopplerlocclass', 'locationclass'],
  dopId: ['dopplerlocid'],
  dopRev: ['dopplerrevision'],
  unit: ['category', 'unittype'],
} as const;

export interface ConvOptions {
  idField?: string;            // force the PTT key after verification, e.g. 'deviceRef'
  dopplerDateField?: string;   // force the Doppler date key after calibration, e.g. 'dopplerDatetime' | 'dopplerAcqDatetime'
}

function findKey(row: Record<string, unknown>, names: readonly string[], force?: string): string | undefined {
  const map = new Map(Object.keys(row).map((k) => [norm(k), k]));
  if (force) return map.get(norm(force));
  for (const n of names) { const k = map.get(n); if (k !== undefined) return k; }
  return undefined;
}
const val = (r: Record<string, unknown>, k?: string) => (k && r[k] !== null && r[k] !== undefined && r[k] !== '' ? r[k] : undefined);

export interface MsgConvResult { rows: RawFix[]; messages: number; skippedNoDate: number; withoutPosition: number; mapping: Record<string, string | undefined> }

export function messagesToRawFixes(messages: Record<string, unknown>[], opt: ConvOptions = {}): MsgConvResult {
  const out: MsgConvResult = { rows: [], messages: messages.length, skippedNoDate: 0, withoutPosition: 0, mapping: {} };
  if (!messages.length) return out;
  const sample = messages[0];
  const k = {
    ptt: findKey(sample, KEYS.ptt, opt.idField), msg: findKey(sample, KEYS.msgDate),
    gDate: findKey(sample, KEYS.gpsDate), gLat: findKey(sample, KEYS.gpsLat), gLon: findKey(sample, KEYS.gpsLon),
    dDate: findKey(sample, KEYS.dopDate, opt.dopplerDateField), dLat: findKey(sample, KEYS.dopLat), dLon: findKey(sample, KEYS.dopLon),
    dErr: findKey(sample, KEYS.dopErr), dCls: findKey(sample, KEYS.dopClass), dRev: findKey(sample, KEYS.dopRev), unit: findKey(sample, KEYS.unit),
  };
  out.mapping = k;
  if (!k.ptt) return out;

  for (const m of messages) {
    const ptt = val(m, k.ptt); if (ptt === undefined) continue;
    const msgDate = val(m, k.msg) as string | number | undefined;
    const unit = val(m, k.unit);
    let any = false;

    const gLat = val(m, k.gLat), gLon = val(m, k.gLon), gDate = val(m, k.gDate);
    if (gLat !== undefined && gLon !== undefined) {
      if (gDate === undefined) out.skippedNoDate++;                              // never fall back to the message date
      else { any = true; out.rows.push({ pttId: String(ptt), unitType: unit != null ? String(unit) : null, locationType: 'GPS', locationClass: null, errorRadiusM: 0, locationDate: gDate as string | number, lat: Number(gLat), lon: Number(gLon), messageDate: msgDate ?? null }); }
    }
    const dLat = val(m, k.dLat), dLon = val(m, k.dLon), dDate = val(m, k.dDate);
    if (dLat !== undefined && dLon !== undefined) {
      if (dDate === undefined) out.skippedNoDate++;
      else {
        any = true;
        out.rows.push({ pttId: String(ptt), unitType: unit != null ? String(unit) : null, locationType: 'DOPPLER',
          locationClass: val(m, k.dCls) != null ? String(val(m, k.dCls)) : null, errorRadiusM: Number(val(m, k.dErr) ?? 0),
          locationDate: dDate as string | number, lat: Number(dLat), lon: Number(dLon), messageDate: msgDate ?? null,
          revision: val(m, k.dRev) != null ? Number(val(m, k.dRev)) : null });
      }
    }
    if (!any) out.withoutPosition++;
  }
  return out;
}

/* ---------------------------------- verification helpers ---------------------------------- */
export interface SchemaReport {
  mapping: Record<string, string | undefined>;
  idCandidates: { key: string; sample: string[]; matchesKnownPtts: number | null }[];
  idChosen?: string;
  warnings: string[];
  unmappedKeys: string[];
  sampleValues: Record<string, unknown>;           // first message, truncated — safe to log
}

/** Show what the converter will use and whether the PTT key really contains your PTT ids. */
export function inspectMessageSchema(messages: Record<string, unknown>[], knownPtts: string[] = []): SchemaReport {
  const warnings: string[] = [];
  if (!messages.length) return { mapping: {}, idCandidates: [], warnings: ['no messages'], unmappedKeys: [], sampleValues: {} };
  const s = messages[0];
  const known = new Set(knownPtts.map((x) => String(x)));
  const cands = ['deviceRef', 'deviceUid', 'modemRef', 'deviceId', 'pttId', 'Device ID'].filter((c) => findKey(s, [], c));
  const idCandidates = cands.map((c) => {
    const key = findKey(s, [], c)!;
    const vals = [...new Set(messages.slice(0, 500).map((m) => String(m[key] ?? '')))];
    return { key, sample: vals.slice(0, 3), matchesKnownPtts: known.size ? vals.filter((v) => known.has(v)).length : null };
  });
  let idChosen: string | undefined;
  if (known.size) {
    const best = [...idCandidates].sort((a, b) => (b.matchesKnownPtts ?? 0) - (a.matchesKnownPtts ?? 0))[0];
    if (best && (best.matchesKnownPtts ?? 0) > 0) idChosen = best.key; else warnings.push('No candidate PTT key matches your known PTT ids — pick the key manually (idField).');
  } else idChosen = idCandidates.find((c) => /ref|id/i.test(c.key))?.key;
  const conv = messagesToRawFixes(messages.slice(0, 50), idChosen ? { idField: idChosen } : {});
  if (conv.rows.length === 0) warnings.push('0 fixes extracted from the first 50 messages.');
  const used = new Set(Object.values(conv.mapping).filter(Boolean) as string[]);
  const unmappedKeys = Object.keys(s).filter((key) => !used.has(key));
  const sampleValues = Object.fromEntries(Object.entries(s).filter(([key]) => !/raw|sensors|contexts|metadata/i.test(key)).map(([key, v]) => [key, typeof v === 'string' ? v.slice(0, 40) : v]));
  return { mapping: conv.mapping, idCandidates, idChosen, warnings, unmappedKeys, sampleValues };
}

export interface Calibration { field: string; compared: number; matched: number; rate: number }
/**
 * Decide which Doppler date equals the CLS "Location date": compare each candidate message field with a reference list of Doppler
 * fixes (e.g. the CLS Positions export / table for the same PTT and window). Pick the field with the highest rate (>= 0.9 expected).
 */
export function calibrateDopplerDate(messages: Record<string, unknown>[], reference: Fix[], candidates = ['dopplerDatetime', 'dopplerAcqDatetime', 'acqDatetime', 'msgDatetime']): Calibration[] {
  const ref = reference.filter((f) => f.type === 'DOPPLER').map((f) => Math.round(f.t / 1000));
  if (!ref.length) return [];
  const refSet = new Set(ref); const lo = Math.min(...ref), hi = Math.max(...ref);
  return candidates.map((field) => {
    const times = new Set<number>();
    for (const m of messages) {
      const key = findKey(m, [], field); const v = key ? val(m, key) : undefined;
      if (v === undefined || val(m, findKey(m, KEYS.dopLat)) === undefined) continue;      // only messages that carry a Doppler fix
      try { const t = Math.round(parseUtc(v as string | number) / 1000); if (t >= lo && t <= hi) times.add(t); } catch { /* skip */ }
    }
    let matched = 0; for (const t of times) if (refSet.has(t) || refSet.has(t - 1) || refSet.has(t + 1)) matched++;
    return { field, compared: times.size, matched, rate: times.size ? matched / times.size : 0 };
  }).sort((a, b) => b.rate - a.rate);
}
