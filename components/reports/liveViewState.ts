import type { Map as LeafletMap } from 'leaflet';

/**
 * Everything the report needs to reproduce the Live Map view — passed as DATA, not as a screenshot.
 * ADAPT: fill `markerPoints`, `statusFilter`, `baseLayerId` from the app's store.
 */
export interface MarkerPoint {
  id: string;                 // PTT id or camp id
  lat: number;
  lon: number;
  kind: 'transmitter' | 'camp';
  status?: string;            // Active / Inactive / ...
  label?: string;             // text shown in the pill (PTT id or camp name)
}

export interface LiveViewState {
  center: [number, number];
  zoom: number;                                   // may be fractional
  bounds: [[number, number], [number, number]];   // SW, NE of what the user SAW on the live map
  sizePx: { w: number; h: number };               // live map container size when captured
  baseLayerId?: string;                           // e.g. 'google-roadmap' | 'esri-imagery'
  statusFilter?: string;                          // 'all' | 'Active' | ...
  markerPoints: MarkerPoint[];                    // markers currently visible on the live map
  capturedAt: string;                             // ISO
}

export function readLiveViewState(
  map: LeafletMap,
  extra: Pick<LiveViewState, 'markerPoints'> & Partial<Pick<LiveViewState, 'baseLayerId' | 'statusFilter'>>,
): LiveViewState {
  const b = map.getBounds();
  const c = map.getCenter();
  const s = map.getSize();
  return {
    center: [c.lat, c.lng],
    zoom: map.getZoom(),
    bounds: [[b.getSouth(), b.getWest()], [b.getNorth(), b.getEast()]],
    sizePx: { w: s.x, h: s.y },
    capturedAt: new Date().toISOString(),
    ...extra,
  };
}
