import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { messagesToRawFixes, inspectMessageSchema, calibrateDopplerDate } from './messagesToRawFixes';
import { buildFixes, partitionByQuality, type RawFix } from './positionsEngine';

const msgs = JSON.parse(readFileSync(new URL('./fixtures/cls_messages_43574.json', import.meta.url), 'utf8'));
const pos: RawFix[] = JSON.parse(readFileSync(new URL('./fixtures/cls_positions_43574.json', import.meta.url), 'utf8'));

/** The CLS API JSON shape seen in the log (values are the same real data, re-keyed). dopplerAcqDatetime is SYNTHETIC (+90 s) for the calibration test. */
const apiMsgs = msgs.map((m: any, i: number) => ({
  deviceMsgUid: `u${i}`, providerMsgId: `p${i}`, msgType: 'ARGOS', deviceUid: `uid-${m['Device ID']}`, deviceRef: String(m['Device ID']), modemRef: 'M1',
  msgDatetime: m['Message date'], acqDatetime: m['Message date'], category: 'Houbara', rawData: 'abcd', sensors: [],
  dopplerLocId: m['Doppler Date'] ? `d-${m['Doppler Date']}` : null, dopplerRevision: m['Doppler Date'] ? 1 : null,
  dopplerDatetime: m['Doppler Date'], dopplerAcqDatetime: m['Doppler Date'] ? new Date(Date.parse(m['Doppler Date']) + 90_000).toISOString() : null,
  dopplerLocLon: m['Doppler Longitude'], dopplerLocLat: m['Doppler Latitude'], dopplerLocErrorRadius: m['Doppler Error radius'], dopplerLocClass: m['Doppler Class'],
  gpsLocDatetime: m['GPS Date of position'], gpsLocLon: m['GPS Longitude'], gpsLocLat: m['GPS Latitude'],
}));

describe('export-shaped messages (CLS Messages table)', () => {
  const conv = messagesToRawFixes(msgs); const { fixes } = buildFixes(conv.rows);
  it('1,087 messages -> 75 GPS + 253 Doppler; whole-minute GPS dates; 58 Doppler > 2000 m rejected', () => {
    expect(fixes.filter((f) => f.type === 'GPS')).toHaveLength(75); expect(fixes.filter((f) => f.type === 'DOPPLER')).toHaveLength(253);
    expect(fixes.filter((f) => f.type === 'GPS').every((f) => f.t % 60_000 === 0)).toBe(true);
    expect(partitionByQuality(fixes).rejected).toHaveLength(58);
  });
  it('agrees with the CLS Positions export on the overlapping window', () => {
    const cutoff = Math.max(...msgs.filter((m: any) => m['GPS Date of position']).map((m: any) => Date.parse(m['GPS Date of position'])));
    const p = buildFixes(pos).fixes.filter((f) => f.t <= cutoff); const byId = new Map(fixes.map((f) => [f.id, f]));
    const gps = p.filter((f) => f.type === 'GPS');
    expect(gps.length).toBeGreaterThan(5); expect(gps.every((g) => byId.has(g.id))).toBe(true);
    expect(gps.every((g) => Math.abs(byId.get(g.id)!.lat - g.lat) < 1e-4 && Math.abs(byId.get(g.id)!.lon - g.lon) < 1e-4)).toBe(true);
    const dop = p.filter((f) => f.type === 'DOPPLER'); expect(dop.filter((d) => byId.has(d.id)).length / dop.length).toBeGreaterThan(0.95);
  });
});

describe('API-shaped messages (the log: "2637 messages retrieved, but 0 fixes extracted")', () => {
  it('extracts the same fixes from the API keys (deviceRef, gpsLoc*, dopplerLoc*)', () => {
    const conv = messagesToRawFixes(apiMsgs); const { fixes } = buildFixes(conv.rows);
    expect(conv.rows.length).toBeGreaterThan(0);
    expect(conv.mapping.ptt).toBe('deviceRef'); expect(conv.mapping.gDate).toBe('gpsLocDatetime'); expect(conv.mapping.dDate).toBe('dopplerDatetime');
    expect(fixes.filter((f) => f.type === 'GPS')).toHaveLength(75); expect(fixes.filter((f) => f.type === 'DOPPLER')).toHaveLength(253);
    expect(fixes[0].pttId).toBe('43574');
  });
  it('carries class, error radius and revision; never uses msgDatetime as a position date', () => {
    const conv = messagesToRawFixes(apiMsgs); const d = conv.rows.find((r) => r.locationType === 'DOPPLER')!;
    expect(d.locationClass).not.toBeNull(); expect(d.errorRadiusM).toBeGreaterThan(0); expect(d.revision).toBe(1);
    const noDate = messagesToRawFixes([{ deviceRef: '1', msgDatetime: '2026-10-18T04:00:00Z', gpsLocLat: 1, gpsLocLon: 2 }]);
    expect(noDate.rows).toHaveLength(0); expect(noDate.skippedNoDate).toBe(1);
  });
  it('inspectMessageSchema picks the PTT key that matches known PTTs, not deviceUid/modemRef', () => {
    const r = inspectMessageSchema(apiMsgs, ['43574']);
    expect(r.idChosen).toBe('deviceRef'); expect(r.warnings).toEqual([]);
    expect(r.idCandidates.find((c) => c.key === 'deviceUid')!.matchesKnownPtts).toBe(0);
    expect(inspectMessageSchema(apiMsgs, ['99999']).warnings.join()).toContain('No candidate PTT key');
  });
  it('calibrateDopplerDate chooses the date field that equals the CLS Location date (dopplerDatetime here)', () => {
    const ref = buildFixes(pos).fixes;
    const c = calibrateDopplerDate(apiMsgs, ref);
    expect(c[0].field).toBe('dopplerDatetime'); expect(c[0].rate).toBeGreaterThan(0.9);
    expect(c.find((x) => x.field === 'dopplerAcqDatetime')!.rate).toBeLessThan(0.2);
  });
  it('forced idField / dopplerDateField options are honoured', () => {
    const conv = messagesToRawFixes(apiMsgs, { idField: 'modemRef', dopplerDateField: 'dopplerAcqDatetime' });
    expect(conv.rows[0].pttId).toBe('M1'); expect(conv.mapping.dDate).toBe('dopplerAcqDatetime');
  });
});
