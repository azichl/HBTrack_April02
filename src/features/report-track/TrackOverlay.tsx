// src/features/report-track/TrackOverlay.tsx
// Compiled and exercised in tests (jsdom) — see ReportTrackFeature.test.tsx.
//
// Draws the Custom Map Report track as an SVG overlay on the report map. It is deliberately
// independent from the live map: it imports nothing from it and the live map imports nothing from here.
// The overlay is mounted INSIDE the map's own stacking context, below the pins (release/latest/camp),
// and re-projects on every map view change, so it always lines up and exports (html2canvas) as normal DOM.

import { createPortal } from 'react-dom';
import { useEffect, useMemo, useState } from 'react';
import type { Rect, TrackRenderModel, TrackSettings } from './trackRenderModel';
import { buildSvgOverlay, type Px } from './svgTrackOverlay';

/* ----------------------------- adapter contract ----------------------------- */
export interface MapAdapter {
  mount: HTMLElement;                         // portal target; must sit BELOW the pins in the stacking order
  project(lat: number, lon: number): Px;      // pixels relative to the SVG's top-left corner
  size(): { w: number; h: number };           // SVG size in px
  origin?(): Px;                              // translate applied to the SVG (Leaflet panes move while panning)
  subscribe(cb: () => void): () => void;      // fires when the view or size changes
}

/* ----------------------------- Leaflet adapter ------------------------------ */
// Custom pane (zIndex 450: above vector overlays 400, below markers 600), projects with layer points,
// draws 25 % extra on every side so panning never reveals blank edges before `moveend`.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function leafletAdapter(map: any): MapAdapter {
  const PAD = 0.25;
  const pane = map.getPane('hbTrack') ?? map.createPane('hbTrack');
  pane.style.zIndex = '450';
  pane.style.pointerEvents = 'none';
  const pad = () => { const s = map.getSize(); return { x: s.x * PAD, y: s.y * PAD }; };
  const origin = () => { const p = pad(); const o = map.containerPointToLayerPoint([-p.x, -p.y]); return { x: o.x, y: o.y }; };
  return {
    mount: pane,
    origin,
    project: (lat, lon) => {
      const o = origin();
      const p = map.latLngToLayerPoint([lat, lon]);
      return { x: p.x - o.x, y: p.y - o.y };
    },
    size: () => { const s = map.getSize(); return { w: s.x * (1 + 2 * PAD), h: s.y * (1 + 2 * PAD) }; },
    subscribe: cb => {
      map.on('moveend zoomend resize viewreset', cb);
      return () => { map.off('moveend zoomend resize viewreset', cb); };
    },
  };
}

/* ---------------------------- MapLibre / Mapbox ----------------------------- */
// Inserts a div right after the canvas, so DOM markers (added later) render above it.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function maplibreAdapter(map: any): MapAdapter {
  const container: HTMLElement = map.getCanvasContainer();
  let host: HTMLElement | null = container.querySelector('.hb-track-host');
  if (!host) {
    host = document.createElement('div');
    host.className = 'hb-track-host';
    host.style.cssText = 'position:absolute;inset:0;pointer-events:none;';
    container.insertBefore(host, map.getCanvas().nextSibling);
  }
  return {
    mount: host,
    project: (lat, lon) => { const p = map.project([lon, lat]); return { x: p.x, y: p.y }; },
    size: () => { const c = map.getCanvas(); return { w: c.clientWidth, h: c.clientHeight }; },
    subscribe: cb => {
      map.on('move', cb); map.on('resize', cb);
      return () => { map.off('move', cb); map.off('resize', cb); };
    },
  };
}
// Any other library (Google Maps, OpenLayers…): implement the same 4 methods; nothing else changes.

/* --------------------------------- component -------------------------------- */
interface Props {
  model: TrackRenderModel;                    // from buildTrackRenderModel(fixes, settings)
  settings: TrackSettings;
  adapter: MapAdapter | null;
  avoid?: Rect[];                             // legend / scale bar / north arrow / mini-map rects in the SVG's pixel space
  debug?: boolean;                            // ?debug=track
}

export function TrackOverlay({ model, settings, adapter, avoid = [], debug }: Props) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!adapter) return;
    let raf = 0;
    const off = adapter.subscribe(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setTick(t => (t + 1) % 1_000_000));
    });
    return () => { cancelAnimationFrame(raf); off(); };
  }, [adapter]);

  const size = adapter?.size() ?? { w: 0, h: 0 };
  const origin = adapter?.origin?.() ?? { x: 0, y: 0 };

  const svg = useMemo(
    () => (adapter ? buildSvgOverlay(model, settings, adapter.project, size, avoid) : null),
    // `tick` re-projects after any map view change
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [adapter, model, settings, tick, size.w, size.h, avoid],
  );

  if (!adapter || !svg) return null;

  const node = (
    <svg
      className="hb-track-overlay"
      width={size.w}
      height={size.h}
      viewBox={`0 0 ${size.w} ${size.h}`}
      style={{ position: 'absolute', left: 0, top: 0, transform: `translate(${origin.x}px, ${origin.y}px)`, pointerEvents: 'none', overflow: 'visible' }}
      aria-hidden="true"
    >
      <g fill="none" strokeLinecap="round" strokeLinejoin="round">
        {svg.lines.map(l => (
          <path key={l.key} d={l.d} stroke={l.color} strokeWidth={l.width} strokeOpacity={l.opacity} strokeDasharray={l.dash} />
        ))}
        {svg.haloDots.map(d => <path key={d.key} d={d.d} stroke={d.color} strokeWidth={d.size} strokeOpacity={d.opacity} />)}
        {svg.dots.map(d => <path key={d.key} d={d.d} stroke={d.color} strokeWidth={d.size} strokeOpacity={d.opacity} />)}
      </g>
      <g fontFamily="inherit" fontSize={settings.labelFontSize} fontWeight={600} textAnchor="start">
        {svg.labels.map(l => (
          <text key={l.id} x={l.x + 6} y={l.y - 6} stroke="#000" strokeWidth={3} strokeOpacity={0.75}
                paintOrder="stroke" fill="#fff" strokeLinejoin="round">{l.text}</text>
        ))}
      </g>
    </svg>
  );
  return (
    <>
      {createPortal(node, adapter.mount)}
      {debug && createPortal(
        <div style={{ position: 'fixed', left: 12, bottom: 12, zIndex: 2000, font: '11px/1.4 monospace', color: '#fff',
                      background: 'rgba(0,0,0,.8)', padding: '6px 8px', borderRadius: 6, pointerEvents: 'none' }}>
          {`TRACK total ${model.total} · shown ${model.shown} · seg ${svg.stats.segments} · dots ${svg.stats.dots} · labels ${svg.stats.labels} · skipped ${svg.stats.skipped}`}
        </div>,
        document.body,
      )}
    </>
  );
}

/*
Usage in the report map component (after the map instance exists):

const adapter = useMemo(() => (map ? leafletAdapter(map) : null), [map]);   // or maplibreAdapter(map)
const fixes   = useReportFixes(subject);                       // §1 of the spec — same data source as the live map history
const model   = useMemo(() => buildTrackRenderModel(fixes, previewSettings ?? committedSettings), [fixes, previewSettings, committedSettings]);
<TrackOverlay model={model} settings={previewSettings ?? committedSettings} adapter={adapter} debug={new URLSearchParams(location.search).get('debug') === 'track'} />
*/
