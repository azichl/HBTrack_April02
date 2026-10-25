// src/features/report-track/svgTrackOverlay.ts
//
// Turns a TrackRenderModel (from trackRenderModel.ts) into plain SVG path strings.
// Pure + map-library independent: the only map-specific input is `project(lat, lon) -> pixels`.
// Used by the Custom Map Report ONLY. Does not touch or import anything from the live map.

import {
  formatLatLon, thinLabels,
  type Rect, type TrackRenderModel, type TrackSettings,
} from './trackRenderModel';

export interface Px { x: number; y: number }
export type Project = (lat: number, lon: number) => Px;

export interface SvgLine { key: string; d: string; color: string; width: number; opacity: number; dash?: string }
export interface SvgDots { key: string; d: string; color: string; size: number; opacity: number }
export interface SvgLabel { id: string; x: number; y: number; text: string }

export interface SvgOverlayModel {
  lines: SvgLine[];
  haloDots: SvgDots[];      // white ring, drawn first (size + 2)
  dots: SvgDots[];          // coloured dots, one path per colour
  labels: SvgLabel[];
  stats: { segments: number; vertices: number; dots: number; labels: number; skipped: number };
}

const LIMIT = 1_000_000;    // browsers misrender SVG coordinates far beyond this
const r1 = (n: number) => Math.round(n * 10) / 10;
const clamp = (n: number) => Math.max(-LIMIT, Math.min(LIMIT, n));

export function dashArray(style: TrackSettings['dash'], width: number): string | undefined {
  if (style === 'dashed') return `${width * 3} ${width * 2}`;
  if (style === 'dotted') return `0.1 ${width * 2.2}`;      // needs stroke-linecap: round
  return undefined;
}

export function buildSvgOverlay(
  model: TrackRenderModel,
  s: TrackSettings,
  project: Project,
  bounds: { w: number; h: number },
  avoid: Rect[] = [],
): SvgOverlayModel {
  let skipped = 0;
  let vertices = 0;

  const lines: SvgLine[] = model.segments.map((seg, i) => {
    const pts: string[] = [];
    for (const [lat, lon] of seg.coords) {
      const p = project(lat, lon);
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) { skipped++; continue; }
      pts.push(`${pts.length ? 'L' : 'M'}${r1(clamp(p.x))} ${r1(clamp(p.y))}`);
    }
    vertices += pts.length;
    return { key: `seg-${i}`, d: pts.length >= 2 ? pts.join('') : '', color: seg.color, width: s.width, opacity: s.opacity, dash: dashArray(s.dash, s.width) };
  }).filter(l => l.d);

  // dots: one path per colour, each dot is a zero-length subpath drawn with a round cap
  const byColor = new Map<string, string[]>();
  let dotCount = 0;
  for (const m of model.markers) {
    if (!s.showPoints) break;                                 // labels imply markers in the model, dots only if Points is on
    const p = project(m.lat, m.lon);
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) { skipped++; continue; }
    if (p.x < -50 || p.y < -50 || p.x > bounds.w + 50 || p.y > bounds.h + 50) continue;   // viewport cull for dots only
    const arr = byColor.get(m.fill) ?? [];
    arr.push(`M${r1(p.x)} ${r1(p.y)}h0`);
    byColor.set(m.fill, arr);
    dotCount++;
  }
  const dots: SvgDots[] = [...byColor].map(([color, arr]) => ({ key: `dots-${color}`, d: arr.join(''), color, size: s.pointSize, opacity: s.pointOpacity }));
  const haloDots: SvgDots[] = dots.map(d => ({ ...d, key: `halo-${d.color}`, color: '#ffffff', size: d.size + 2 }));

  let labels: SvgLabel[] = [];
  if (s.showCoordinateLabels) {
    const kept = thinLabels(model.markers, project, s.labelMinSpacingPx, bounds, avoid);
    const byId = new Map(model.markers.map(m => [m.id, m]));
    labels = kept.map(k => {
      const m = byId.get(k.id)!;
      return { id: k.id, x: r1(k.x), y: r1(k.y), text: formatLatLon(m.lat, m.lon, s.coordFormat) };
    });
  }

  return { lines, haloDots, dots, labels, stats: { segments: lines.length, vertices, dots: dotCount, labels: labels.length, skipped } };
}
