import { describe, it, expect } from 'vitest';
import { safeParseTimestamp, normalizePttId } from '../utils/formatting';
import { buildFixes, type RawFix } from '../utils/positionsEngine';

describe('Manual Data Upload — 8 Template Columns Verification', () => {
  const templateColumns = [
    'Device ID',
    'Unit type',
    'Location class',
    'Location type',
    'Doppler Error radius (m)',
    'Location date',
    'Longitude',
    'Latitude'
  ];

  it('correctly maps the exact 8 columns into valid tracking fixes', () => {
    const rawRows = [
      {
        'Device ID': '244289',
        'Unit type': 'Houbara',
        'Location class': 'GPS',
        'Location type': 'GPS',
        'Doppler Error radius (m)': '0',
        'Location date': '2026-10-31 10:05:48',
        'Longitude': '66.9021',
        'Latitude': '46.9450'
      },
      {
        'Device ID': '244289',
        'Unit type': 'Houbara',
        'Location class': '3',
        'Location type': 'DOPPLER',
        'Doppler Error radius (m)': '250',
        'Location date': '2026-10-31 12:15:00',
        'Longitude': '66.9500',
        'Latitude': '46.9800'
      }
    ];

    const getVal = (row: any, ...keys: string[]): any => {
      for (const k of keys) {
        if (row[k] !== undefined && row[k] !== null && String(row[k]).trim() !== '') {
          return row[k];
        }
      }
      const rowKeys = Object.keys(row);
      for (const k of keys) {
        const cleanK = k.toLowerCase().replace(/[^a-z0-9]/g, '');
        const found = rowKeys.find(rk => rk.toLowerCase().replace(/[^a-z0-9]/g, '') === cleanK);
        if (found && row[found] !== undefined && row[found] !== null && String(row[found]).trim() !== '') {
          return row[found];
        }
      }
      return undefined;
    };

    const rawFixes: RawFix[] = [];
    for (const row of rawRows) {
      const ptt = normalizePttId(getVal(row, 'Device ID', 'PTT'));
      const locDateRaw = getVal(row, 'Location date');
      const lat = parseFloat(String(getVal(row, 'Latitude')));
      const lon = parseFloat(String(getVal(row, 'Longitude')));
      const locTypeRaw = String(getVal(row, 'Location type') || '').trim().toUpperCase();
      const rawLc = String(getVal(row, 'Location class') || '').trim().toUpperCase();
      const isGps = locTypeRaw.includes('GPS') || (!locTypeRaw && (rawLc === 'GPS' || !rawLc));
      const locType = isGps ? 'GPS' : 'DOPPLER';
      const locClass = locType === 'GPS' ? null : (rawLc && rawLc !== 'GPS' ? rawLc : 'Z');
      const errRadiusM = locType === 'GPS' ? 0 : (parseFloat(String(getVal(row, 'Doppler Error radius (m)') || 0)) || 0);

      const locDateMs = safeParseTimestamp(locDateRaw);
      expect(isNaN(locDateMs)).toBe(false);

      const locDateIso = new Date(locDateMs).toISOString();

      rawFixes.push({
        pttId: ptt,
        unitType: String(getVal(row, 'Unit type') || 'Houbara'),
        locationType: locType,
        locationClass: locClass,
        errorRadiusM: errRadiusM,
        locationDate: locDateIso,
        lat,
        lon,
        deliveries: 1
      });
    }

    expect(rawFixes).toHaveLength(2);
    expect(rawFixes[0].locationType).toBe('GPS');
    expect(rawFixes[0].errorRadiusM).toBe(0);
    expect(rawFixes[1].locationType).toBe('DOPPLER');
    expect(rawFixes[1].errorRadiusM).toBe(250);

    const { fixes } = buildFixes(rawFixes);
    expect(fixes).toHaveLength(2);
    expect(fixes[0].pttId).toBe('244289');
  });

  it('handles Excel serial date numbers and case variation gracefully', () => {
    // 46210.42 in Excel is roughly 2026-07-06
    const excelTimestamp = safeParseTimestamp(46210.42);
    expect(excelTimestamp).toBeGreaterThan(0);
    const date = new Date(excelTimestamp);
    expect(date.getUTCFullYear()).toBe(2026);
  });
});
