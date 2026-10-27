import { describe, it, expect } from 'vitest';
import {
  normalizeFixes,
  diagnoseOrder,
  isChronological,
  popupTimes,
  parseUtc,
  haversineKm,
  pathKm,
  type TimedFix
} from './fixTime';
import { normalizeHistoryFixes, logOrderDiagnostics } from './useHistoryFixes';
import { toFix } from '../report-track/toFix';
import fixtureCls43574 from '../../data/positions/fixtures/cls_positions_43574.json';

// Device 43574 real CLS messages from the screenshot
const CLS_43574 = [
  { id: 'm1', messageDate: '2026-10-26 13:28:08', gpsDate: '2026-10-26 06:00:00', lon: 68.2631, lat: 33.7343 },
  { id: 'm2', messageDate: '2026-10-26 13:25:08.701', gpsDate: '2026-10-26 09:00:00', lon: 68.2653, lat: 33.7335 },
  { id: 'm3', messageDate: '2026-10-26 13:24:08', gpsDate: '2026-10-26 10:01:00', lon: 68.2615, lat: 33.7343 },
  { id: 'm4', messageDate: '2026-10-26 13:23:08', gpsDate: '2026-10-26 11:00:00', lon: 68.2636, lat: 33.7341 },
  { id: 'm5', messageDate: '2026-10-26 13:22:08', gpsDate: '2026-10-26 12:01:00', lon: 68.2646, lat: 33.7339 },
  { id: 'm6', messageDate: '2026-10-26 13:19:12.761', gpsDate: '2026-10-25 04:00:00', lon: 67.1639, lat: 34.7646 }, // Argos-table record
];

// Device 244289 records
const RECORDS_244289 = [
  { id: 'p1', pttId: '244289', lat: 46.9605, lon: 66.87512, locationType: 'Doppler', locationDate: '2026-10-13 10:56:26', timestamp: '2026-10-13 14:00:00' },
  { id: 'p2', pttId: '244289', lat: 46.94538, lon: 66.90363, locationType: 'Doppler', locationDate: '2026-10-12 20:20:45', timestamp: '2026-10-13 02:00:00' },
  { id: 'p3', pttId: '244289', lat: 46.94619, lon: 66.90216, locationType: 'Doppler', locationDate: '2026-10-12 21:10:45', timestamp: '2026-10-13 03:00:00' },
  { id: 'p4', pttId: '244289', lat: 46.94621, lon: 66.90216, locationType: 'Doppler', locationDate: '2026-10-12 20:44:45', timestamp: '2026-10-13 04:00:00' }, // arrives late, older fix
  { id: 'p5', pttId: '244289', lat: 46.94538, lon: 66.90363, locationType: 'Doppler', locationDate: '2026-10-12 20:18:45', timestamp: '2026-10-13 01:00:00' },
  { id: 'a1', pttId: '244289', lat: 46.92534, lon: 66.83661, locationType: 'Doppler', locationDate: '2026-10-14 09:02:09', timestamp: '2026-10-14 12:00:00' },
  { id: 'a2', pttId: '244289', lat: 46.93778, lon: 66.89421, locationType: 'Doppler', locationDate: '2026-10-10 09:38:15', timestamp: '2026-10-10 14:00:00' },
  { id: 'a3', pttId: '244289', lat: 46.93782, lon: 66.89431, locationType: 'Doppler', locationDate: '2026-10-10 09:58:15', timestamp: '2026-10-10 15:00:00' },
  { id: 'a4', pttId: '244289', lat: 46.93787, lon: 66.89488, locationType: 'Doppler', locationDate: '2026-10-10 09:12:16', timestamp: '2026-10-10 13:00:00' },
  { id: 'a5', pttId: '244289', lat: 46.93794, lon: 66.89453, locationType: 'Doppler', locationDate: '2026-10-10 10:30:15', timestamp: '2026-10-10 16:00:00' },
];

