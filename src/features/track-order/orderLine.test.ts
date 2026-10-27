import { describe, it, expect, vi } from 'vitest';
import { orderLine } from './orderLine';

type P = { id: string; lat: number; lon: number; fixT: number; msgT: number; type?: string };
const U = (iso: string) => Date.parse(iso.replace(' ', 'T') + 'Z');
// the real six CLS rows (device 43574): fix date vs message date
const rows: P[] = [
  { id: 'm1', lat: 33.7343, lon: 68.2631, fixT: U('2026-10-26 06:00:00'), msgT: U('2026-10-26 13:28:08') },
  { id: 'm2', lat: 33.7335, lon: 68.2653, fixT: U('2026-10-26 09:00:00'), msgT: U('2026-10-26 13:25:08') },
  { id: 'm3', lat: 33.7343, lon: 68.2615, fixT: U('2026-10-26 10:01:00'), msgT: U('2026-10-26 13:24:08') },
  { id: 'm4', lat: 33.7341, lon: 68.2636, fixT: U('2026-10-26 11:00:00'), msgT: U('2026-10-26 13:23:08') },
  { id: 'm5', lat: 33.7339, lon: 68.2646, fixT: U('2026-10-26 12:01:00'), msgT: U('2026-10-26 13:22:08') },
  { id: 'm6', lat: 34.7646, lon: 67.1639, fixT: U('2026-10-25 04:00:00'), msgT: U('2026-10-26 13:19:12') },
];
const byMessage = [...rows].sort((a, b) => a.msgT - b.msgT);

describe('orderLine', () => {
  it('message order → chronological by fix time; reports the reversals it removed', () => {
    const { points, report } = orderLine(byMessage, { timeOf: p => p.fixT, tieOf: p => p.msgT, warn: false, describe: p => ({ id: p.id }) });
    expect(points.map(p => p.id)).toEqual(['m6', 'm1', 'm2', 'm3', 'm4', 'm5']);
    expect(report).toMatchObject({ total: 6, reversalsBefore: 4, reversalsAfter: 0, dropped: 0, missingTime: 0 });
    expect(report.offenders[0]).toMatchObject({ prevIso: '2026-10-26T12:01:00.000Z', curIso: '2026-10-26T11:00:00.000Z', info: { id: 'm4' } });
    expect(points[0]).toMatchObject({ lat: 34.7646, lon: 67.1639 });                  // the record that is in the Argos table first
  });
  it('already-sorted input is untouched and silent', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const sorted = [...rows].sort((a, b) => a.fixT - b.fixT);
    const { points, report } = orderLine(sorted, { timeOf: p => p.fixT, warn: true });
    expect(points.map(p => p.id)).toEqual(sorted.map(p => p.id)); expect(report.reversalsBefore).toBe(0);
    expect(warn).not.toHaveBeenCalled(); warn.mockRestore();
  });
  it('two sources concatenated (GPS block then Doppler block) are merged chronologically', () => {
    const gps = rows.filter(r => r.id <= 'm3').map(r => ({ ...r, type: 'GPS' }));
    const dop = rows.filter(r => r.id > 'm3').map(r => ({ ...r, type: 'DOPPLER' }));
    const { points, report } = orderLine([...gps, ...dop], { timeOf: p => p.fixT, warn: false });
    expect(points.every((p, i) => !i || p.fixT >= points[i - 1].fixT)).toBe(true);
    expect(report.reversalsBefore).toBeGreaterThan(0);
  });
  it('duplicates (same second + coordinates) are removed; repeated coordinates at other times are reported, not removed', () => {
    const dup = { ...rows[0], id: 'dup' };
    const again = { ...rows[0], id: 'again', fixT: rows[0].fixT + 5 * 3_600_000 };
    const { points, report } = orderLine([...rows, dup, again], { timeOf: p => p.fixT, warn: false });
    expect(points).toHaveLength(7); expect(report.dropped).toBe(1); expect(report.repeatedCoords).toBe(1);
  });
  it('points without a usable time are left out and counted', () => {
    const { points, report } = orderLine([...rows, { id: 'bad', lat: 1, lon: 2, fixT: NaN, msgT: 0 }], { timeOf: p => p.fixT, warn: false });
    expect(points).toHaveLength(6); expect(report.missingTime).toBe(1);
  });
  it('if the time passed in is the MESSAGE time the line stays wrong — which is why timeOf must be the fix time', () => {
    const { points } = orderLine(byMessage, { timeOf: p => p.msgT, warn: false });
    expect(points.map(p => p.id)).toEqual(['m6', 'm5', 'm4', 'm3', 'm2', 'm1']);       // same zig-zag order
  });
  it('is stable for equal times (tie-breaker, then original order)', () => {
    const a = { id: 'a', lat: 1, lon: 1, fixT: 1000, msgT: 5 }, b = { id: 'b', lat: 2, lon: 2, fixT: 1000, msgT: 3 }, c = { id: 'c', lat: 3, lon: 3, fixT: 1000, msgT: 3 };
    expect(orderLine([a, b, c], { timeOf: p => p.fixT, tieOf: p => p.msgT, warn: false }).points.map(p => p.id)).toEqual(['b', 'c', 'a']);
  });
});
