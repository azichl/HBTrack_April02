// src/features/track-order/fixTime.ts
//
// ONE place that decides "when did this position happen" for every consumer of Argos history
// (live map history track, report map, KPIs, popups, exports).
//
// Rule:  position time = the LOCATION / GPS-FIX date  (the "LOCATION DATE (UTC)" column of the Argos table,
//        "GPS Date of position" in the CLS portal).  The MESSAGE date (when the satellite received/forwarded
//        the message) is only a fallback and a tie-breaker. Messages can arrive hours or days late and out of
//        order (store-and-forward), so ordering by message date draws a zig-zag.
//
// Pure functions, no React / map / Firebase imports.

export type TimeLike =
  | string | number | Date
  | { seconds: number; nanoseconds?: number }          // Firestore Timestamp (plain)
  | { toDate: () => Date }                             // Firestore Timestamp (class)
  | null | undefined;

/* -------------------------------- parsing (always UTC) -------------------------------- */

const ISO = /^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2})(?:[.,](\d{1,9}))?)?)?\s*(Z|[+-]\d{2}(?::?\d{2})?)?$/i;
const DMY = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})(?:[T\s,]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/;

function utc(y: number, mo: number, d: number, h = 0, mi = 0, s = 0, ms = 0): number | null {
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || s > 59) return null;
  const t = Date.UTC(y, mo - 1, d, h, mi, s, ms);
  return new Date(t).getUTCDate() === d ? t : null;       // rejects 31 Feb etc.
}

/**
 * Parses ANY of: ISO with/without Z or offset, "YYYY-MM-DD HH:mm:ss", "DD/MM/YYYY HH:mm", epoch seconds or ms,
 * Date, Firestore Timestamp. Strings WITHOUT a zone are treated as UTC (never as the browser's local time:
 * `new Date("2026-10-26 12:01:00")` would be local time and shift records by the viewer's UTC offset).
 */
export function parseUtc(v: TimeLike): number | null {
  if (v == null || v === '') return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.getTime();
  if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v < 1e11 ? v * 1000 : v) : null;
  if (typeof v === 'object') {
    if ('toDate' in v && typeof v.toDate === 'function') return parseUtc(v.toDate());
    if ('seconds' in v && typeof v.seconds === 'number') return v.seconds * 1000 + Math.floor((v.nanoseconds ?? 0) / 1e6);
    return null;
  }
  const s = String(v).trim();
  if (/^\d{9,13}$/.test(s)) return parseUtc(Number(s));
  let m = ISO.exec(s);
  if (m) {
    const [, y, mo, d, h, mi, se, frac, tz] = m;
    const ms = frac ? Math.round(Number(`0.${frac}`) * 1000) : 0;
    let t = utc(+y, +mo, +d, +(h ?? 0), +(mi ?? 0), +(se ?? 0), ms);
    if (t != null && tz && tz.toUpperCase() !== 'Z') {
      const sign = tz[0] === '-' ? -1 : 1;
      const digits = tz.slice(1).replace(':', '');
      t -= sign * (Number(digits.slice(0, 2)) * 60 + Number(digits.slice(2, 4) || 0)) * 60_000;
    }
    return t;
  }
  m = DMY.exec(s);
  if (m) return utc(+m[3], +m[2], +m[1], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0));   // day-first
  return null;
}

/* -------------------------------- which field is the fix time -------------------------------- */

export interface TimeFieldConfig { fixFields: string[]; messageFields: string[] }

/**
 * ⚠ Set these to the REAL field names of the app's records. `fixFields` must contain the field behind the
 * "LOCATION DATE (UTC)" column of the Argos table; `messageFields` the field the map popup prints in its
 * "UTC:" line today. Dotted paths are allowed ("gps.date").
 */
export const DEFAULT_TIME_FIELDS: TimeFieldConfig = {
  fixFields: ['locationDate', 'location_date', 'locDate', 'gpsDate', 'gps_date', 'gpsDateOfPosition', 'dateOfPosition',
              'date_of_position', 'fixTime', 'fix_time', 'positionDate', 'position_date'],
  messageFields: ['messageDate', 'message_date', 'msgDate', 'msg_date', 'receivedAt', 'received_at', 'timestamp',
                  'createdAt', 'created_at', 'date', 'time'],
};

const getPath = (o: unknown, path: string): unknown =>
  path.split('.').reduce<unknown>((acc, k) => (acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[k] : undefined), o);

export function resolveTimes(raw: unknown, cfg: TimeFieldConfig = DEFAULT_TIME_FIELDS): { fix: number | null; message: number | null } {
  const first = (fields: string[]) => {
    for (const f of fields) { const t = parseUtc(getPath(raw, f) as TimeLike); if (t != null) return t; }
    return null;
  };
  return { fix: first(cfg.fixFields), message: first(cfg.messageFields) };
}

/* -------------------------------- normalise: sort + dedupe -------------------------------- */

