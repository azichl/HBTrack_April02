import { describe, it, expect } from 'vitest';
import { PERIOD_PALETTE, dataRangeOf, examplePeriods, newPeriod, nextColor, periodIssues, sortPeriods } from './periodsModel';
import { DEFAULT_TRACK_SETTINGS, buildTrackRenderModel, type Fix } from './trackRenderModel';

const range = { from: '2026-01-01', to: '2026-10-26' };
const t = (iso: string) => Date.parse(`${iso}T12:00:00Z`);

describe('periodsModel', () => {
  it('dataRangeOf', () => {
    expect(dataRangeOf([t('2026-03-05'), t('2026-01-02'), t('2026-10-26')])).toEqual({ from: '2026-01-02', to: '2026-10-26' });
    expect(dataRangeOf([])).toBeNull();
  });
  it('first period = whole range, next = day after last end, new colour each time', () => {
    const p1 = newPeriod([], range, 'a');
    expect(p1).toMatchObject({ from: '2026-01-01', to: '2026-10-26', color: PERIOD_PALETTE[0] });
    const shortP1 = { ...p1, to: '2026-04-30' };
    const p2 = newPeriod([shortP1], range, 'b');
    expect(p2.from).toBe('2026-05-01'); expect(p2.color).toBe(PERIOD_PALETTE[1]);
    expect(p2.to <= range.to).toBe(true);
    const p3 = newPeriod([shortP1, p2], range, 'c');
    expect(p3.from).toBe(new Date(Date.parse(`${p2.to}T00:00:00Z`) + 86400000).toISOString().slice(0, 10) > range.to ? range.to : p3.from);
    expect(new Set([shortP1.color, p2.color, p3.color]).size).toBe(3);
  });
  it('when the data end is reached the new period is clamped, never after the data', () => {
    const full = newPeriod([], range, 'a');
    const next = newPeriod([full], range, 'b');
    expect(next.from).toBe(range.to); expect(next.to).toBe(range.to);
  });
  it('nextColor cycles after the palette is exhausted', () => {
    const used = PERIOD_PALETTE.map((color, i) => ({ id: `${i}`, from: '2026-01-01', to: '2026-01-02', color }));
    expect(PERIOD_PALETTE).toContain(nextColor(used));
  });
  it('example splits the range in half, contiguous and non-overlapping', () => {
    const [a, b] = examplePeriods(range);
    expect(a.from).toBe(range.from); expect(b.to).toBe(range.to);
    expect(Date.parse(`${b.from}T00:00:00Z`) - Date.parse(`${a.to}T00:00:00Z`)).toBe(86400000);
    expect(periodIssues([a, b])).toEqual({ errors: {}, warnings: {} });
  });
  it('example without data = Jan–Apr / May–Oct', () => {
    const [a, b] = examplePeriods(null, 2026);
    expect([a.from, a.to, b.from, b.to]).toEqual(['2026-01-01', '2026-04-30', '2026-05-01', '2026-10-31']);
  });
  it('issues: inverted, missing, overlap', () => {
    const iss = periodIssues([
      { id: 'a', from: '2026-03-01', to: '2026-02-01', color: '#111111' },
      { id: 'b', from: '', to: '2026-02-01', color: '#222222' },
      { id: 'c', from: '2026-01-01', to: '2026-06-30', color: '#333333' },
      { id: 'd', from: '2026-06-01', to: '2026-12-31', color: '#444444' },
    ]);
    expect(iss.errors.a).toMatch(/after/); expect(iss.errors.b).toMatch(/both/);
    expect(iss.warnings.d).toMatch(/Overlaps period 3/);
  });
  it('sortPeriods', () => {
    expect(sortPeriods([{ id: 'b', from: '2026-05-01', to: '2026-06-01', color: '#1' }, { id: 'a', from: '2026-01-01', to: '2026-02-01', color: '#2' }]).map(p => p.id)).toEqual(['a', 'b']);
  });
  it('end-to-end with the render model: created periods colour the line (UTC day inclusive)', () => {
    const fixes: Fix[] = ['2026-01-10', '2026-03-10', '2026-05-10', '2026-06-10'].map((iso, i) => ({ id: `f${i}`, t: t(iso), lat: 46 + i, lon: 66 + i, kind: 'GPS' as const }));
    const p1 = { ...newPeriod([], range, 'a'), to: '2026-04-30' };
    const p2 = newPeriod([p1], range, 'b');
    const m = buildTrackRenderModel(fixes, { ...DEFAULT_TRACK_SETTINGS, periodsEnabled: true, periods: [p1, p2] });
    expect(m.segments.map(s => s.color)).toEqual([p1.color, p2.color]);
    expect(m.legend.map(l => l.color)).toEqual([p1.color, p2.color]);
  });
  it('period colours never equal the default track colour; uncovered dates keep the default', () => {
    expect(PERIOD_PALETTE).not.toContain(DEFAULT_TRACK_SETTINGS.color);
    const fixes: Fix[] = ['2026-01-10', '2026-12-10'].map((iso, i) => ({ id: `f${i}`, t: t(iso), lat: 46 + i, lon: 66 + i, kind: 'GPS' as const }));
    const p1 = { ...newPeriod([], range, 'a'), to: '2026-02-28' };
    const m = buildTrackRenderModel(fixes, { ...DEFAULT_TRACK_SETTINGS, periodsEnabled: true, periods: [p1] });
    expect(m.segments.at(-1)!.color).toBe(DEFAULT_TRACK_SETTINGS.color);
  });
});
