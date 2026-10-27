import { describe, it, expect } from 'vitest';
import { diagnoseOrder, formatDelay, haversineKm, isChronological, normalizeFixes, parseUtc, popupTimes, resolveTimes } from './fixTime';

// The six CLS "Messages" rows for device 43574 visible in the screenshot (message date, GPS date of position, lon, lat)
const CLS = [
  { id: 'm1', messageDate: '2026-10-26 13:28:08', gpsDate: '2026-10-26 06:00:00', lon: 68.2631, lat: 33.7343 },
  { id: 'm2', messageDate: '2026-10-26 13:25:08.701', gpsDate: '2026-10-26 09:00:00', lon: 68.2653, lat: 33.7335 },
  { id: 'm3', messageDate: '2026-10-26 13:24:08', gpsDate: '2026-10-26 10:01:00', lon: 68.2615, lat: 33.7343 },
  { id: 'm4', messageDate: '2026-10-26 13:23:08', gpsDate: '2026-10-26 11:00:00', lon: 68.2636, lat: 33.7341 },
  { id: 'm5', messageDate: '2026-10-26 13:22:08', gpsDate: '2026-10-26 12:01:00', lon: 68.2646, lat: 33.7339 },
  { id: 'm6', messageDate: '2026-10-26 13:19:12.761', gpsDate: '2026-10-25 04:00:00', lon: 67.1639, lat: 34.7646 },   // the Argos-table record
];
const opts = { getLat: (r: (typeof CLS)[number]) => r.lat, getLon: (r: (typeof CLS)[number]) => r.lon, getId: (r: (typeof CLS)[number]) => r.id };

describe('parseUtc — always UTC, many formats', () => {
  it('formats', () => {
    const t = Date.UTC(2026, 9, 26, 12, 1, 0);
    expect(parseUtc('2026-10-26 12:01:00')).toBe(t);                 // no zone → UTC, not local time
    expect(parseUtc('2026-10-26T12:01:00Z')).toBe(t);
    expect(parseUtc('2026-10-26T15:01:00+03:00')).toBe(t);
    expect(parseUtc('2026-10-26T12:01:00-0000')).toBe(t);
    expect(parseUtc('26/10/2026 12:01:00')).toBe(t);
    expect(parseUtc('26-10-2026 12:01')).toBe(t);
    expect(parseUtc(t)).toBe(t); expect(parseUtc(t / 1000)).toBe(t);
    expect(parseUtc(String(t / 1000))).toBe(t);
    expect(parseUtc({ seconds: t / 1000, nanoseconds: 0 })).toBe(t);
    expect(parseUtc({ toDate: () => new Date(t) })).toBe(t);
    expect(parseUtc('2026-10-26 13:25:08.701')).toBe(Date.UTC(2026, 9, 26, 13, 25, 8, 701));
  });
  it('rejects garbage and impossible dates', () => {
    for (const bad of ['', null, undefined, 'abc', '2026-02-31', '2026-13-01', '2026-10-26 25:00:00', NaN]) expect(parseUtc(bad as never)).toBeNull();
  });
  it('is independent of the machine time zone', () => {
    const prev = process.env.TZ; process.env.TZ = 'Asia/Kabul';
    expect(parseUtc('2026-10-26 12:01:00')).toBe(Date.UTC(2026, 9, 26, 12, 1, 0));
    process.env.TZ = prev;
  });
});

describe('resolveTimes — fix date wins, message date is the fallback', () => {
  it('prefers the location/GPS date', () => {
    const r = resolveTimes({ messageDate: '2026-10-26 13:19:12', gpsDate: '2026-10-25 04:00:00' });
    expect(r.fix).toBe(Date.UTC(2026, 9, 25, 4)); expect(r.message).toBe(Date.UTC(2026, 9, 26, 13, 19, 12));
  });
  it('supports nested and custom field names', () => {
    expect(resolveTimes({ gps: { when: '2026-10-25 04:00:00' } }, { fixFields: ['gps.when'], messageFields: [] }).fix).toBe(Date.UTC(2026, 9, 25, 4));
  });
});