describe('Track order fix — Device 43574', () => {
  it('diagnoses before vs after order on the six real CLS rows', () => {
    // Before fix: sorted by message date
    const byMessage = [...CLS_43574].sort((a, b) => {
      const ta = parseUtc(a.messageDate) ?? 0;
      const tb = parseUtc(b.messageDate) ?? 0;
      return ta - tb;
    });

    const drawnBefore = byMessage.map(r => normalizeFixes([r], {
      getLat: x => x.lat,
      getLon: x => x.lon,
      getId: x => x.id
    })[0]);

    const reportBefore = diagnoseOrder(drawnBefore);
    expect(reportBefore.adjacentReversals).toBe(4);
    expect(reportBefore.fallbackCount).toBe(0);
    expect(reportBefore.maxDelayHours).toBeCloseTo(33.3, 1);

    // After fix: normalized by fix time
    const normalized = normalizeHistoryFixes(CLS_43574);
    const reportAfter = diagnoseOrder(normalized);
    console.log('--- 43574 BEFORE (message order) ---', JSON.stringify(reportBefore));
    console.log('--- 43574 AFTER (fix time order) ---', JSON.stringify(reportAfter));
    expect(reportAfter.adjacentReversals).toBe(0);
    expect(reportAfter.fallbackCount).toBe(0);
    expect(isChronological(normalized)).toBe(true);
    expect(normalized.map(f => f.id)).toEqual(['m6', 'm1', 'm2', 'm3', 'm4', 'm5']);
  });

  it('clicking point at (34.7646, 67.1639) shows Fix time and Received correctly', () => {
    const normalized = normalizeHistoryFixes(CLS_43574);
    const m6 = normalized.find(f => f.id === 'm6')!;
    expect(m6).toBeDefined();
    expect(m6.lat).toBe(34.7646);
    expect(m6.lon).toBe(67.1639);

    const times = popupTimes(m6);
    expect(times.fixUtc).toBe('2026-10-25 04:00:00');
    expect(times.receivedUtc).toBe('2026-10-26 13:19:12');
    expect(times.delayText).toBe('1 d 9 h');
    expect(times.isFallback).toBe(false);
  });

  it('full fixture cls_positions_43574 normalizes strictly chronologically with 0 reversals', () => {
    const normalized = normalizeHistoryFixes(fixtureCls43574 as any[]);
    expect(normalized.length).toBeGreaterThan(0);
    expect(isChronological(normalized)).toBe(true);

    const report = diagnoseOrder(normalized);
    expect(report.adjacentReversals).toBe(0);
    expect(report.fallbackCount).toBe(0);
  });
});

describe('Track order fix — Device 244289', () => {
  it('diagnoses before vs after order on PTT 244289', () => {
    // Before fix: sorted by message timestamp
    const drawnBefore = [...RECORDS_244289]
      .map(r => normalizeFixes([r], { getLat: x => x.lat, getLon: x => x.lon, getId: x => x.id })[0])
      .sort((a, b) => (a.messageT ?? a.t) - (b.messageT ?? b.t));

    const repBefore = diagnoseOrder(drawnBefore);
    const normalized = normalizeHistoryFixes(RECORDS_244289);
    const repAfter = diagnoseOrder(normalized);
    console.log('--- 244289 BEFORE (message order) ---', JSON.stringify(repBefore));
    console.log('--- 244289 AFTER (fix time order) ---', JSON.stringify(repAfter));

    expect(repAfter.adjacentReversals).toBe(0);
    expect(repAfter.fallbackCount).toBe(0);
    expect(isChronological(normalized)).toBe(true);
  });
});

describe('Latest Location in report and Argos Table consistency', () => {
  it('Latest Location matches the row with greatest locationDate in Argos table', () => {
    const normalized = normalizeHistoryFixes(CLS_43574);
    const latestFix = normalized[normalized.length - 1];

    // In Argos table: sorted by locationDate DESC, first row is greatest locationDate
    const argosTableSortedDesc = [...CLS_43574].sort((a, b) => {
      const ta = parseUtc(a.gpsDate) ?? 0;
      const tb = parseUtc(b.gpsDate) ?? 0;
      return tb - ta;
    });

    const argosFirstRow = argosTableSortedDesc[0];
    expect(latestFix.id).toBe(argosFirstRow.id);
    expect(latestFix.id).toBe('m5'); // 2026-10-26 12:01:00
  });

  it('toFix extracts fix date and integrates with TimedFix', () => {
    const raw = {
      id: 'fix-1',
      locationDate: '2026-10-25 04:00:00',
      timestamp: '2026-10-26 13:19:12.761',
      lat: 34.7646,
      lon: 67.1639,
      locationType: 'GPS'
    };

    const fx = toFix(raw);
    expect(fx).not.toBeNull();
    expect(fx!.t).toBe(Date.UTC(2026, 9, 25, 4, 0, 0));
    expect(fx!.lat).toBe(34.7646);
    expect(fx!.lon).toBe(67.1639);
    expect(fx!.kind).toBe('GPS');
  });
});
