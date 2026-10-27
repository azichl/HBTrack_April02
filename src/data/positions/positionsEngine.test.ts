import { describe, it, expect } from 'vitest';
import { buildFixes, buildTrack, filterFixes, lastFix, mapLayers, partitionByQuality, isSuspectGpsDate, parseUtc, type RawFix } from './positionsEngine';
import clsRaw from './fixtures/cls_positions_43574.json';
import appRaw from './fixtures/app_export_43574.json';

const cls: RawFix[] = clsRaw as any[];
const app: RawFix[] = appRaw as any[];
// CLS web-map window in the screenshot: 2026-10-16 07:46 -> 2026-10-17 07:46 (UTC)
const W = { fromMs: parseUtc('2026-10-16T07:46:00Z'), toMs: parseUtc('2026-10-17T07:46:00Z') };

describe('CLS Positions export (PTT 43574) is reproduced exactly', () => {
  const { fixes, rejected } = buildFixes(cls);

  it('keeps every fix once: 77 = 12 GPS + 65 Doppler, nothing rejected', () => {
    expect(rejected).toHaveLength(0);
    expect(fixes).toHaveLength(77);
    expect(fixes.filter((f) => f.type === 'GPS')).toHaveLength(12);
    expect(fixes.filter((f) => f.type === 'DOPPLER')).toHaveLength(65);
  });

  it('GPS filter + 24 h window = 12/12 positions like the CLS map', () => {
    const t = buildTrack(fixes, { ...W, type: 'GPS' });
    expect(t.points).toHaveLength(12);
    expect(t.distanceKm).toBeGreaterThan(1.5);
    expect(t.distanceKm).toBeLessThan(1.7);          // CLS GPS path ~1.6 km
    expect(t.segments).toHaveLength(1);
  });

  it('last GPS is 2026-10-17 07:00:00 (43.8748, 73.3084); last overall is the 07:41:42 Doppler', () => {
    const g = lastFix(fixes, 'GPS')!;
    expect(new Date(g.t).toISOString()).toBe('2026-10-17T07:00:00.000Z');
    expect(g.lat).toBeCloseTo(43.8748, 4); expect(g.lon).toBeCloseTo(73.3084, 4);
    const a = lastFix(fixes, 'ALL')!;
    expect(a.type).toBe('DOPPLER'); expect(new Date(a.t).toISOString()).toBe('2026-10-17T07:41:42.003Z');
  });

  it('is independent of input order (shuffled input => identical track)', () => {
    const shuffled = [...cls].sort(() => Math.random() - 0.5);
    const a = buildTrack(buildFixes(shuffled).fixes, { ...W, type: 'ALL' });
    const b = buildTrack(fixes, { ...W, type: 'ALL' });
    expect(a.points.map((p) => p.id)).toEqual(b.points.map((p) => p.id));
  });

  it('track is strictly chronological by location date', () => {
    const t = buildTrack(fixes, { ...W, type: 'ALL' }).points;
    for (let i = 1; i < t.length; i++) expect(t[i].t).toBeGreaterThanOrEqual(t[i - 1].t);
  });

  it('GPS-only filter never returns Doppler and vice-versa', () => {
    expect(filterFixes(fixes, { type: 'GPS' }).every((f) => f.type === 'GPS')).toBe(true);
    expect(filterFixes(fixes, { type: 'DOPPLER' }).every((f) => f.type === 'DOPPLER')).toBe(true);
  });

  it('re-importing the same rows creates no new fixes (idempotent ids)', () => {
    const again = buildFixes([...cls, ...cls]).fixes;
    expect(again.map((f) => f.id)).toEqual(fixes.map((f) => f.id));
  });
});

