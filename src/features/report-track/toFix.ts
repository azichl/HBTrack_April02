import { classifyLocationType, safeParseTimestamp, isValidCoordinate } from '../../../utils/formatting';
import type { Fix } from './trackRenderModel';
import { resolveTimes } from '../track-order/fixTime';

export function toFix(raw: any): Fix | null {
  if (!raw) return null;

  let lat: number;
  let lon: number;
  let kind: 'GPS' | 'DOPPLER' = 'GPS';
  let t: number;
  let id: string;

  if (Array.isArray(raw)) {
    lat = Number(raw[0]);
    lon = Number(raw[1]);
    kind = 'GPS';
    t = Date.now();
    id = `fix-${lat}-${lon}`;
  } else {
    lat = Number(raw.lat ?? raw.latitude);
    lon = Number(raw.lon ?? raw.longitude);
    kind = (raw.type === 'GPS' || raw.type === 'DOPPLER')
      ? raw.type
      : (raw.locationType === 'GPS' || raw.locationType === 'DOPPLER')
        ? raw.locationType
        : classifyLocationType(raw.lc || raw.locationClass, raw.locationType, raw.satellite);

    const { fix, message } = resolveTimes(raw);
    t = fix ?? message ?? (typeof raw.t === 'number' ? raw.t : safeParseTimestamp(raw.locationDate || raw.timestamp || raw.fixTime || raw.date || raw.ts));
    id = String(raw.id || `${raw.transmitter_id || raw.platformId || 'tx'}_${t}_${lat}_${lon}`);
  }

  if (isNaN(lat) || isNaN(lon) || isNaN(t) || t <= 0) return null;
  if (!isValidCoordinate(lat, lon)) return null;

  return { id, t, lat, lon, kind };
}
