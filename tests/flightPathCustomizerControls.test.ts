import { describe, it, expect } from 'vitest';
import {
  DEFAULT_TRACK_SETTINGS,
  TrackSettings,
  Fix,
  buildTrackRenderModel,
  validateSettings,
  filterFixes,
  formatCoord,
  thinLabels
} from '../src/features/report-track/trackRenderModel';
import { buildSvgOverlay, dashArray } from '../src/features/report-track/svgTrackOverlay';
import { liveToReportSettings } from '../src/features/report-track/useReportTrackSettings';

describe('Flight Path Customizer Table of Controls (§5)', () => {
  const d = (iso: string) => Date.parse(`${iso}T12:00:00Z`);
  const fixes: Fix[] = [
    { id: 'f0', t: d('2026-01-10'), lat: 46.1, lon: 66.1, kind: 'GPS' },
    { id: 'f1', t: d('2026-02-10'), lat: 46.2, lon: 66.2, kind: 'DOPPLER' },
    { id: 'f2', t: d('2026-03-10'), lat: 46.3, lon: 66.3, kind: 'GPS' },
    { id: 'f3', t: d('2026-04-10'), lat: 46.4, lon: 66.4, kind: 'GPS' },
    { id: 'f4', t: d('2026-05-10'), lat: 46.5, lon: 66.5, kind: 'DOPPLER' },
    { id: 'f5', t: d('2026-06-10'), lat: 46.6, lon: 66.6, kind: 'GPS' },
  ];

  const project = (lat: number, lon: number) => ({ x: (lon - 66) * 300, y: (lat - 46) * 300 });
  const bounds = { w: 1000, h: 1000 };

  it('1. Point Type (type): filters line, markers, and updates shown counter', () => {
    const sAll: TrackSettings = { ...DEFAULT_TRACK_SETTINGS, type: 'ALL', showPoints: true };
    const mAll = buildTrackRenderModel(fixes, sAll);
    expect(mAll.shown).toBe(6);
    expect(mAll.markers.length).toBe(6);

    const sGps: TrackSettings = { ...sAll, type: 'GPS' };
    const mGps = buildTrackRenderModel(fixes, sGps);
    expect(mGps.shown).toBe(4);
    expect(mGps.filtered.every(f => f.kind === 'GPS')).toBe(true);

    const sDop: TrackSettings = { ...sAll, type: 'DOPPLER' };
    const mDop = buildTrackRenderModel(fixes, sDop);
    expect(mDop.shown).toBe(2);
    expect(mDop.filtered.every(f => f.kind === 'DOPPLER')).toBe(true);
  });

  it('2. Date from / to: inclusive filtering and inverted range validation', () => {
    const sDate: TrackSettings = { ...DEFAULT_TRACK_SETTINGS, from: '2026-02-01', to: '2026-04-15' };
    const mDate = buildTrackRenderModel(fixes, sDate);
    expect(mDate.shown).toBe(3); // f1, f2, f3

    const sInv: TrackSettings = { ...DEFAULT_TRACK_SETTINGS, from: '2026-05-01', to: '2026-02-01' };
    const val = validateSettings(sInv);
    expect(val.ok).toBe(false);
    expect(val.errors[0]).toContain('"From" is after "To"');
    const mInv = buildTrackRenderModel(fixes, sInv);
    expect(mInv.shown).toBe(0);
    expect(mInv.segments.length).toBe(0);
  });

  it('3. Line colour (color): updates SVG line stroke color', () => {
    const sColor: TrackSettings = { ...DEFAULT_TRACK_SETTINGS, color: '#ec4899' };
    const m = buildTrackRenderModel(fixes, sColor);
    const svg = buildSvgOverlay(m, sColor, project, bounds);
    expect(svg.lines[0].color).toBe('#ec4899');
  });

  it('4. Width (width): updates SVG line stroke width (1..8 px)', () => {
    const sWidth: TrackSettings = { ...DEFAULT_TRACK_SETTINGS, width: 5.5 };
    const m = buildTrackRenderModel(fixes, sWidth);
    const svg = buildSvgOverlay(m, sWidth, project, bounds);
    expect(svg.lines[0].width).toBe(5.5);
  });

  it('5. Opacity (opacity): updates SVG stroke opacity', () => {
    const sOpacity: TrackSettings = { ...DEFAULT_TRACK_SETTINGS, opacity: 0.65 };
    const m = buildTrackRenderModel(fixes, sOpacity);
    const svg = buildSvgOverlay(m, sOpacity, project, bounds);
    expect(svg.lines[0].opacity).toBe(0.65);
  });

  it('6. Style solid / dashed / dotted (dash): produces correct stroke-dasharray', () => {
    expect(dashArray('solid', 4)).toBeUndefined();
    expect(dashArray('dashed', 4)).toBe('12 8');
    expect(dashArray('dotted', 4)).toBe('0.1 8.8');

    const sDash: TrackSettings = { ...DEFAULT_TRACK_SETTINGS, dash: 'dashed', width: 3 };
    const m = buildTrackRenderModel(fixes, sDash);
    const svg = buildSvgOverlay(m, sDash, project, bounds);
    expect(svg.lines[0].dash).toBe('9 6');
  });

  it('7. Points switch (showPoints): toggles point markers generation', () => {
    const sOff: TrackSettings = { ...DEFAULT_TRACK_SETTINGS, showPoints: false };
    const mOff = buildTrackRenderModel(fixes, sOff);
    expect(mOff.markers.length).toBe(0);

    const sOn: TrackSettings = { ...DEFAULT_TRACK_SETTINGS, showPoints: true };
    const mOn = buildTrackRenderModel(fixes, sOn);
    expect(mOn.markers.length).toBe(6);
  });

  it('8. Point size 2..16 px (pointSize): updates marker diameter and halo in SVG', () => {
    const sSize: TrackSettings = { ...DEFAULT_TRACK_SETTINGS, showPoints: true, pointSize: 12 };
    const m = buildTrackRenderModel(fixes, sSize);
    expect(m.markers[0].diameter).toBe(12);

    const svg = buildSvgOverlay(m, sSize, project, bounds);
    expect(svg.dots[0].size).toBe(12);
    expect(svg.haloDots[0].size).toBe(14); // halo is size + 2
  });

  it('9. Point opacity (pointOpacity): updates marker fill opacity', () => {
    const sOp: TrackSettings = { ...DEFAULT_TRACK_SETTINGS, showPoints: true, pointOpacity: 0.45 };
    const m = buildTrackRenderModel(fixes, sOp);
    expect(m.markers[0].opacity).toBe(0.45);
    const svg = buildSvgOverlay(m, sOp, project, bounds);
    expect(svg.dots[0].opacity).toBe(0.45);
  });

  it('10. Point colour mode (pointColorMode): track / type / period with GPS & Doppler swatches', () => {
    // Mode: type
    const sType: TrackSettings = {
      ...DEFAULT_TRACK_SETTINGS,
      showPoints: true,
      pointColorMode: 'type',
      gpsColor: '#10b981',
      dopplerColor: '#f97316'
    };
    const mType = buildTrackRenderModel(fixes, sType);
    expect(mType.markers.find(f => f.kind === 'GPS')?.fill).toBe('#10b981');
    expect(mType.markers.find(f => f.kind === 'DOPPLER')?.fill).toBe('#f97316');

    // Mode: period
    const sPer: TrackSettings = {
      ...DEFAULT_TRACK_SETTINGS,
      showPoints: true,
      pointColorMode: 'period',
      periodsEnabled: true,
      periods: [{ id: 'p1', from: '2026-01-01', to: '2026-02-28', color: '#8b5cf6' }]
    };
    const mPer = buildTrackRenderModel(fixes, sPer);
    expect(mPer.markers[0].fill).toBe('#8b5cf6'); // inside period
    expect(mPer.markers[5].fill).toBe(DEFAULT_TRACK_SETTINGS.color); // outside period
  });

  it('11. Show coordinates on map: automatically implies points, renders non-overlapping labels', () => {
    const sLabels: TrackSettings = {
      ...DEFAULT_TRACK_SETTINGS,
      showCoordinateLabels: true,
      labelMinSpacingPx: 80,
      coordFormat: 'DMM'
    };
    const m = buildTrackRenderModel(fixes, sLabels);
    expect(m.markers.length).toBe(6); // labels auto-imply markers

    const svg = buildSvgOverlay(m, sLabels, project, bounds);
    expect(svg.labels.length).toBeGreaterThan(0);
    expect(svg.labels.length).toBeLessThanOrEqual(fixes.length);
    expect(svg.labels[0].text).toContain('°');
    expect(svg.labels[0].text).toContain('′');
  });

  it('12. Coordinate format: DMM, DD, DMS', () => {
    expect(formatCoord(46.85456, 'lat', 'DMM')).toBe("46° 51.2736′ N");
    expect(formatCoord(46.85456, 'lat', 'DD')).toBe("46.85456° N");
    expect(formatCoord(46.85456, 'lat', 'DMS')).toBe("46° 51′ 16.42″ N");
  });

  it('13. Multi-period coloring: split segments, joined end-to-end, legend entries', () => {
    const sPeriods: TrackSettings = {
      ...DEFAULT_TRACK_SETTINGS,
      periodsEnabled: true,
      periods: [
        { id: 'p1', from: '2026-01-01', to: '2026-03-31', color: '#2563eb', label: 'Winter' },
        { id: 'p2', from: '2026-04-01', to: '2026-10-31', color: '#ea580c', label: 'Summer' }
      ]
    };
    const m = buildTrackRenderModel(fixes, sPeriods);
    expect(m.segments.length).toBe(2);
    expect(m.segments[0].color).toBe('#2563eb');
    expect(m.segments[1].color).toBe('#ea580c');
    expect(m.legend.length).toBe(2);
    expect(m.legend[0].label).toBe('Winter');
    expect(m.legend[1].label).toBe('Summer');
  });

  it('14. Import from live map: initializes settings with live options', () => {
    const live = liveToReportSettings();
    expect(live.show).toBe(true);
    expect(live.type).toBe('ALL');
    expect(live.color).toBe('#6366f1');
    expect(live.coordFormat).toBe('DMM');
    expect(live.gpsColor).toBe('#16a34a');
    expect(live.dopplerColor).toBe('#f59e0b');
  });
});
