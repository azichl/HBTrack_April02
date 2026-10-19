/**
 * FALLBACK when the CLS "Positions" endpoint is not reachable: rebuild positions from CLS *messages* WITHOUT using the message date.
 * Each message row carries (a) a GPS fix with its own "GPS Date of position" and (b) a Doppler fix with its own "Doppler Date".
 * Dates come from those fields only; the same fix repeated in many messages collapses via buildFixes() (deterministic id).
 * Precision note: message GPS coordinates have 4 decimals (Positions has 5) — fine for tracks, ~10 m.
 * Accepted keys: CLS Messages table headers (below) and common camelCase variants.
 */
import type { RawFix } from './positionsEngine';

const pick = (r: Record<string, unknown>, names: string[]) => {
  const norm = (k: string) => k.toLowerCase().replace(/[^a-z0-9]/g, '');
  const map = new Map(Object.keys(r).map((k) => [norm(k), k]));
  for (const n of names) { const k = map.get(norm(n)); if (k !== undefined && r[k] !== null && r[k] !== undefined && r[k] !== '') return r[k]; }
  return undefined;
};

export interface MsgConvResult { rows: RawFix[]; messages: number; skippedNoDate: number; withoutPosition: number }

export function messagesToRawFixes(messages: Record<string, unknown>[]): MsgConvResult {
  const out: MsgConvResult = { rows: [], messages: messages.length, skippedNoDate: 0, withoutPosition: 0 };
  for (const m of messages) {
    const ptt = pick(m, ['Device ID', 'deviceId', 'pttId']);
    const msgDate = pick(m, ['Message date', 'messageDate']) as string | undefined;
    if (ptt === undefined) continue;
    let any = false;

    const gDate = pick(m, ['GPS Date of position', 'gpsDateOfPosition', 'gpsDate']);
    const gLat = pick(m, ['GPS Latitude', 'gpsLatitude', 'gpsLat']);
    const gLon = pick(m, ['GPS Longitude', 'gpsLongitude', 'gpsLon']);
    if (gLat !== undefined && gLon !== undefined) {
      if (gDate === undefined) out.skippedNoDate++;                       // never fall back to the message date
      else { any = true; out.rows.push({ pttId: String(ptt), unitType: null, locationType: 'GPS', locationClass: null, errorRadiusM: 0, locationDate: gDate as string, lat: Number(gLat), lon: Number(gLon), messageDate: msgDate ?? null }); }
    }

    const dDate = pick(m, ['Doppler Date', 'dopplerDate']);
    const dLat = pick(m, ['Doppler Latitude', 'dopplerLatitude', 'dopplerLat']);
    const dLon = pick(m, ['Doppler Longitude', 'dopplerLongitude', 'dopplerLon']);
    if (dLat !== undefined && dLon !== undefined) {
      if (dDate === undefined) out.skippedNoDate++;
      else {
        any = true;
        out.rows.push({ pttId: String(ptt), unitType: null, locationType: 'DOPPLER',
          locationClass: (pick(m, ['Doppler Class', 'dopplerClass', 'locationClass']) as string | undefined) ?? null,
          errorRadiusM: Number(pick(m, ['Doppler Error radius', 'dopplerErrorRadius', 'errorRadius']) ?? 0),
          locationDate: dDate as string, lat: Number(dLat), lon: Number(dLon), messageDate: msgDate ?? null });
      }
    }
    if (!any) out.withoutPosition++;
  }
  return out;
}
