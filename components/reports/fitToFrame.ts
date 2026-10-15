import L from 'leaflet';
import type { LiveViewState } from './liveViewState';

/**
 * Create the report map with these options so fitBounds can use FRACTIONAL zoom
 * (integer zoom snapping is what leaves empty bands / wrong framing).
 */
export const REPORT_MAP_OPTIONS: L.MapOptions = {
  zoomSnap: 0,
  zoomDelta: 0.5,
  zoomControl: false,
  attributionControl: false,
  preferCanvas: true,
  fadeAnimation: false,
  zoomAnimation: false,
  markerZoomAnimation: false,
};

export type FitMode =
  | 'fit-view'          // DEFAULT: show everything the user saw on the live map; extra axis is filled with REAL map tiles (no bars)
  | 'fit-markers'       // frame the visible markers (+15 % margin)
  | 'same-center-zoom'; // identical centre + zoom as the live map (may show more/less than the live view)

/**
 * Frames the live view inside the report frame, whatever its aspect ratio.
 * Returns false while the container has no size yet (call again after layout / ResizeObserver).
 */
export function applyViewToFrame(map: L.Map, view: LiveViewState, mode: FitMode = 'fit-view'): boolean {
  map.invalidateSize({ animate: false, pan: false }); // re-read the REAL frame size
  const size = map.getSize();
  if (size.x < 20 || size.y < 20) return false;

  if (mode === 'same-center-zoom') {
    map.setView(view.center, view.zoom, { animate: false });
    return true;
  }

  const markers = view.markerPoints.map((p) => L.latLng(p.lat, p.lon));
  let target = L.latLngBounds(view.bounds);

  if (mode === 'fit-markers' && markers.length) {
    target = L.latLngBounds(markers).pad(0.15);
  } else if (markers.length) {
    // 'fit-view': guarantee every visible marker (incl. its label) stays inside after re-framing
    target.extend(L.latLngBounds(markers).pad(0.04));
  }

  map.fitBounds(target, { animate: false, padding: [0, 0], maxZoom: 18 });
  return true;
}

/** Resolve when all tile layers currently in view have finished loading (or after the timeout). */
export function waitTilesIdle(map: L.Map, timeoutMs = 8000): Promise<void> {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => { if (!done) { done = true; resolve(); } };
    const loading: any[] = [];
    map.eachLayer((l: any) => { if (l && l._tiles && l._loading) loading.push(l); });
    if (loading.length === 0) { setTimeout(finish, 120); return; }
    let left = loading.length;
    loading.forEach((l) => l.once('load', () => { if (--left === 0) setTimeout(finish, 120); }));
    setTimeout(finish, timeoutMs);
  });
}
