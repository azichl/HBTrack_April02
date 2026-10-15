/**
 * IMAGE MODE only (QGIS image / uploaded snapshot). Pure functions, unit-testable.
 * Never letterbox: crop the snapshot to the frame's aspect ratio, centred on the markers.
 */
export interface Rect { x: number; y: number; w: number; h: number }
export interface Pt { x: number; y: number }

export interface CropResult {
  rect: Rect;               // crop rectangle in source-image pixels
  coversAllPoints: boolean; // false => caller should switch to the real-map mode (or warn)
}

export function smartCrop(srcW: number, srcH: number, frameW: number, frameH: number, points: Pt[], marginPx = 40): CropResult {
  const a = frameW / frameH;
  // largest rectangle with the frame's aspect ratio that fits inside the source
  let w: number, h: number;
  if (srcW / srcH > a) { h = srcH; w = h * a; } else { w = srcW; h = w / a; }

  let cx = srcW / 2, cy = srcH / 2;
  if (points.length) {
    const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
    cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  }
  const x = Math.min(Math.max(cx - w / 2, 0), srcW - w);
  const y = Math.min(Math.max(cy - h / 2, 0), srcH - h);
  const rect = { x, y, w, h };

  const inside = points.every(
    (p) => p.x >= x + marginPx && p.x <= x + w - marginPx && p.y >= y + marginPx && p.y <= y + h - marginPx,
  );
  return { rect, coversAllPoints: inside };
}

/** Crop a canvas/bitmap to the computed rectangle and return a data URL at full resolution. */
export function cropToDataUrl(src: CanvasImageSource & { width: number; height: number }, r: Rect, mime = 'image/png'): string {
  const c = document.createElement('canvas');
  c.width = Math.round(r.w);
  c.height = Math.round(r.h);
  c.getContext('2d')!.drawImage(src as CanvasImageSource, r.x, r.y, r.w, r.h, 0, 0, c.width, c.height);
  return c.toDataURL(mime);
}
