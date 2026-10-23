import { describe, it, expect } from 'vitest';
import { DEFAULT_TRACK_SETTINGS, TrackPathSettings } from '../src/types/track';
import { buildColoredTrackSegments, FlightTrackConfig } from '../components/reports/FlightTrackCustomizer';

describe('Track Path Popover Contracts (§3)', () => {
  const samplePoints = [
    { lat: 46.85, lon: 67.01, ts: '2024-04-01T10:00:00Z', type: 'GPS' },
    { lat: 46.86, lon: 67.02, ts: '2024-04-02T10:00:00Z', type: 'DOPPLER' },
    { lat: 46.87, lon: 67.03, ts: '2024-04-03T10:00:00Z', type: 'GPS' },
    { lat: 46.88, lon: 67.04, ts: '2024-04-04T10:00:00Z', type: 'DOPPLER' },
  ];

  it('filters points by location type: ALL / GPS / DOPPLER', () => {
    const configAll: FlightTrackConfig = {
      enabled: true,
      locationType: 'ALL',
      defaultColor: '#6366f1',
      lineWeight: 3,
      lineDashed: false,
      showTrackPoints: true,
      useColorPeriods: false,
      periods: []
    };
    const resAll = buildColoredTrackSegments(samplePoints, configAll);
    expect(resAll.filteredPoints.length).toBe(4);

    const configGps: FlightTrackConfig = { ...configAll, locationType: 'GPS' };
    const resGps = buildColoredTrackSegments(samplePoints, configGps);
    expect(resGps.filteredPoints.length).toBe(2);
    expect(resGps.filteredPoints.every(p => p.type === 'GPS')).toBe(true);

    const configDoppler: FlightTrackConfig = { ...configAll, locationType: 'DOPPLER' };
    const resDoppler = buildColoredTrackSegments(samplePoints, configDoppler);
    expect(resDoppler.filteredPoints.length).toBe(2);
    expect(resDoppler.filteredPoints.every(p => p.type === 'DOPPLER')).toBe(true);
  });

  it('filters points by date range (from / to)', () => {
    const configDate: FlightTrackConfig = {
      enabled: true,
      locationType: 'ALL',
      filterStartDate: '2024-04-02',
      filterEndDate: '2024-04-03',
      defaultColor: '#6366f1',
      lineWeight: 3,
      lineDashed: false,
      showTrackPoints: true,
      useColorPeriods: false,
      periods: []
    };
    const res = buildColoredTrackSegments(samplePoints, configDate);
    expect(res.filteredPoints.length).toBe(2);
  });

  it('segments path by periods with custom colors', () => {
    const configPeriods: FlightTrackConfig = {
      enabled: true,
      locationType: 'ALL',
      defaultColor: '#6366f1',
      lineWeight: 3,
      lineDashed: false,
      showTrackPoints: true,
      useColorPeriods: true,
      periods: [
        {
          id: 'p1',
          label: 'Period 1',
          startDate: '2024-04-01',
          endDate: '2024-04-02',
          color: '#ef4444'
        },
        {
          id: 'p2',
          label: 'Period 2',
          startDate: '2024-04-03',
          endDate: '2024-04-04',
          color: '#10b981'
        }
      ]
    };
    const res = buildColoredTrackSegments(samplePoints, configPeriods);
    expect(res.segments.length).toBe(2);
    expect(res.segments[0].color).toBe('#ef4444');
    expect(res.segments[1].color).toBe('#10b981');
  });

  it('defaults track settings properly', () => {
    expect(DEFAULT_TRACK_SETTINGS.show).toBe(true);
    expect(DEFAULT_TRACK_SETTINGS.type).toBe('ALL');
    expect(DEFAULT_TRACK_SETTINGS.color).toBe('#6366f1');
    expect(DEFAULT_TRACK_SETTINGS.width).toBe(3);
    expect(DEFAULT_TRACK_SETTINGS.showPoints).toBe(false);
    expect(DEFAULT_TRACK_SETTINGS.showCoordinateLabels).toBe(false);
  });
});