describe('the real 43574 messages: message-date order zig-zags, fix-date order does not', () => {
  const byMessage = [...CLS].sort((a, b) => Date.parse(a.messageDate.replace(' ', 'T') + 'Z') - Date.parse(b.messageDate.replace(' ', 'T') + 'Z'));
  const timedAsReceived = normalizeFixes(byMessage, { ...opts, dedupe: false });   // sorted by FIX time by design…
  const drawnAsReceived = byMessage.map(r => normalizeFixes([r], opts)[0]);        // …so rebuild the "as drawn today" (message) order

  it('today (message order) the drawn path goes back in time 4 times and is inflated', () => {
    const rep = diagnoseOrder(drawnAsReceived);
    expect(rep.adjacentReversals).toBe(4);
    expect(rep.inflationKm).toBeGreaterThanOrEqual(0);
    expect(rep.maxDelayHours).toBeCloseTo(33.3, 1);                                // 13:19:12 on 26/10 for a fix of 04:00 on 25/10
    expect(rep.fallbackCount).toBe(0);
  });
  it('normalised (fix-date order) is strictly chronological and matches the Argos table record', () => {
    expect(isChronological(timedAsReceived)).toBe(true);
    expect(timedAsReceived.map(f => f.id)).toEqual(['m6', 'm1', 'm2', 'm3', 'm4', 'm5']);
    const first = timedAsReceived[0];
    expect(first.t).toBe(Date.UTC(2026, 9, 25, 4)); expect(first.lat).toBe(34.7646); expect(first.lon).toBe(67.1639);
    expect(diagnoseOrder(timedAsReceived).adjacentReversals).toBe(0);
  });
  it('popup shows the FIX time first and the receive time/delay second', () => {
    const p = popupTimes(timedAsReceived[0]);
    expect(p.fixUtc).toBe('2026-10-25 04:00:00'); expect(p.receivedUtc).toBe('2026-10-26 13:19:12');
    expect(p.delayText).toBe('1 d 9 h');
    expect(formatDelay(5 * 60_000)).toBe('5 min'); expect(formatDelay(3 * 3_600_000 + 23 * 60_000)).toBe('3 h 23 min');
  });
});

describe('inflation on a store-and-forward burst (old fixes arriving between new ones)', () => {
  it('reversed bursts run backwards; interleaved late fixes add distance that does not exist', () => {
    // true motion: a bird walking north 0.01° per hour; messages arrive newest-first in a burst
    const fixes = Array.from({ length: 8 }, (_, i) => ({ id: `f${i}`, lat: 34 + i * 0.01, lon: 67, gpsDate: `2026-10-26 ${String(i).padStart(2, '0')}:00:00`, messageDate: `2026-10-27 06:${String(7 - i).padStart(2, '0')}:00` }));
    const drawn = [...fixes].sort((a, b) => a.messageDate.localeCompare(b.messageDate)).map(r => normalizeFixes([r], { getLat: x => x.lat, getLon: x => x.lon })[0]);
    const rep = diagnoseOrder(drawn);
    expect(rep.adjacentReversals).toBe(7);                    // a fully reversed burst: every step goes back in time (same distance, wrong direction)
    expect(rep.pathKmAsDrawn).toBeCloseTo(rep.pathKmByFixTime, 6);
    const mixed = [fixes[3], fixes[0], fixes[6], fixes[1], fixes[7], fixes[2]].map(r => normalizeFixes([r], { getLat: x => x.lat, getLon: x => x.lon })[0]);
    const m = diagnoseOrder(mixed);
    expect(m.adjacentReversals).toBeGreaterThanOrEqual(3);
    expect(m.pathKmAsDrawn).toBeGreaterThan(m.pathKmByFixTime * 2);
  });
});

describe('normalizeFixes', () => {
  it('drops duplicates (same second + same coordinates), keeping the record with a real fix date', () => {
    const a = { id: 'a', lat: 34.7646, lon: 67.1639, messageDate: '2026-10-25 04:00:00' };                  // fallback copy (e.g. from `positions`)
    const b = { id: 'b', lat: 34.7646, lon: 67.1639, locationDate: '2026-10-25 04:00:00', messageDate: '2026-10-26 13:19:12' };
    const out = normalizeFixes([a, b], { getLat: r => r.lat, getLon: r => r.lon, getId: r => r.id });
    expect(out).toHaveLength(1); expect(out[0].id).toBe('b'); expect(out[0].usedFallback).toBe(false);
  });
  it('falls back to the message date (flagged) and skips invalid rows', () => {
    const out = normalizeFixes([{ lat: 1, lon: 2, messageDate: '2026-10-26 10:00:00' }, { lat: 'x', lon: 2, messageDate: '2026-10-26 10:00:00' }, { lat: 1, lon: 2 }, { lat: 95, lon: 2, messageDate: '2026-10-26 10:00:00' }],
      { getLat: r => r.lat as number, getLon: r => r.lon });
    expect(out).toHaveLength(1); expect(out[0].usedFallback).toBe(true);
  });
  it('mixed formats (with and without Z) sort correctly regardless of machine zone', () => {
    const rows = [
      { id: 'late', lat: 1, lon: 1, locationDate: '2026-10-26T12:00:00Z' },
      { id: 'early', lat: 2, lon: 2, locationDate: '2026-10-26 09:00:00' },
      { id: 'mid', lat: 3, lon: 3, locationDate: '2026-10-26T13:00:00+03:00' },       // = 10:00Z
    ];
    expect(normalizeFixes(rows, { getLat: r => r.lat, getLon: r => r.lon, getId: r => r.id }).map(f => f.id)).toEqual(['early', 'mid', 'late']);
  });
  it('haversine sanity: 1° of latitude ≈ 111.2 km', () => { expect(haversineKm({ lat: 0, lon: 0 }, { lat: 1, lon: 0 })).toBeCloseTo(111.2, 0); });
});
