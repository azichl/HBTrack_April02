import { describe, it, expect } from 'vitest';
import { mapClsPositions } from './clsPositionsMapper';
import { buildFixes } from './positionsEngine';
import fixture43574 from './fixtures/cls_positions_43574.json';

describe('CLS Positions mapper', () => {
  it('maps the CLS Positions table / export headers', () => {
    const rows = [
      { 'Device ID': 43571, 'Unit type': 'Houbara', 'Location class': null, 'Location type': 'GPS', 'Doppler Error radius (m)': 0, 'Location date': '2026-10-18 03:00:00', Longitude: 74.5123, Latitude: 43.1 },
      { 'Device ID': 43571, 'Unit type': 'Houbara', 'Location class': 'B', 'Location type': 'Doppler', 'Doppler Error radius (m)': 1970, 'Location date': '2026-10-18 03:41:42.003', Longitude: 74.52, Latitude: 43.11 },
    ];
    const r = mapClsPositions(rows);
    expect(r.missing).toEqual([]); expect(r.unmappedKeys).toEqual([]); expect(r.rows).toHaveLength(2);
    const { fixes } = buildFixes(r.rows);
    expect(fixes.map((f) => f.type)).toEqual(['GPS', 'DOPPLER']);
    expect(fixes[1].errorRadiusM).toBe(1970);
    expect(new Date(fixes[0].t).toISOString()).toBe('2026-10-18T03:00:00.000Z');
  });
  it('maps camelCase / snake_case JSON', () => {
    const r = mapClsPositions([{ platformId: '43571', locationType: 'GPS', location_date: '2026-10-18T03:00:00Z', lat: 43.1, lng: 74.5, error_radius_m: 0 }]);
    expect(r.missing).toEqual([]); expect(r.rows[0].pttId).toBe('43571');
  });
  it('reports missing required fields instead of guessing', () => {
    const r = mapClsPositions([{ id: 1, foo: 'x' }]);
    expect(r.missing.length).toBeGreaterThan(0); expect(r.rows).toHaveLength(0);
  });
  it('never falls back to message date: rows without a location date are skipped', () => {
    const r = mapClsPositions([{ 'Device ID': 1, 'Location type': 'GPS', 'Location date': '', 'Message date': '2026-10-18 04:00:00', Longitude: 1, Latitude: 2 }]);
    expect(r.rows).toHaveLength(0); expect(r.skipped[0].reason).toBe('no location date');
  });
  it('maps real CLS Positions fixture (PTT 43574) with missing=[] and 0 skipped', () => {
    const r = mapClsPositions(fixture43574 as any[]);
    expect(r.missing).toEqual([]);
    expect(r.skipped).toHaveLength(0);
    expect(r.rows.length).toBe(77);
    const { fixes } = buildFixes(r.rows);
    expect(fixes.length).toBe(77);
  });
});