describe('Duplicates seen in the web-app export (unit types DS + Houbara)', () => {
  it('collapses DS/Houbara twins into one fix and keeps the Doppler error radius', () => {
    const { fixes } = buildFixes(app);
    const dop = fixes.filter((f) => f.type === 'DOPPLER');
    expect(app).toHaveLength(3);
    expect(fixes).toHaveLength(2);
    expect(dop).toHaveLength(1);
    expect(dop[0].errorRadiusM).toBe(1970);          // the 0 from the 'Houbara' twin must not win
    expect(dop[0].unitTypes.sort()).toEqual(['DS', 'Houbara']);
  });

  it('Doppler timestamps differing by <1 s between sources map to the same fix', () => {
    const { fixes } = buildFixes([
      ...cls.filter((r) => r.locationDate === '2026-10-17T07:41:42.003Z'),   // CLS: 07:41:42.003
      ...app.filter((r) => r.locationType === 'DOPPLER'),                    // app: 07:41:41.943
    ]);
    expect(fixes.filter((f) => f.type === 'DOPPLER')).toHaveLength(1);
  });
});

describe('Why message date must never be used', () => {
  it('the app GPS row (stamped 07:39:41) is a stale fix; ordering by it would put it AFTER the real 07:00 GPS', () => {
    const appGps = app.find((r) => r.locationType === 'GPS')!;
    // its coordinates equal the CLS GPS fix of 02:01, not the 07:00 one
    const { fixes } = buildFixes(cls);
    const match = fixes.filter((f) => f.type === 'GPS' && Math.abs(f.lat - appGps.lat) < 6e-4 && Math.abs(f.lon - appGps.lon) < 6e-4);
    expect(match.map((m) => new Date(m.t).toISOString().slice(11, 16))).toContain('02:01');
    expect(parseUtc(appGps.locationDate)).toBeGreaterThan(match[0].t); // app date is hours later than the true fix date
  });
});

describe('Map layers per LOCATION TYPE button (continuous, by location date)', () => {
  const { fixes } = buildFixes(cls);
  it('GPS button: only GPS (12 points, ~1.6 km), one continuous segment', () => {
    const l = mapLayers(fixes, { ...W, type: 'GPS' });
    expect(l.markers).toHaveLength(12);
    expect(l.markers.every((f) => f.type === 'GPS')).toBe(true);
    expect(l.line.segments).toHaveLength(1);
    expect(l.line.distanceKm).toBeGreaterThan(1.5); expect(l.line.distanceKm).toBeLessThan(1.7);
  });
  it('DOPPLER button: only Doppler with error radius <= 2000 m (53 of 65), one continuous segment', () => {
    const l = mapLayers(fixes, { ...W, type: 'DOPPLER' });
    expect(l.markers.every((f) => f.type === 'DOPPLER' && f.errorRadiusM <= 2000)).toBe(true);
    expect(l.markers).toHaveLength(53);
    expect(l.line.segments).toHaveLength(1);
  });
  it('ALL button: ONE continuous line through every accepted point: 12 GPS + 53 Doppler = 65', () => {
    const l = mapLayers(fixes, { ...W, type: 'ALL' });
    expect(l.markers).toHaveLength(65);
    expect(l.line.segments).toHaveLength(1);
    for (let i = 1; i < l.markers.length; i++) expect(l.markers[i].t).toBeGreaterThanOrEqual(l.markers[i - 1].t);
  });
  it('the Doppler error rule is the ONLY quality rule: 12 Doppler fixes > 2000 m are rejected, nothing else is dropped', () => {
    const { accepted, rejected } = partitionByQuality(fixes);
    expect(rejected).toHaveLength(12); expect(rejected.every((f) => f.type === 'DOPPLER' && f.errorRadiusM > 2000)).toBe(true);
    expect(accepted).toHaveLength(65);
  });
  it('the line is NEVER cut by default, even across a 200 h gap or a 600 km jump', () => {
    const mk = (d: string, lat: number, lon: number): RawFix => ({ pttId: '1', locationType: 'GPS', locationDate: d, lat, lon });
    const { fixes: f } = buildFixes([mk('2026-10-01T00:00:00Z', 47.1, 67.8), mk('2026-10-09T08:00:00Z', 44.4, 75.3), mk('2026-10-09T09:00:00Z', 43.9, 73.3)]);
    const t = buildTrack(f, { type: 'GPS' });
    expect(t.segments).toHaveLength(1); expect(t.points).toHaveLength(3);
  });
  it('Last position respects the type filter and the Doppler rule', () => {
    expect(lastFix(fixes, 'GPS')!.type).toBe('GPS');
    const l = lastFix(fixes, 'DOPPLER')!; expect(l.errorRadiusM).toBeLessThanOrEqual(2000);
  });
});