export interface TimedFix<T> {
  raw: T;
  id: string;
  lat: number;
  lon: number;
  t: number;                 // position time, epoch ms UTC  (fix date, or message date when missing)
  messageT: number | null;   // when the message was received (info only)
  usedFallback: boolean;     // true = no fix date on the record, t is the message date
}

export interface NormalizeOptions<T> {
  getLat: (r: T) => number | null | undefined;
  getLon: (r: T) => number | null | undefined;
  getId?: (r: T, index: number) => string;
  fields?: TimeFieldConfig;
  dedupe?: boolean;          // default true
}

/** Sorted by position time ascending (ties: message time, then id); duplicates (same second + same coordinates) removed. */
export function normalizeFixes<T>(raws: readonly T[], o: NormalizeOptions<T>): TimedFix<T>[] {
  const out: TimedFix<T>[] = [];
  raws.forEach((raw, i) => {
    const lat = Number(o.getLat(raw)); const lon = Number(o.getLon(raw));
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return;
    const { fix, message } = resolveTimes(raw, o.fields);
    const t = fix ?? message;
    if (t == null) return;
    out.push({ raw, id: o.getId?.(raw, i) ?? String(i), lat, lon, t, messageT: message, usedFallback: fix == null });
  });

  out.sort((a, b) => a.t - b.t || (a.messageT ?? Infinity) - (b.messageT ?? Infinity) || a.id.localeCompare(b.id));
  if (o.dedupe === false) return out;

  const seen = new Map<string, TimedFix<T>>();
  for (const f of out) {
    const key = `${Math.round(f.t / 1000)}|${f.lat.toFixed(4)}|${f.lon.toFixed(4)}`;
    const prev = seen.get(key);
    if (!prev || (prev.usedFallback && !f.usedFallback)) seen.set(key, f);      // keep the record that has a real fix date
  }
  return [...seen.values()].sort((a, b) => a.t - b.t || (a.messageT ?? Infinity) - (b.messageT ?? Infinity) || a.id.localeCompare(b.id));
}

export const isChronological = (f: readonly { t: number }[]) => f.every((x, i) => i === 0 || f[i - 1].t <= x.t);

/* -------------------------------- diagnostics (run on the real data before/after) -------------------------------- */

const R_KM = 6371.0088;
export function haversineKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}
export const pathKm = (p: readonly { lat: number; lon: number }[]) => p.reduce((s, x, i) => (i ? s + haversineKm(p[i - 1], x) : 0), 0);

export interface OrderReport {
  count: number;
  adjacentReversals: number;      // times the drawn path goes BACK in time (each one is a zig-zag)
  pathKmAsDrawn: number;
  pathKmByFixTime: number;
  inflationKm: number;            // distance added by the wrong order
  fallbackCount: number;          // records without a fix date
  maxDelayHours: number;          // longest (message date − fix date)
}

/** `drawn` = the points in the order the map currently draws them (e.g. sorted by message date). */
export function diagnoseOrder(drawn: readonly TimedFix<unknown>[]): OrderReport {
  const byFix = [...drawn].sort((a, b) => a.t - b.t);
  let rev = 0, maxDelay = 0, fb = 0;
  drawn.forEach((f, i) => {
    if (i && f.t < drawn[i - 1].t) rev++;
    if (f.usedFallback) fb++;
    if (f.messageT != null) maxDelay = Math.max(maxDelay, f.messageT - f.t);
  });
  const a = pathKm(drawn), b = pathKm(byFix);
  return { count: drawn.length, adjacentReversals: rev, pathKmAsDrawn: a, pathKmByFixTime: b, inflationKm: Math.max(0, a - b),
           fallbackCount: fb, maxDelayHours: maxDelay / 3_600_000 };
}

/* -------------------------------- popup / label formatting -------------------------------- */

const p2 = (n: number) => String(n).padStart(2, '0');
export const formatUtc = (t: number) => {
  const d = new Date(t);
  return `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())} ${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}:${p2(d.getUTCSeconds())}`;
};

export function formatDelay(ms: number): string {
  const min = Math.round(ms / 60_000);
  if (min < 1) return '< 1 min';
  const d = Math.floor(min / 1440), h = Math.floor((min % 1440) / 60), m = min % 60;
  return d ? `${d} d ${h} h` : h ? `${h} h ${m} min` : `${m} min`;
}

/** Popup lines: "Fix time (UTC)" is the position time; "Received" only when the message came noticeably later. */
export function popupTimes(f: Pick<TimedFix<unknown>, 't' | 'messageT' | 'usedFallback'>) {
  const delay = f.messageT != null ? f.messageT - f.t : 0;
  return {
    fixUtc: formatUtc(f.t),
    receivedUtc: f.messageT != null && Math.abs(delay) >= 60_000 ? formatUtc(f.messageT) : null,
    delayText: f.messageT != null && delay >= 60_000 ? formatDelay(delay) : null,
    isFallback: f.usedFallback,
  };
}
