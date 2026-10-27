// src/features/track-order/orderLine.ts
//
// LAST-MILE GUARD for every history polyline. Whatever order the points arrive in (message order, two sources
// concatenated, GPS + Doppler appended, a stale memo…), the line that is DRAWN is always chronological by
// position (fix) time. Use it at the place where the coordinates are handed to <Polyline>, and where `layers`
// is built, so a wrong order upstream can no longer reach the map.

export interface OrderLineOptions<T> {
  /** Position (fix / location) time in epoch ms UTC. Must NOT be the message/reception time. */
  timeOf: (p: T) => number | null | undefined;
  /** Tie-breaker (e.g. message time). */
  tieOf?: (p: T) => number | null | undefined;
  /** Remove exact duplicates (same second + same coordinates). Default true. */
  dedupe?: boolean;
  /** Console warning (with the offending rows) when the input was not chronological. Default: true outside production. */
  warn?: boolean;
  label?: string;
  describe?: (p: T) => unknown;     // extra info printed for offenders (id, type, class…)
}

export interface OrderLineReport {
  total: number;
  reversalsBefore: number;          // how many times the INPUT order went back in time (each = a zig-zag)
  reversalsAfter: number;           // must always be 0
  dropped: number;                  // exact duplicates removed
  missingTime: number;              // points without a usable time (left out of the line)
  repeatedCoords: number;           // same coordinates seen at times > 60 s apart (hint: same fix from two sources)
  offenders: { index: number; prevIso: string; curIso: string; info?: unknown }[];
}

const iso = (t: number) => new Date(t).toISOString();

export function orderLine<T extends { lat: number; lon: number }>(
  points: readonly T[],
  opts: OrderLineOptions<T>,
): { points: T[]; report: OrderLineReport } {
  const timed: { p: T; t: number; tie: number; i: number }[] = [];
  let missing = 0;
  points.forEach((p, i) => {
    const t = opts.timeOf(p);
    if (t == null || !Number.isFinite(t) || !Number.isFinite(p.lat) || !Number.isFinite(p.lon)) { missing++; return; }
    timed.push({ p, t, tie: opts.tieOf?.(p) ?? Infinity, i });
  });

  // diagnostics on the INPUT order
  const offenders: OrderLineReport['offenders'] = [];
  let before = 0;
  timed.forEach((x, k) => {
    if (k && x.t < timed[k - 1].t) {
      before++;
      if (offenders.length < 10) offenders.push({ index: k, prevIso: iso(timed[k - 1].t), curIso: iso(x.t), info: opts.describe?.(x.p) });
    }
  });
  const coordTimes = new Map<string, number[]>();
  timed.forEach(x => {
    const k = `${x.p.lat.toFixed(5)}|${x.p.lon.toFixed(5)}`;
    const a = coordTimes.get(k); a ? a.push(x.t) : coordTimes.set(k, [x.t]);
  });
  let repeated = 0;
  coordTimes.forEach(ts => { if (ts.length > 1 && Math.max(...ts) - Math.min(...ts) > 60_000) repeated++; });

  // the actual fix: stable chronological sort (+ tie-breaker, + original index)
  const sorted = [...timed].sort((a, b) => a.t - b.t || a.tie - b.tie || a.i - b.i);

  let out = sorted;
  let dropped = 0;
  if (opts.dedupe !== false) {
    const seen = new Set<string>();
    out = sorted.filter(x => {
      const k = `${Math.round(x.t / 1000)}|${x.p.lat.toFixed(5)}|${x.p.lon.toFixed(5)}`;
      if (seen.has(k)) { dropped++; return false; }
      seen.add(k); return true;
    });
  }

  const after = out.reduce((n, x, k) => (k && x.t < out[k - 1].t ? n + 1 : n), 0);
  const report: OrderLineReport = { total: points.length, reversalsBefore: before, reversalsAfter: after, dropped, missingTime: missing, repeatedCoords: repeated, offenders };

  const warn = opts.warn ?? (typeof process === 'undefined' || process.env?.NODE_ENV !== 'production');
  if (warn && (before > 0 || missing > 0)) {
    // eslint-disable-next-line no-console
    console.warn(`[orderLine${opts.label ? ' ' + opts.label : ''}] input was not chronological: ${before} reversals of ${points.length} points (fixed before drawing). missingTime=${missing} dropped=${dropped} repeatedCoords=${repeated}`, offenders);
  }
  return { points: out.map(x => x.p), report };
}