describe('Stale GPS re-sent later must not reorder or leak into the window (location date is the key)', () => {
  it('synthetic: old Zhezqazgan fix delivered late is excluded from a 7-day window and never reorders the line', () => {
    const mk = (d: string, lat: number, lon: number, msg: string): RawFix => ({ pttId: '43574', locationType: 'GPS', locationDate: d, lat, lon, messageDate: msg });
    const rows = [
      mk('2026-10-07T09:00:00Z', 47.14, 67.81, '2026-10-14T05:00:00Z'),
      mk('2026-10-13T12:00:00Z', 44.40, 75.29, '2026-10-14T06:00:00Z'),
      mk('2026-10-14T01:02:00Z', 43.87, 73.30, '2026-10-14T01:05:00Z'),
      mk('2026-10-14T02:02:00Z', 43.87, 73.30, '2026-10-14T07:00:00Z'),
    ];
    const { fixes: f } = buildFixes(rows);
    const t = buildTrack(f, { fromMs: parseUtc('2026-10-10T00:00:00Z'), toMs: parseUtc('2026-10-17T00:00:00Z'), type: 'GPS' });
    expect(t.points.map((p) => p.lat)).toEqual([44.40, 43.87, 43.87]);
  });
  it('app stamp check: a GPS "location date" that is not :00/:01 seconds is an arrival time, not a fix time', () => {
    const gps = cls.filter((r) => r.locationType === 'GPS');
    expect(gps.every((r) => /:0[01]\.000Z$/.test(r.locationDate as string))).toBe(true);
  });
});

describe('GPS date QA signature', () => {
  it('every genuine CLS GPS fix has a whole-minute date; the app stamp 14:38:10 would be flagged', () => {
    const { fixes } = buildFixes(cls);
    expect(fixes.filter((f) => f.type === 'GPS').some(isSuspectGpsDate)).toBe(false);
    const { fixes: s } = buildFixes([{ pttId: '43571', locationType: 'GPS', locationDate: '2026-10-17T09:38:10Z', lat: 44.4786, lon: 74.9453 }]);
    expect(isSuspectGpsDate(s[0])).toBe(true);
  });
});

describe('Doppler revisions and epoch inputs', () => {
  it('a higher dopplerRevision of the same location supersedes the lower one (same fix id)', () => {
    const base = { pttId: '1', locationType: 'Doppler', locationDate: '2026-10-18T03:41:42.003Z' } as const;
    const { fixes } = buildFixes([
      { ...base, lat: 10.0, lon: 20.0, errorRadiusM: 1900, locationClass: '0', revision: 1 },
      { ...base, lat: 10.001, lon: 20.001, errorRadiusM: 800, locationClass: '1', revision: 2 },
      { ...base, lat: 9.0, lon: 19.0, errorRadiusM: 5000, locationClass: 'B', revision: 1 },   // late duplicate of the OLD revision
    ]);
    expect(fixes).toHaveLength(1);
    expect(fixes[0]).toMatchObject({ lat: 10.001, lon: 20.001, errorRadiusM: 800, cls: '1', revision: 2 });
  });
  it('epoch seconds and milliseconds are both accepted', () => {
    expect(parseUtc(1_792_292_400)).toBe(1_792_292_400_000);
    expect(parseUtc(1_792_292_400_000)).toBe(1_792_292_400_000);
  });
});
