// src/features/track/trackRenderModel.ts
//
// Pure functions (no React, no map library). The map layer ONLY draws what this returns, so every
// Flight Path Customizer control has a testable effect and cannot silently do nothing.
//
// Input `Fix[]` must come from an adapter over the EXISTING data model, using the SAME GPS/Doppler
// classification the live map uses (do not invent a second classifier):
//   const fixes: Fix[] = rawPoints.map(toFix)   // toFix sets kind: 'GPS' | 'DOPPLER'

export type PointType = 'ALL' | 'GPS' | 'DOPPLER';
export type CoordFormat = 'DD' | 'DMM' | 'DMS';
export type DashStyle = 'solid' | 'dashed' | 'dotted';
export type PointColorMode = 'track' | 'type' | 'period';

export interface Fix {
  id: string;
  t: number;                 // epoch ms (UTC)
  lat: number;
  lon: number;
  kind: 'GPS' | 'DOPPLER';
}

export interface TrackPeriod {
  id: string;
  from: string;              // ISO yyyy-mm-dd, inclusive (UTC day)
  to: string;                // ISO yyyy-mm-dd, inclusive (UTC day)
  color: string;             // #rrggbb
  label?: string;
}

export interface TrackSettings {
  show: boolean;
  type: PointType;
  from?: string;             // ISO yyyy-mm-dd
  to?: string;               // ISO yyyy-mm-dd
  // line
  color: string;             // default #6366f1
  width: number;             // 1..8 px
  opacity: number;           // 0.2..1
  dash: DashStyle;
  // points
  showPoints: boolean;
  pointSize: number;         // diameter px, 2..16
  pointOpacity: number;      // 0.2..1
  pointColorMode: PointColorMode;
  gpsColor: string;
  dopplerColor: string;
  // coordinate labels
  showCoordinateLabels: boolean;
  labelFontSize: number;     // px, 8..16
  labelMinSpacingPx: number; // 40..160
  coordFormat: CoordFormat;  // DMM reproduces the legacy report
  // periods
  periodsEnabled: boolean;
  periods: TrackPeriod[];
}

export const DEFAULT_TRACK_SETTINGS: TrackSettings = {
  show: true, type: 'ALL', color: '#6366f1', width: 3, opacity: 1, dash: 'solid',
  showPoints: false, pointSize: 6, pointOpacity: 1, pointColorMode: 'track',
  gpsColor: '#16a34a', dopplerColor: '#f59e0b',
  showCoordinateLabels: false, labelFontSize: 10, labelMinSpacingPx: 70, coordFormat: 'DMM',
  periodsEnabled: false, periods: [],
};

/* ------------------------------ dates ------------------------------ */

const dayStart = (iso: string) => Date.parse(`${iso}T00:00:00.000Z`);
const dayEnd = (iso: string) => Date.parse(`${iso}T23:59:59.999Z`);

export function validateSettings(s: TrackSettings): { ok: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (s.from && s.to && dayStart(s.from) > dayEnd(s.to)) errors.push('Date range: "From" is after "To"');
  if (s.periodsEnabled) {
    s.periods.forEach((p, i) => {
      if (!p.from || !p.to) errors.push(`Period ${i + 1}: missing date`);
      else if (dayStart(p.from) > dayEnd(p.to)) errors.push(`Period ${i + 1}: "From" is after "To"`);
    });
    for (let i = 0; i < s.periods.length; i++)
      for (let j = i + 1; j < s.periods.length; j++) {
        const a = s.periods[i], b = s.periods[j];
        if (a.from && a.to && b.from && b.to && dayStart(a.from) <= dayEnd(b.to) && dayStart(b.from) <= dayEnd(a.to))
          warnings.push(`Periods ${i + 1} and ${j + 1} overlap (the first one wins)`);
      }
  }
  return { ok: errors.length === 0, errors, warnings };
}

/* ------------------------------ filtering ------------------------------ */

export function filterFixes(fixes: Fix[], s: TrackSettings): Fix[] {
  const lo = s.from ? dayStart(s.from) : -Infinity;
  const hi = s.to ? dayEnd(s.to) : Infinity;
  return fixes
    .filter(f => (s.type === 'ALL' || f.kind === s.type) && f.t >= lo && f.t <= hi)
    .sort((a, b) => a.t - b.t);
}

export function periodFor(t: number, s: TrackSettings): TrackPeriod | undefined {
  if (!s.periodsEnabled) return undefined;
  return s.periods.find(p => p.from && p.to && t >= dayStart(p.from) && t <= dayEnd(p.to)); // list order = priority
}

/* ------------------------------ geometry ------------------------------ */

export interface Segment {
  periodId?: string;
  color: string;
  coords: [number, number][];   // [lat, lon]
}

/** A segment takes the colour of the period of its END point; segments connect with no gaps. */
export function buildSegments(fixes: Fix[], s: TrackSettings): Segment[] {
  const out: Segment[] = [];
  let cur: Segment | null = null;
  fixes.forEach((f, i) => {
    const p = periodFor(f.t, s);
    if (!cur || cur.periodId !== p?.id) {
      const prev = i > 0 ? fixes[i - 1] : undefined;
      cur = { periodId: p?.id, color: p?.color ?? s.color, coords: prev ? [[prev.lat, prev.lon]] : [] };
      out.push(cur);
    }
    cur.coords.push([f.lat, f.lon]);
  });
  return out.filter(seg => seg.coords.length >= 2);
}

