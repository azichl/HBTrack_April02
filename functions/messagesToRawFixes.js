/**
 * CommonJS fallback when the CLS "Positions" endpoint is not reachable:
 * rebuild positions from CLS *messages* WITHOUT using the message date.
 */
const pick = (r, names) => {
  const norm = (k) => k.toLowerCase().replace(/[^a-z0-9]/g, '');
  const map = new Map(Object.keys(r).map((k) => [norm(k), k]));
  for (const n of names) {
    const k = map.get(norm(n));
    if (k !== undefined && r[k] !== null && r[k] !== undefined && r[k] !== '') return r[k];
  }
  return undefined;
};

function messagesToRawFixes(messages) {
  const out = { rows: [], messages: messages.length, skippedNoDate: 0, withoutPosition: 0 };
  for (const m of messages) {
    const ptt = pick(m, ['Device ID', 'deviceId', 'pttId']);
    const msgDate = pick(m, ['Message date', 'messageDate']);
    if (ptt === undefined) continue;
    let any = false;

    const gDate = pick(m, ['GPS Date of position', 'gpsDateOfPosition', 'gpsDate']);
    const gLat = pick(m, ['GPS Latitude', 'gpsLatitude', 'gpsLat']);
    const gLon = pick(m, ['GPS Longitude', 'gpsLongitude', 'gpsLon']);
    if (gLat !== undefined && gLon !== undefined) {
      if (gDate === undefined) {
        out.skippedNoDate++; // never fall back to the message date
      } else {
        any = true;
        out.rows.push({
          pttId: String(ptt),
          unitType: null,
          locationType: 'GPS',
          locationClass: null,
          errorRadiusM: 0,
          locationDate: gDate,
          lat: Number(gLat),
          lon: Number(gLon),
          messageDate: msgDate || null,
        });
      }
    }

    const dDate = pick(m, ['Doppler Date', 'dopplerDate']);
    const dLat = pick(m, ['Doppler Latitude', 'dopplerLatitude', 'dopplerLat']);
    const dLon = pick(m, ['Doppler Longitude', 'dopplerLongitude', 'dopplerLon']);
    if (dLat !== undefined && dLon !== undefined) {
      if (dDate === undefined) {
        out.skippedNoDate++;
      } else {
        any = true;
        out.rows.push({
          pttId: String(ptt),
          unitType: null,
          locationType: 'DOPPLER',
          locationClass: pick(m, ['Doppler Class', 'dopplerClass', 'locationClass']) || null,
          errorRadiusM: Number(pick(m, ['Doppler Error radius', 'dopplerErrorRadius', 'errorRadius']) || 0),
          locationDate: dDate,
          lat: Number(dLat),
          lon: Number(dLon),
          messageDate: msgDate || null,
        });
      }
    }
    if (!any) out.withoutPosition++;
  }
  return out;
}

module.exports = { messagesToRawFixes };
