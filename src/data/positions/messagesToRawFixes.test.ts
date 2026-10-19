import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { messagesToRawFixes } from './messagesToRawFixes';
import { buildFixes, partitionByQuality, type RawFix } from './positionsEngine';

describe('messages -> fixes fallback (no message date used)', () => {
  const fixturePath = new URL('./fixtures/cls_messages_43574.json', import.meta.url);
  const posFixturePath = new URL('./fixtures/cls_positions_43574.json', import.meta.url);

  if (existsSync(fixturePath) && existsSync(posFixturePath)) {
    const msgs = JSON.parse(readFileSync(fixturePath, 'utf8'));
    const pos: RawFix[] = JSON.parse(readFileSync(posFixturePath, 'utf8'));
    const conv = messagesToRawFixes(msgs);
    const { fixes } = buildFixes(conv.rows);

    it('1,087 messages collapse to 75 unique GPS fixes and 253 unique Doppler fixes', () => {
      expect(conv.messages).toBe(1087);
      expect(fixes.filter((f) => f.type === 'GPS')).toHaveLength(75);
      expect(fixes.filter((f) => f.type === 'DOPPLER')).toHaveLength(253);
    });

    it('every GPS date is a whole minute (genuine fix time, not arrival time)', () => {
      expect(fixes.filter((f) => f.type === 'GPS').every((f) => f.t % 60_000 === 0)).toBe(true);
    });

    it('agrees with the CLS Positions export on the overlapping window', () => {
      const cutoff = Math.max(...msgs.filter((m: any) => m['GPS Date of position']).map((m: any) => Date.parse(m['GPS Date of position'])));
      const p = buildFixes(pos).fixes.filter((f) => f.t <= cutoff);
      const byId = new Map(fixes.map((f) => [f.id, f]));
      const gps = p.filter((f) => f.type === 'GPS');
      expect(gps.length).toBeGreaterThan(5);
      expect(gps.every((g) => byId.has(g.id))).toBe(true);
      expect(gps.every((g) => Math.abs(byId.get(g.id)!.lat - g.lat) < 1e-4 && Math.abs(byId.get(g.id)!.lon - g.lon) < 1e-4)).toBe(true);
      const dop = p.filter((f) => f.type === 'DOPPLER');
      const hit = dop.filter((d) => byId.has(d.id)).length;
      expect(hit / dop.length).toBeGreaterThan(0.95);
    });

    it('Doppler error radius > 2000 m are rejected by the engine rule (58 in this file)', () => {
      expect(partitionByQuality(fixes).rejected).toHaveLength(58);
    });
  }

  it('a message with a position but no position date is skipped, never stamped with the message date', () => {
    const r = messagesToRawFixes([{ 'Device ID': 1, 'Message date': '2026-10-18T04:00:00Z', 'GPS Latitude': 1, 'GPS Longitude': 2 }]);
    expect(r.rows).toHaveLength(0);
    expect(r.skippedNoDate).toBe(1);
  });

  it('extracts GPS and Doppler fixes correctly with true dates from messages', () => {
    const testMessages = [
      {
        'Device ID': '43574',
        'Message date': '2026-10-18T10:00:00Z',
        'GPS Date of position': '2026-10-18T08:00:00Z',
        'GPS Latitude': 44.1234,
        'GPS Longitude': 75.5678,
        'Doppler Date': '2026-10-18T09:59:00Z',
        'Doppler Latitude': 44.1250,
        'Doppler Longitude': 75.5700,
        'Doppler Class': '3',
        'Doppler Error radius': 150
      },
      // Duplicate fix re-transmitted in a subsequent message
      {
        'Device ID': '43574',
        'Message date': '2026-10-18T12:00:00Z',
        'GPS Date of position': '2026-10-18T08:00:00Z',
        'GPS Latitude': 44.1234,
        'GPS Longitude': 75.5678
      },
      // Doppler fix with error radius > 2000m
      {
        'Device ID': '43574',
        'Message date': '2026-10-18T14:00:00Z',
        'Doppler Date': '2026-10-18T13:58:00Z',
        'Doppler Latitude': 44.2000,
        'Doppler Longitude': 75.6000,
        'Doppler Class': 'B',
        'Doppler Error radius': 2500
      }
    ];

    const conv = messagesToRawFixes(testMessages);
    expect(conv.messages).toBe(3);
    expect(conv.rows).toHaveLength(4); // 2 GPS (duplicates) + 2 Doppler

    const { fixes } = buildFixes(conv.rows);
    // Duplicate GPS should collapse into 1 canonical fix
    expect(fixes.filter((f) => f.type === 'GPS')).toHaveLength(1);
    expect(fixes.filter((f) => f.type === 'DOPPLER')).toHaveLength(2);

    const gpsFix = fixes.find((f) => f.type === 'GPS')!;
    expect(new Date(gpsFix.t).toISOString()).toBe('2026-10-18T08:00:00.000Z');
    expect(gpsFix.firstMessageMs).toBe(Date.parse('2026-10-18T10:00:00Z'));

    const quality = partitionByQuality(fixes);
    expect(quality.accepted.length).toBe(2); // 1 GPS + 1 Doppler (150m)
    expect(quality.rejected.length).toBe(1); // 1 Doppler (2500m)
    expect(quality.rejected[0].reason).toBe('doppler_error_gt_2000');
  });
});