export interface PointMarker {
  id: string; lat: number; lon: number; t: number;
  kind: 'GPS' | 'DOPPLER';
  diameter: number; fill: string; stroke: string; opacity: number;
}

export function buildMarkers(fixes: Fix[], s: TrackSettings): PointMarker[] {
  if (!s.showPoints && !s.showCoordinateLabels) return [];   // labels imply points
  return fixes.map(f => {
    const p = periodFor(f.t, s);
    const fill =
      s.pointColorMode === 'type' ? (f.kind === 'GPS' ? s.gpsColor : s.dopplerColor)
      : s.pointColorMode === 'period' ? (p?.color ?? s.color)
      : s.color;
    return { id: f.id, lat: f.lat, lon: f.lon, t: f.t, kind: f.kind,
             diameter: s.pointSize, fill, stroke: '#ffffff', opacity: s.pointOpacity };
  });
}

/* ------------------------------ coordinates ------------------------------ */

export function formatCoord(v: number, axis: 'lat' | 'lon', fmt: CoordFormat): string {
  const hemi = axis === 'lat' ? (v >= 0 ? 'N' : 'S') : (v >= 0 ? 'E' : 'W');
  const a = Math.abs(v);
  const degPad = axis === 'lon' ? 3 : 2;
  if (fmt === 'DD') return `${a.toFixed(5)}° ${hemi}`;
  if (fmt === 'DMM') {
    const total = Math.round(a * 60 * 10_000);              // 1e-4 minute units (carry-safe)
    const deg = Math.floor(total / 600_000);
    const min = (total % 600_000) / 10_000;
    return `${String(deg).padStart(degPad, '0')}° ${min.toFixed(4).padStart(7, '0')}′ ${hemi}`;
  }
  const total = Math.round(a * 3600 * 100);                 // 1e-2 second units (carry-safe)
  const deg = Math.floor(total / 360_000);
  const rem = total % 360_000;
  const min = Math.floor(rem / 6000);
  const sec = (rem % 6000) / 100;
  return `${String(deg).padStart(degPad, '0')}° ${String(min).padStart(2, '0')}′ ${sec.toFixed(2).padStart(5, '0')}″ ${hemi}`;
}

export const formatLatLon = (lat: number, lon: number, fmt: CoordFormat) =>
  `${formatCoord(lat, 'lat', fmt)}  ${formatCoord(lon, 'lon', fmt)}`;

export interface Rect { x: number; y: number; w: number; h: number }

/**
 * Greedy chronological thinning in SCREEN pixels. `project` = map's lat/lon → container px.
 * `avoid` = rectangles of legend / scale bar / north arrow / mini-map in the same pixel space.
 */
export function thinLabels(
  markers: PointMarker[],
  project: (lat: number, lon: number) => { x: number; y: number },
  minSpacingPx: number,
  bounds: { w: number; h: number },
  avoid: Rect[] = [],
  maxLabels = 80,
): { id: string; x: number; y: number }[] {
  const kept: { id: string; x: number; y: number }[] = [];
  const pad = 8;
  for (const m of markers) {
    if (kept.length >= maxLabels) break;
    const { x, y } = project(m.lat, m.lon);
    if (x < 0 || y < 0 || x > bounds.w || y > bounds.h) continue;
    if (avoid.some(r => x >= r.x - pad && x <= r.x + r.w + pad && y >= r.y - pad && y <= r.y + r.h + pad)) continue;
    if (kept.every(k => Math.hypot(k.x - x, k.y - y) >= minSpacingPx)) kept.push({ id: m.id, x, y });
  }
  return kept;
}

/* ------------------------------ the model ------------------------------ */

export interface TrackLegendEntry { id: string; label: string; color: string; shape: 'line' | 'dot' }

export interface TrackRenderModel {
  total: number;                 // all fixes for the subject
  shown: number;                 // after type + date filters (the badge: shown / total)
  filtered: Fix[];
  segments: Segment[];
  markers: PointMarker[];
  legend: TrackLegendEntry[];
  validation: ReturnType<typeof validateSettings>;
}

export function buildTrackRenderModel(fixes: Fix[], s: TrackSettings): TrackRenderModel {
  const validation = validateSettings(s);
  if (!s.show || !validation.ok) {
    return { total: fixes.length, shown: 0, filtered: [], segments: [], markers: [], legend: [], validation };
  }
  const filtered = filterFixes(fixes, s);
  const legend: TrackLegendEntry[] = s.periodsEnabled && s.periods.length
    ? s.periods.map((p, i) => ({ id: `period:${p.id}`, label: p.label ?? `${p.from} → ${p.to}`, color: p.color, shape: 'line' as const }))
    : [{ id: 'track', label: 'Flight Track', color: s.color, shape: 'line' as const }];
  return {
    total: fixes.length,
    shown: filtered.length,
    filtered,
    segments: buildSegments(filtered, s),
    markers: buildMarkers(filtered, s),
    legend: filtered.length ? legend : [],
    validation,
  };
}
