import { test } from 'vitest';
import assert from 'node:assert/strict';
import { DEFAULT_TRACK_SETTINGS as D, Fix, TrackSettings, buildTrackRenderModel } from './trackRenderModel';
import { buildSvgOverlay, dashArray } from './svgTrackOverlay';

const d = (iso: string) => Date.parse(`${iso}T12:00:00Z`);
const fixes: Fix[] = [
  ['2026-01-10','GPS'],['2026-02-10','DOPPLER'],['2026-03-10','GPS'],['2026-04-10','GPS'],['2026-05-10','DOPPLER'],
  ['2026-06-10','GPS'],['2026-07-10','DOPPLER'],['2026-08-10','GPS'],['2026-09-10','DOPPLER'],['2026-10-10','GPS'],
].map(([iso, kind], i) => ({ id: `f${i}`, t: d(iso), lat: 46 + i * 0.1, lon: 66 + i * 0.1, kind: kind as 'GPS'|'DOPPLER' }));
const S = (o: Partial<TrackSettings> = {}): TrackSettings => ({ ...D, ...o });
const project = (lat: number, lon: number) => ({ x: (lon - 66) * 300, y: (lat - 46) * 300 });
const B = { w: 1000, h: 1000 };
const build = (o: Partial<TrackSettings>) => { const s = S(o); return buildSvgOverlay(buildTrackRenderModel(fixes, s), s, project, B); };

test('line only by default: 1 path, no dots, no labels', () => {
  const o = build({});
  assert.equal(o.lines.length, 1); assert.equal(o.dots.length, 0); assert.equal(o.labels.length, 0);
  assert.ok(o.lines[0].d.startsWith('M0 0L30 30'));
  assert.equal(o.stats.vertices, 10);
});
test('periods -> one path per period colour', () => {
  const o = build({ periodsEnabled: true, periods: [
    { id: 'a', from: '2026-01-01', to: '2026-04-30', color: '#ff0000' },
    { id: 'b', from: '2026-05-01', to: '2026-10-31', color: '#00ff00' }] });
  assert.deepEqual(o.lines.map(l => l.color), ['#ff0000', '#00ff00']);
});
test('points: halo is 2px larger, size honoured, one path per colour', () => {
  const o = build({ showPoints: true, pointSize: 10, pointColorMode: 'type' });
  assert.equal(o.dots.length, 2);                                   // GPS + Doppler colours
  assert.ok(o.dots.every(x => x.size === 10)); assert.ok(o.haloDots.every(x => x.size === 12 && x.color === '#ffffff'));
  assert.equal(o.stats.dots, 10);
  assert.match(o.dots[0].d, /^M[\d.\-]+ [\d.\-]+h0/);
});
test('type filter flows through', () => {
  const o = build({ type: 'DOPPLER', showPoints: true });
  assert.equal(o.stats.dots, 4); assert.equal(o.stats.vertices, 4);
});
test('coordinate labels are thinned and formatted', () => {
  const o = build({ showCoordinateLabels: true, labelMinSpacingPx: 70, coordFormat: 'DMM' });
  assert.ok(o.labels.length >= 2 && o.labels.length < 10);
  assert.match(o.labels[0].text, /° \d\d\.\d{4}′ N/);
  assert.equal(o.dots.length, 0);                                    // labels without Points => no dots drawn
});
test('invalid / hidden settings -> empty overlay', () => {
  assert.equal(build({ show: false }).lines.length, 0);
  assert.equal(build({ from: '2026-06-01', to: '2026-05-01' }).lines.length, 0);
});
test('dash arrays and NaN safety', () => {
  assert.equal(dashArray('solid', 3), undefined); assert.equal(dashArray('dashed', 3), '9 6'); assert.equal(dashArray('dotted', 2), '0.1 4.4');
  const s = S(); const m = buildTrackRenderModel(fixes, s);
  const o = buildSvgOverlay(m, s, (la, lo) => (lo > 66.5 ? { x: NaN, y: 0 } : project(la, lo)), B);
  assert.ok(o.stats.skipped > 0); assert.ok(!o.lines[0].d.includes('NaN'));
});
test('huge coordinates are clamped', () => {
  const s = S(); const m = buildTrackRenderModel(fixes, s);
  const o = buildSvgOverlay(m, s, (la, lo) => ({ x: (lo - 66) * 1e9, y: 0 }), B);
  assert.ok(!/e\+/.test(o.lines[0].d)); assert.ok(o.lines[0].d.includes('1000000'));
});

test('points follow the line colour per period, each with a white halo', () => {
  const o = build({ showPoints: true, pointColorMode: 'track', periodsEnabled: true, periods: [
    { id: 'a', from: '2026-01-01', to: '2026-04-30', color: '#f59e0b' },
    { id: 'b', from: '2026-05-01', to: '2026-10-31', color: '#10b981' }] });
  assert.deepEqual(o.dots.map(d => d.color).sort(), ['#10b981', '#f59e0b']);
  assert.deepEqual(o.lines.map(l => l.color), ['#f59e0b', '#10b981']);       // same colours as the line
  assert.equal(o.haloDots.length, 2); assert.ok(o.haloDots.every(h => h.color === '#ffffff' && h.size === 8));
  assert.equal(o.stats.dots, 10);
  // without periods the dots keep the track colour (the existing blue look)
  const plain = build({ showPoints: true, pointColorMode: 'track' });
  assert.deepEqual(plain.dots.map(d => d.color), ['#6366f1']);
});
test('"period" mode is an alias of "track" mode', () => {
  const per = { periodsEnabled: true, periods: [{ id: 'a', from: '2026-01-01', to: '2026-12-31', color: '#ef4444' }] };
  const a = build({ showPoints: true, pointColorMode: 'track', ...per });
  const b = build({ showPoints: true, pointColorMode: 'period', ...per });
  assert.deepEqual(a.dots.map(d => d.color), b.dots.map(d => d.color));
});
