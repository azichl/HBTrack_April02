import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { MapContainer, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { LiveViewState, MarkerPoint } from './liveViewState';
import { REPORT_MAP_OPTIONS, applyViewToFrame, waitTilesIdle, type FitMode } from './fitToFrame';
import './reportMapFrame.css';

const STATUS_COLOR: Record<string, string> = {
  Active: '#2e9e4f', Inactive: '#e8731a', Dead: '#555', 'Static test': '#6b7280',
};

const pin = (color: string) => `
  <svg width="26" height="34" viewBox="0 0 30 40" style="transform:translate(-13px,-32px);overflow:visible">
    <path d="M15 1C7.8 1 2 6.7 2 13.8 2 23 15 38 15 38s13-15 13-24.2C28 6.7 22.2 1 15 1z" fill="${color}" stroke="#fff" stroke-width="2.5"/>
    <circle cx="15" cy="14" r="5" fill="#fff"/></svg>`;

const iconFor = (p: MarkerPoint) => {
  const stColor = STATUS_COLOR[p.status ?? 'Active'] ?? '#2e9e4f';
  return L.divIcon({
    className: 'rpt-pin',
    iconSize: [0, 0],
    html:
      p.kind === 'camp'
        ? `<span class="rpt-camp"><svg width="30" height="30" viewBox="0 0 34 34"><circle cx="17" cy="17" r="15" fill="#F5A623" stroke="#fff" stroke-width="2.5"/>
             <path d="M17 8 26 24H8z" fill="none" stroke="#fff" stroke-width="2" stroke-linejoin="round"/></svg>
             ${p.label ? `<span class="rpt-camp__name">${p.label}</span>` : ''}</span>`
        : `${pin(stColor)}${p.label ? `<span class="rpt-tag" style="border-color:${stColor}">${p.label}</span>` : ''}`,
  });
};

/** Frames the live view inside whatever size the frame currently has; re-frames on every resize. */
function Framer({ view, mode, onReady, onMapInstance }: { view: LiveViewState; mode: FitMode; onReady?: () => void; onMapInstance?: (map: L.Map) => void }) {
  const map = useMap();
  const readyFired = useRef(false);

  useEffect(() => {
    if (map && onMapInstance) onMapInstance(map);
  }, [map, onMapInstance]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!applyViewToFrame(map, view, mode)) return;
      await waitTilesIdle(map);
      if (cancelled) return;
      map.getContainer().setAttribute('data-map-ready', '1');
      if (!readyFired.current) { readyFired.current = true; onReady?.(); }
    };
    map.getContainer().removeAttribute('data-map-ready');
    void run();

    const ro = new ResizeObserver(() => { map.getContainer().removeAttribute('data-map-ready'); void run(); });
    ro.observe(map.getContainer());
    return () => { cancelled = true; ro.disconnect(); };
  }, [map, view, mode, onReady]);

  return null;
}

export interface ReportLiveMapFrameProps {
  view: LiveViewState;
  mode?: FitMode;
  /** Same base layer component the Live Map uses (Google Mutant / Esri / OSM...). */
  baseLayer: ReactNode;
  /** Graticule, scale control, north arrow, locator inset: render here so they are computed from THIS map. */
  overlays?: ReactNode;
  onReady?: () => void;
  onMapInstance?: (map: L.Map) => void;
}

/**
 * The report's map window = a REAL Leaflet map that fills 100 % of its frame.
 * Scale bar / graticule / north arrow are therefore always correct for what is drawn.
 */
export default function ReportLiveMapFrame({ view, mode = 'fit-view', baseLayer, overlays, onReady, onMapInstance }: ReportLiveMapFrameProps) {
  const markers = useMemo(() => view.markerPoints, [view.markerPoints]);
  return (
    <div className="rpt-mapframe" dir="ltr">
      <MapContainer
        {...REPORT_MAP_OPTIONS}
        center={view.center}
        zoom={view.zoom}
        style={{ width: '100%', height: '100%' }}
      >
        {baseLayer}
        <Framer view={view} mode={mode} onReady={onReady} onMapInstance={onMapInstance} />
        {markers.map((p) => (
          <Marker key={`${p.kind}-${p.id}`} position={[p.lat, p.lon]} icon={iconFor(p)} interactive={false} />
        ))}
        {overlays}
      </MapContainer>
    </div>
  );
}
