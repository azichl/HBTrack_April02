import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  buildFixes,
  buildTrack,
  filterFixes,
  lastFix,
  mapLayers,
  parseUtc,
  isSuspectGpsDate,
  partitionByQuality,
  type RawFix
} from './positionsEngine';

const cls: RawFix[] = JSON.parse(readFileSync(new URL('./fixtures/cls_positions_43574.json', import.meta.url), 'utf8'));
const app: RawFix[] = JSON.parse(readFileSync(new URL('./fixtures/app_export_43574.json', import.meta.url), 'utf8'));
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

describe('Doppler quality gate & rejection (>2000m)', () => {
  const { fixes } = buildFixes(cls);

  it('rejects Doppler fixes with error > 2000 m by default (53 accepted, 12 rejected out of 65)', () => {
    const dopAll = filterFixes(fixes, { ...W, type: 'DOPPLER', dopplerMaxErrorM: 0 });
    expect(dopAll).toHaveLength(65);

    const dopAccepted = filterFixes(fixes, { ...W, type: 'DOPPLER' }); // default 2000m
    expect(dopAccepted).toHaveLength(53);

    const partition = partitionByQuality(dopAll);
    expect(partition.accepted).toHaveLength(53);
    expect(partition.rejected).toHaveLength(12);
    expect(partition.rejected.every(r => r.reason === 'doppler_error_gt_2000')).toBe(true);
  });

  it('GPS fixes (error 0) are never affected by Doppler error threshold', () => {
    const gpsAccepted = filterFixes(fixes, { ...W, type: 'GPS', dopplerMaxErrorM: 500 });
    expect(gpsAccepted).toHaveLength(12);
  });

  it('Doppler fixes with unknown error (0 or null) are kept', () => {
    const syntheticDop: RawFix = {
      pttId: '43574',
      locationType: 'DOPPLER',
      locationDate: '2026-10-17T05:00:00.000Z',
      lat: 43.87,
      lon: 73.33,
      errorRadiusM: 0
    };
    const { fixes: synFixes } = buildFixes([syntheticDop]);
    const filtered = filterFixes(synFixes, { dopplerMaxErrorM: 2000 });
    expect(filtered).toHaveLength(1);
  });
});

describe('Map layers per LOCATION TYPE button (Track v4)', () => {
  const { fixes } = buildFixes(cls);

  it('GPS button: only GPS in line and markers (12 points, 1 segment)', () => {
    const l = mapLayers(fixes, { ...W, type: 'GPS' });
    expect(l.markers.every((f) => f.type === 'GPS')).toBe(true);
    expect(l.line.points.every((f) => f.type === 'GPS')).toBe(true);
    expect(l.line.points).toHaveLength(12);
    expect(l.line.segments).toHaveLength(1);
    expect(l.dopplerDots).toHaveLength(0);
  });

  it('DOPPLER button: only Doppler <= 2000m in line and markers (53 points, 1 segment)', () => {
    const l = mapLayers(fixes, { ...W, type: 'DOPPLER' });
    expect(l.line.points.every((f) => f.type === 'DOPPLER')).toBe(true);
    expect(l.line.points).toHaveLength(53);
    expect(l.markers).toHaveLength(53);
    expect(l.line.segments).toHaveLength(1);
    expect(l.line.points.every(f => f.errorRadiusM <= 2000)).toBe(true);
  });

  it('ALL button: one continuous polyline through all 65 points (12 GPS + 53 Doppler), exactly 1 segment', () => {
    const l = mapLayers(fixes, { ...W, type: 'ALL' });
    expect(l.line.points).toHaveLength(65);
    expect(l.markers).toHaveLength(65);
    expect(l.line.segments).toHaveLength(1);
    expect(l.dopplerDots).toHaveLength(0);
  });

  it('styledSegments distinguishes GPS->GPS segments from Doppler segments without hiding points', () => {
    const l = mapLayers(fixes, { ...W, type: 'ALL' });
    expect(l.styledSegments).toBeDefined();
    expect(l.styledSegments?.length).toBe(64); // 65 points => 64 segment segments
  });
});

describe('GPS date validity checking (isSuspectGpsDate)', () => {
  it('flags GPS dates with seconds != 0 or ms != 0 and accepts whole-minute dates', () => {
    expect(isSuspectGpsDate('2026-10-17T07:00:00.000Z')).toBe(false);
    expect(isSuspectGpsDate('2026-10-17T02:01:00.000Z')).toBe(false);
    expect(isSuspectGpsDate('2026-10-17T07:39:41.963Z')).toBe(true);
    expect(isSuspectGpsDate('2026-10-17T14:38:10.000Z')).toBe(true);
  });
});

describe('Multi-place history (messages file) — message-date ordering zig-zags, location-date ordering does not', () => {
  it('synthetic: stale GPS fixes re-sent later must not reorder the track', () => {
    const mk = (d: string, lat: number, lon: number, msg: string): RawFix => ({ pttId: '43574', locationType: 'GPS', locationDate: d, lat, lon, messageDate: msg });
    const rows = [
      mk('2026-10-07T09:00:00Z', 47.14, 67.81, '2026-10-14T05:00:00Z'), // old fix at Zhezqazgan camp, delivered 7 days late
      mk('2026-10-13T12:00:00Z', 44.40, 75.29, '2026-10-14T06:00:00Z'), // Almaty camp
      mk('2026-10-14T01:02:00Z', 43.87, 73.30, '2026-10-14T01:05:00Z'), // current area
      mk('2026-10-14T02:02:00Z', 43.87, 73.30, '2026-10-14T07:00:00Z'),
    ];
    const { fixes: f } = buildFixes(rows);
    const win = { fromMs: parseUtc('2026-10-10T00:00:00Z'), toMs: parseUtc('2026-10-17T00:00:00Z'), type: 'GPS' as const };
    const t = buildTrack(f, win);
    expect(t.points.map((p) => p.lat)).toEqual([44.40, 43.87, 43.87]);   // Zhezqazgan fix excluded by LOCATION date
  });
});
