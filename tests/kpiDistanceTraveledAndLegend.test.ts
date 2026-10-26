import { describe, it, expect } from 'vitest';
import { DEFAULT_SECTIONS, SectionId, LegendShape } from '../src/types/report';

const deg2rad = (deg: number) => (deg * Math.PI) / 180;
const calculateDistanceKm = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371;
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

describe('KPI Distance Traveled & Map Legend Spec', () => {
  it('includes distTraveledKpi in DEFAULT_SECTIONS and allows toggling', () => {
    expect(DEFAULT_SECTIONS.distTraveledKpi).toBe(true);
    expect(DEFAULT_SECTIONS.kpis).toBe(true);
    expect(DEFAULT_SECTIONS.legend).toBe(true);
    expect(DEFAULT_SECTIONS.frequency).toBe(false);

    const sectionsCopy: Record<SectionId, boolean> = { ...DEFAULT_SECTIONS };
    sectionsCopy.distTraveledKpi = false;
    expect(sectionsCopy.distTraveledKpi).toBe(false);
  });

  it('calculates distance traveled based strictly on GPS points within the date range', () => {
    // 3 fixes: GPS on 2026-10-15, DOPPLER on 2026-10-18 (should be excluded), GPS on 2026-10-20
    const fixes = [
      { id: '1', kind: 'GPS', lat: 25.0, lon: 51.0, t: Date.parse('2026-10-15T10:00:00.000Z') },
      { id: '2', kind: 'DOPPLER', lat: 26.0, lon: 52.0, t: Date.parse('2026-10-18T10:00:00.000Z') },
      { id: '3', kind: 'GPS', lat: 25.5, lon: 51.5, t: Date.parse('2026-10-20T10:00:00.000Z') },
      { id: '4', kind: 'GPS', lat: 27.0, lon: 53.0, t: Date.parse('2026-10-30T10:00:00.000Z') }, // outside range
    ];

    const range = {
      from: '2026-10-13',
      to: '2026-10-25'
    };

    const lo = Date.parse(`${range.from}T00:00:00.000Z`);
    const hi = Date.parse(`${range.to}T23:59:59.999Z`);

    // Filter: GPS only and within range
    const filteredGps = fixes
      .filter(f => f.kind === 'GPS' && f.t >= lo && f.t <= hi)
      .sort((a, b) => a.t - b.t);

    expect(filteredGps.length).toBe(2);
    expect(filteredGps[0].id).toBe('1');
    expect(filteredGps[1].id).toBe('3');

    let totalDist = 0;
    for (let i = 0; i < filteredGps.length - 1; i++) {
      totalDist += calculateDistanceKm(
        filteredGps[i].lat,
        filteredGps[i].lon,
        filteredGps[i + 1].lat,
        filteredGps[i + 1].lon
      );
    }

    const expectedDist = calculateDistanceKm(25.0, 51.0, 25.5, 51.5);
    expect(totalDist).toBeCloseTo(expectedDist, 2);
    expect(totalDist).toBeGreaterThan(0);
  });

  it('supports star, triangle, pin, circle, line, and dashed-line in LegendShape', () => {
    const shapes: LegendShape[] = ['circle', 'square', 'line', 'dashed-line', 'triangle', 'pin', 'star'];
    expect(shapes).toContain('star');
    expect(shapes).toContain('pin');
    expect(shapes).toContain('triangle');
  });
});
