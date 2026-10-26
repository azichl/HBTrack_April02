// src/features/report-track/periodsModel.ts
// Pure helpers for the "Color Path by Periods" editor. No React, no map library.

import type { TrackPeriod } from './trackRenderModel';

// Deliberately excludes the default track colour (#6366f1) so uncovered dates never look like a period.
export const PERIOD_PALETTE = ['#f59e0b', '#10b981', '#ef4444', '#0ea5e9', '#a855f7', '#84cc16', '#f97316', '#14b8a6'];

export interface DataRange { from: string; to: string }   // ISO yyyy-mm-dd (UTC days)

const DAY = 86_400_000;
const toIso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const fromIso = (iso: string) => Date.parse(`${iso}T00:00:00.000Z`);
const isIso = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(fromIso(s));

/** First/last fix day of the data (epoch ms list in, ISO range out). */
export function dataRangeOf(times: readonly number[]): DataRange | null {
  let lo = Infinity, hi = -Infinity;
  for (const t of times) { if (Number.isFinite(t)) { if (t < lo) lo = t; if (t > hi) hi = t; } }
  return Number.isFinite(lo) ? { from: toIso(lo), to: toIso(hi) } : null;
}

/** First palette colour not used yet (case-insensitive); cycles when all are used. */
export function nextColor(periods: readonly TrackPeriod[]): string {
  const used = new Set(periods.map(p => p.color.toLowerCase()));
  return PERIOD_PALETTE.find(c => !used.has(c)) ?? PERIOD_PALETTE[periods.length % PERIOD_PALETTE.length];
}

let counter = 0;
const uid = () => `p${Date.now().toString(36)}${(counter++).toString(36)}`;

/**
 * Period created by "+ Add period".
 *  - first period  → the whole data range (the effect is visible immediately)
 *  - next periods  → start the day after the latest existing end (clamped to the data end), up to ~3 months
 *  Always a new colour. Dates are ISO strings, so <input type="date"> binds directly.
 */
export function newPeriod(periods: readonly TrackPeriod[], range: DataRange | null, id: string = uid()): TrackPeriod {
  const color = nextColor(periods);
  const today = toIso(Date.now());
  const ends = periods.filter(p => isIso(p.to)).map(p => fromIso(p.to));
  if (!ends.length) return { id, from: range?.from ?? today, to: range?.to ?? today, color };
  const dataEnd = range ? fromIso(range.to) : Infinity;
  const start = Math.min(Math.max(...ends) + DAY, Number.isFinite(dataEnd) ? dataEnd : Infinity);
  const end = Math.min(start + 89 * DAY, Number.isFinite(dataEnd) ? dataEnd : start + 89 * DAY);
  return { id, from: toIso(start), to: toIso(Math.max(start, end)), color };
}

/** "Example" button: two periods splitting the data range in half (or Jan–Apr / May–Oct of this year). */
export function examplePeriods(range: DataRange | null, year = new Date().getUTCFullYear()): TrackPeriod[] {
  if (range && fromIso(range.from) < fromIso(range.to)) {
    const a = fromIso(range.from), b = fromIso(range.to);
    const mid = a + Math.floor((b - a) / 2 / DAY) * DAY;
    return [
      { id: uid(), from: range.from, to: toIso(mid), color: PERIOD_PALETTE[0] },
      { id: uid(), from: toIso(mid + DAY), to: range.to, color: PERIOD_PALETTE[1] },
    ];
  }
  return [
    { id: uid(), from: `${year}-01-01`, to: `${year}-04-30`, color: PERIOD_PALETTE[0] },
    { id: uid(), from: `${year}-05-01`, to: `${year}-10-31`, color: PERIOD_PALETTE[1] },
  ];
}

export interface PeriodIssues { errors: Record<string, string>; warnings: Record<string, string> }

/** Per-row messages for the editor (the model's validateSettings gives the global list). */
export function periodIssues(periods: readonly TrackPeriod[]): PeriodIssues {
  const errors: Record<string, string> = {};
  const warnings: Record<string, string> = {};
  periods.forEach(p => {
    if (!isIso(p.from) || !isIso(p.to)) errors[p.id] = 'Pick both dates';
    else if (fromIso(p.from) > fromIso(p.to)) errors[p.id] = '“From” is after “To”';
  });
  periods.forEach((a, i) => {
    if (errors[a.id]) return;
    for (let j = i + 1; j < periods.length; j++) {
      const b = periods[j];
      if (errors[b.id]) continue;
      if (fromIso(a.from) <= fromIso(b.to) && fromIso(b.from) <= fromIso(a.to)) {
        warnings[b.id] = `Overlaps period ${i + 1} (period ${i + 1} wins)`;
      }
    }
  });
  return { errors, warnings };
}

export const sortPeriods = (p: readonly TrackPeriod[]) =>
  [...p].sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to));
