/**
 * CommonJS mapper for CLS Positions rows in Cloud Functions.
 */
const ALIASES = {
  pttId: ['deviceid', 'platformid', 'pttid', 'ptt', 'argosid', 'deviceidentifier'],
  unitType: ['unittype', 'devicetype', 'unit'],
  locationClass: ['locationclass', 'locclass', 'lc', 'class', 'quality'],
  locationType: ['locationtype', 'loctype', 'positiontype', 'type', 'source'],
  errorRadiusM: ['dopplererrorradiusm', 'dopplererrorradius', 'errorradiusm', 'errorradius', 'errorradiusmeters', 'accuracy', 'dopplererror'],
  locationDate: ['locationdate', 'locdate', 'positiondate', 'locationtime', 'datelocation', 'date', 'time'],
  lon: ['longitude', 'lon', 'lng', 'long', 'x'],
  lat: ['latitude', 'lat', 'y'],
  messageDate: ['messagedate', 'firstmessagedate', 'receiveddate', 'receivedat'],
};

const norm = (k) => k.toLowerCase().replace(/[^a-z0-9]/g, '');
const REQUIRED = ['pttId', 'locationType', 'locationDate', 'lat', 'lon'];

function mapClsPositions(input) {
  const out = { rows: [], unmappedKeys: [], missing: [], skipped: [] };
  if (!Array.isArray(input) || !input.length) return out;

  const keyToField = new Map();
  const seen = new Set();
  for (const r of input) {
    if (r && typeof r === 'object') {
      for (const k of Object.keys(r)) seen.add(k);
    }
  }

  for (const k of seen) {
    const n = norm(k);
    for (const [field, names] of Object.entries(ALIASES)) {
      if (names.includes(n) && !([...keyToField.values()].includes(field))) {
        keyToField.set(k, field);
        break;
      }
    }
  }

  const mapped = new Set(keyToField.values());
  out.missing = REQUIRED.filter((f) => !mapped.has(f));
  out.unmappedKeys = [...seen].filter((k) => !keyToField.has(k));
  if (out.missing.length) return out;

  input.forEach((r, index) => {
    if (!r || typeof r !== 'object') return;
    const o = {};
    for (const [k, field] of keyToField) o[field] = r[k];
    const lat = Number(o.lat), lon = Number(o.lon);
    if (o.locationDate == null || o.locationDate === '') {
      out.skipped.push({ index, reason: 'no location date' });
      return;
    }
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      out.skipped.push({ index, reason: 'invalid coordinates' });
      return;
    }
    out.rows.push({
      pttId: String(o.pttId).trim().replace(/^trans[-_]?/i, '').replace(/\D/g, '').replace(/^0+(?=\d)/, ''),
      unitType: o.unitType != null ? String(o.unitType) : null,
      locationType: String(o.locationType),
      locationClass: o.locationClass == null || o.locationClass === '' ? null : String(o.locationClass),
      errorRadiusM: o.errorRadiusM == null || o.errorRadiusM === '' ? 0 : Number(o.errorRadiusM),
      locationDate: o.locationDate,
      lat,
      lon,
      messageDate: o.messageDate || null,
    });
  });

  return out;
}

module.exports = { mapClsPositions };
