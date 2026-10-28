import { describe, it, expect } from 'vitest';
import { haversineKm } from '../src/data/positions/positionsEngine';
import { buildColoredTrackSegments, FlightTrackConfig } from '../components/reports/FlightTrackCustomizer';
import { parseReleaseDateMs } from '../utils/formatting';

describe('Track Segmentation & Anti-Zigzag Across All Periods', () => {
  it('parseReleaseDateMs correctly handles YYYY-MM-DD, DD/MM/YYYY, and ISO timestamps', () => {
    // Bird 43571: 2026-10-10
    const ms43571 = parseReleaseDateMs('2026-10-10');
    expect(ms43571).toBe(Date.UTC(2026, 9, 10, 0, 0, 0, 0));

    // Bird 43574: 13/10/2026
    const ms43574 = parseReleaseDateMs('13/10/2026');
    expect(ms43574).toBe(Date.UTC(2026, 9, 13, 0, 0, 0, 0));

    // Bird 43575: 2026-10-13T08:30:00Z
    const ms43575 = parseReleaseDateMs('2026-10-13T08:30:00.000Z');
    expect(ms43575).toBe(new Date('2026-10-13T08:30:00.000Z').getTime());

    // Null / empty
    expect(parseReleaseDateMs(null)).toBeNull();
    expect(parseReleaseDateMs('')).toBeNull();
  });

  it('filters out pre-release positions (hides holding camps and transport prior to release time)', () => {
    const releaseDate = '2026-10-13';
    const relMs = parseReleaseDateMs(releaseDate)!;

    const allPositions = [
      // September holding camp positions
      { lat: 44.3985, lon: 75.2889, locationDate: '2026-09-28T09:00:00.000Z' },
      { lat: 44.3986, lon: 75.2890, locationDate: '2026-09-30T09:00:00.000Z' },
      // October 6 camp positions
      { lat: 47.1435, lon: 67.8111, locationDate: '2026-10-06T04:00:00.000Z' },
      // Release day and migration positions
      { lat: 44.4031, lon: 75.2424, locationDate: '2026-10-13T06:00:00.000Z' },
      { lat: 43.5000, lon: 74.1000, locationDate: '2026-10-14T12:00:00.000Z' },
      { lat: 33.7366, lon: 68.2591, locationDate: '2026-10-26T01:02:00.000Z' },
    ];

    const postReleasePositions = allPositions.filter(p => {
      const pTime = new Date(p.locationDate).getTime();
      return !isNaN(pTime) && pTime >= relMs;
    });

    expect(postReleasePositions.length).toBe(3);
    expect(postReleasePositions[0].locationDate).toBe('2026-10-13T06:00:00.000Z');
    expect(postReleasePositions[2].locationDate).toBe('2026-10-26T01:02:00.000Z');
  });
  it('haversineKm calculates distance accurately between Kazakhstan camps', () => {
    // Almaty Camp (44.3985, 75.2889) to Zhezkazgan Camp (47.1435, 67.8111)
    const dist = haversineKm(44.3985, 75.2889, 47.1435, 67.8111);
    expect(dist).toBeGreaterThan(640);
    expect(dist).toBeLessThan(660);
  });

  it('cuts track into separate segments when a multi-day silence gap occurs across distant camps', () => {
    // Raw points mimicking 43575:
    // 3 points in Almaty on Sept 28-30
    // 6-day silence gap
    // 3 points in Zhezkazgan on Oct 6-7
    // 6-day silence gap
    // 3 points in Almaty/Wild on Oct 13-14
    const points = [
      // Almaty Camp
      { lat: 44.3985, lon: 75.2889, locationDate: '2026-09-28T09:00:00.000Z', type: 'GPS' },
      { lat: 44.3986, lon: 75.2890, locationDate: '2026-09-29T09:00:00.000Z', type: 'GPS' },
      { lat: 44.3985, lon: 75.2889, locationDate: '2026-09-30T09:00:00.000Z', type: 'GPS' },
      // Zhezkazgan Camp (650km away, 6 days later)
      { lat: 47.1435, lon: 67.8111, locationDate: '2026-10-06T04:00:00.000Z', type: 'GPS' },
      { lat: 47.1436, lon: 67.8112, locationDate: '2026-10-06T12:00:00.000Z', type: 'GPS' },
      { lat: 47.1435, lon: 67.8111, locationDate: '2026-10-07T09:00:00.000Z', type: 'GPS' },
      // Almaty Release & Wild Flight (650km return, 6 days later)
      { lat: 44.4031, lon: 75.2424, locationDate: '2026-10-13T04:00:00.000Z', type: 'GPS' },
      { lat: 44.3500, lon: 75.1000, locationDate: '2026-10-13T12:00:00.000Z', type: 'GPS' },
      { lat: 44.2000, lon: 74.9000, locationDate: '2026-10-14T06:00:00.000Z', type: 'GPS' },
    ];

    const config: FlightTrackConfig = {
      enabled: true,
      locationType: 'ALL',
      useColorPeriods: false,
      defaultColor: '#10b981',
      lineWeight: 3,
      lineDashed: false,
      showTrackPoints: true,
      periods: []
    };

    const result = buildColoredTrackSegments(points, config);

    // Should be broken into 3 independent segments!
    expect(result.segments.length).toBe(3);

    // Segment 1: Almaty Camp (Sept 28-30)
    expect(result.segments[0].positions.length).toBe(3);
    expect(result.segments[0].positions[0][0]).toBeCloseTo(44.3985, 2);
    expect(result.segments[0].positions[2][0]).toBeCloseTo(44.3985, 2);

    // Segment 2: Zhezkazgan Camp (Oct 6-7)
    expect(result.segments[1].positions.length).toBe(3);
    expect(result.segments[1].positions[0][0]).toBeCloseTo(47.1435, 2);
    expect(result.segments[1].positions[2][0]).toBeCloseTo(47.1435, 2);

    // Segment 3: Wild flight (Oct 13-14)
    expect(result.segments[2].positions.length).toBe(3);
    expect(result.segments[2].positions[0][0]).toBeCloseTo(44.4031, 2);

    // Confirm that NO segment contains a 650km line jump
    for (const seg of result.segments) {
      for (let i = 1; i < seg.positions.length; i++) {
        const segDist = haversineKm(
          seg.positions[i-1][0], seg.positions[i-1][1],
          seg.positions[i][0], seg.positions[i][1]
        );
        expect(segDist).toBeLessThan(60); // All consecutive points within a segment are close
      }
    }
  });

  it('keeps normal migration flight tracks intact as a single continuous segment', () => {
    // Normal continuous migration: fixes every 2-3 hours moving 20-50 km
    const migrationPoints = [
      { lat: 44.40, lon: 75.24, locationDate: '2026-10-13T06:00:00.000Z', type: 'GPS' },
      { lat: 44.20, lon: 75.00, locationDate: '2026-10-13T09:00:00.000Z', type: 'GPS' },
      { lat: 43.90, lon: 74.60, locationDate: '2026-10-13T12:00:00.000Z', type: 'GPS' },
      { lat: 43.50, lon: 74.10, locationDate: '2026-10-13T16:00:00.000Z', type: 'GPS' },
      // Overnight rest: 10h gap, but distance is only 0.5 km (roosting)
      { lat: 43.51, lon: 74.11, locationDate: '2026-10-14T02:00:00.000Z', type: 'GPS' },
      { lat: 43.00, lon: 73.50, locationDate: '2026-10-14T06:00:00.000Z', type: 'GPS' },
    ];

    const config: FlightTrackConfig = {
      enabled: true,
      locationType: 'ALL',
      useColorPeriods: false,
      defaultColor: '#6366f1',
      lineWeight: 3,
      lineDashed: false,
      showTrackPoints: true,
      periods: []
    };

    const result = buildColoredTrackSegments(migrationPoints, config);

    // Entire normal migration flight stays together in 1 segment!
    expect(result.segments.length).toBe(1);
    expect(result.segments[0].positions.length).toBe(6);
  });
});
