import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  DEFAULT_TRACK_SETTINGS as D, Fix, TrackSettings, buildTrackRenderModel, filterFixes,
  formatCoord, thinLabels, validateSettings,
} from './trackRenderModel';

const d = (iso: string) => Date.parse(`${iso}T12:00:00Z`);
// 10 fixes: 6 GPS, 4 Doppler, Jan..Oct 2026 (one per month)
const fixes: Fix[] = [
  ['2026-01-10','GPS'],['2026-02-10','DOPPLER'],['2026-03-10','GPS'],['2026-04-10','GPS'],['2026-05-10','DOPPLER'],
  ['2026-06-10','GPS'],['2026-07-10','DOPPLER'],['2026-08-10','GPS'],['2026-09-10','DOPPLER'],['2026-10-10','GPS'],
].map(([iso, kind], i) => ({ id: `f${i}`, t: d(iso), lat: 46 + i * 0.1, lon: 66 + i * 0.1, kind: kind as 'GPS'|'DOPPLER' }));
const S = (o: Partial<TrackSettings> = {}): TrackSettings => ({ ...D, ...o });

test('type filter', () => {
  assert.equal(buildTrackRenderModel(fixes, S()).shown, 10);
  assert.equal(buildTrackRenderModel(fixes, S({ type: 'GPS' })).shown, 6);
  assert.equal(buildTrackRenderModel(fixes, S({ type: 'DOPPLER' })).shown, 4);
});
test('date range inclusive UTC day', () => {
  assert.equal(filterFixes(fixes, S({ from: '2026-03-10', to: '2026-05-10' })).length, 3);
  assert.equal(filterFixes(fixes, S({ from: '2026-10-11' })).length, 0);
});
test('inverted range -> invalid, nothing drawn', () => {
  const m = buildTrackRenderModel(fixes, S({ from: '2026-06-01', to: '2026-05-01' }));
  assert.equal(m.validation.ok, false); assert.equal(m.segments.length, 0);
});
test('periods split + colours, no gaps', () => {
  const m = buildTrackRenderModel(fixes, S({ periodsEnabled: true, periods: [
    { id: 'a', from: '2026-01-01', to: '2026-04-30', color: '#ff0000' },
    { id: 'b', from: '2026-05-01', to: '2026-10-31', color: '#00ff00' }] }));
  assert.equal(m.segments.length, 2);
  assert.equal(m.segments[0].color, '#ff0000'); assert.equal(m.segments[1].color, '#00ff00');
  // second segment starts at last point of first (continuous line)
  assert.deepEqual(m.segments[1].coords[0], m.segments[0].coords.at(-1));
  assert.equal(m.legend.length, 2);
});
test('uncovered dates use default colour', () => {
  const m = buildTrackRenderModel(fixes, S({ periodsEnabled: true, periods: [
    { id: 'a', from: '2026-01-01', to: '2026-02-28', color: '#ff0000' }] }));
  assert.equal(m.segments.at(-1)!.color, D.color);
});
test('overlap warns, first wins', () => {
  const s = S({ periodsEnabled: true, periods: [
    { id: 'a', from: '2026-01-01', to: '2026-06-30', color: '#ff0000' },
    { id: 'b', from: '2026-06-01', to: '2026-12-31', color: '#00ff00' }] });
  assert.equal(validateSettings(s).warnings.length, 1);
  const m = buildTrackRenderModel(fixes, s);
  assert.equal(m.segments[0].color, '#ff0000');
});
test('points: size, colour modes, labels imply points', () => {
  assert.equal(buildTrackRenderModel(fixes, S()).markers.length, 0);
  const m = buildTrackRenderModel(fixes, S({ showPoints: true, pointSize: 9, pointColorMode: 'type' }));
  assert.equal(m.markers.length, 10); assert.equal(m.markers[0].diameter, 9);
  assert.equal(m.markers[0].fill, D.gpsColor); assert.equal(m.markers[1].fill, D.dopplerColor);
  assert.equal(buildTrackRenderModel(fixes, S({ showCoordinateLabels: true })).markers.length, 10);
});
test('show=false draws nothing', () => {
  const m = buildTrackRenderModel(fixes, S({ show: false }));
  assert.equal(m.segments.length + m.markers.length, 0);
});
test('coordinate formats (legacy DMM matches report table)', () => {
  assert.equal(formatCoord(46.85456, 'lat', 'DMM'), "46° 51.2736′ N");
  assert.equal(formatCoord(66.90811, 'lon', 'DMM'), "066° 54.4866′ E");
  assert.equal(formatCoord(46.85456, 'lat', 'DD'), "46.85456° N");
  assert.equal(formatCoord(46.85456, 'lat', 'DMS'), "46° 51′ 16.42″ N");
  assert.equal(formatCoord(46.999999999, 'lat', 'DMM'), "47° 00.0000′ N"); // carry-safe
});
test('label thinning respects spacing, bounds and avoid-rects', () => {
  const m = buildTrackRenderModel(fixes, S({ showCoordinateLabels: true })).markers;
  const project = (lat: number, lon: number) => ({ x: (lon - 66) * 200, y: (lat - 46) * 200 }); // 20px apart
  const kept = thinLabels(m, project, 70, { w: 1000, h: 1000 });
  for (let i = 0; i < kept.length; i++) for (let j = i + 1; j < kept.length; j++)
    assert.ok(Math.hypot(kept[i].x - kept[j].x, kept[i].y - kept[j].y) >= 70);
  assert.ok(kept.length >= 2 && kept.length < m.length);
  const none = thinLabels(m, project, 10, { w: 1000, h: 1000 }, [{ x: 0, y: 0, w: 1000, h: 1000 }]);
  assert.equal(none.length, 0);
});
