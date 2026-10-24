import { classifyLocationType, safeParseTimestamp } from '../../../utils/formatting';
import { Fix } from './trackRenderModel';

export function toFix(raw: any, index: number = 0): Fix {
  if (Array.isArray(raw)) {
    return {
      id: `fix-${index}`,
      t: Date.now(),
      lat: Number(raw[0]),
      lon: Number(raw[1]),
      kind: 'GPS'
    };
  }

  const rawDate = raw.timestamp || raw.locationDate || raw.fixTime || raw.date || raw.ts;
  const tsMs = safeParseTimestamp(rawDate);
  const t = !isNaN(tsMs) && tsMs > 0 ? tsMs : (typeof raw.t === 'number' ? raw.t : Date.now());
  const lat = Number(raw.lat ?? raw.latitude);
  const lon = Number(raw.lon ?? raw.longitude);

  let kind: 'GPS' | 'DOPPLER' = 'GPS';
  if (raw.kind === 'GPS' || raw.kind === 'DOPPLER') {
    kind = raw.kind;
  } else if (raw.type === 'GPS' || raw.type === 'DOPPLER') {
    kind = raw.type;
  } else {
    kind = classifyLocationType(raw.lc || raw.locationClass, raw.locationType || raw.type, raw.satellite);
  }

  const id = raw.id ? String(raw.id) : `fix-${raw.pttId || raw.platform_id || ''}-${t}-${index}`;

  return { id, t, lat, lon, kind };
}
