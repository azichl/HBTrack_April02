/**
 * CommonJS fallback when the CLS "Positions" endpoint is not reachable:
 * rebuild positions from CLS *messages* WITHOUT using the message date.
 * Supports both export table headers and CLS API JSON names.
 */

const norm = (k) => k.toLowerCase().replace(/[^a-z0-9]/g, '');

const KEYS = {
  ptt: ['deviceid', 'pttid', 'deviceref'],
  msgDate: ['messagedate', 'msgdatetime'],
  gpsDate: ['gpsdateofposition', 'gpsdate', 'gpslocdatetime'],
  gpsLat: ['gpslatitude', 'gpslat', 'gpsloclat'],
  gpsLon: ['gpslongitude', 'gpslon', 'gpsloclon'],
  dopDate: ['dopplerdate', 'dopplerdatetime'],
  dopLat: ['dopplerlatitude', 'dopplerlat', 'dopplerloclat'],
  dopLon: ['dopplerlongitude', 'dopplerlon', 'dopplerloclon'],
  dopErr: ['dopplererrorradius', 'dopplererrorradiusm', 'dopplerlocerrorradius', 'errorradius'],
  dopClass: ['dopplerclass', 'dopplerlocclass', 'locationclass'],
  dopId: ['dopplerlocid'],
  dopRev: ['dopplerrevision'],
  unit: ['category', 'unittype'],
};

function findKey(row, names, force) {
  const map = new Map(Object.keys(row).map((k) => [norm(k), k]));
  if (force) return map.get(norm(force));
  for (const n of names) {
    const k = map.get(n);
    if (k !== undefined) return k;
  }
  return undefined;
}

const val = (r, k) => (k && r[k] !== null && r[k] !== undefined && r[k] !== '' ? r[k] : undefined);

function messagesToRawFixes(messages, opt = {}) {
  const out = { rows: [], messages: messages.length, skippedNoDate: 0, withoutPosition: 0, mapping: {} };
  if (!messages || !messages.length) return out;
  const sample = messages[0];
  const k = {
    ptt: findKey(sample, KEYS.ptt, opt.idField),
    msg: findKey(sample, KEYS.msgDate),
    gDate: findKey(sample, KEYS.gpsDate),
    gLat: findKey(sample, KEYS.gpsLat),
    gLon: findKey(sample, KEYS.gpsLon),
    dDate: findKey(sample, KEYS.dopDate, opt.dopplerDateField),
    dLat: findKey(sample, KEYS.dopLat),
    dLon: findKey(sample, KEYS.dopLon),
    dErr: findKey(sample, KEYS.dopErr),
    dCls: findKey(sample, KEYS.dopClass),
    dRev: findKey(sample, KEYS.dopRev),
    unit: findKey(sample, KEYS.unit),
  };
  out.mapping = k;
  if (!k.ptt) return out;

  for (const m of messages) {
    const ptt = val(m, k.ptt);
    if (ptt === undefined) continue;
    const msgDate = val(m, k.msg);
    const unit = val(m, k.unit);
    let any = false;

    const gLat = val(m, k.gLat), gLon = val(m, k.gLon), gDate = val(m, k.gDate);
    if (gLat !== undefined && gLon !== undefined) {
      if (gDate === undefined) {
        out.skippedNoDate++;
      } else {
        any = true;
        out.rows.push({
          pttId: String(ptt),
          unitType: unit != null ? String(unit) : null,
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

    const dLat = val(m, k.dLat), dLon = val(m, k.dLon), dDate = val(m, k.dDate);
    if (dLat !== undefined && dLon !== undefined) {
      if (dDate === undefined) {
        out.skippedNoDate++;
      } else {
        any = true;
        out.rows.push({
          pttId: String(ptt),
          unitType: unit != null ? String(unit) : null,
          locationType: 'DOPPLER',
          locationClass: val(m, k.dCls) != null ? String(val(m, k.dCls)) : null,
          errorRadiusM: Number(val(m, k.dErr) || 0),
          locationDate: dDate,
          lat: Number(dLat),
          lon: Number(dLon),
          messageDate: msgDate || null,
          revision: val(m, k.dRev) != null ? Number(val(m, k.dRev)) : null,
        });
      }
    }
    if (!any) out.withoutPosition++;
  }
  return out;
}

module.exports = { messagesToRawFixes, KEYS };
