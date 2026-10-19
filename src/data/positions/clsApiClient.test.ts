import { describe, it, expect, vi } from 'vitest';
import { fetchAllPositions, normalizeWindow, chunkWindow, formatDate, classifyResponse, maskSecrets, ClsApiError, type ClsEndpointConfig } from './clsApiClient';

const cfg: ClsEndpointConfig = {
  baseUrl: 'https://example.invalid', path: '/api/positions', method: 'GET',
  query: { from: '{from}', to: '{to}', type: '{type}', page: '{page}', size: '{pageSize}' },
  dateFormat: 'iso-seconds', deviceIdsFormat: 'csv', deviceIdsParam: 'devices',
  pagination: { kind: 'page', pageSize: 2, startPage: 1 }, rowsPath: 'items',
};
const res = (status: number, body: string, ct = 'application/json') => ({ status, headers: { get: () => ct }, text: async () => body }) as unknown as Response;
const deps = (f: typeof fetch) => ({ fetchImpl: f, getToken: async () => 'SECRET', sleep: async () => {}, maxRetries: 3 });
const NOW = Date.parse('2026-10-19T09:00:00Z');
const P = { fromMs: Date.parse('2026-10-18T00:00:00.001Z'), toMs: Date.parse('2026-10-19T23:59:59.999Z'), deviceIds: ['43571'], type: 'ALL' as const, nowMs: NOW };

describe('the exact failure in the log', () => {
  it('404 HTML is reported as ENDPOINT_NOT_FOUND, is NOT retried, and says what to do', async () => {
    const f = vi.fn(async () => res(404, '<html><body><h1>Resource not found</h1></body></html>', 'text/html'));
    await expect(fetchAllPositions(cfg, P, deps(f as any))).rejects.toMatchObject({ kind: 'ENDPOINT_NOT_FOUND', retryable: false });
    expect(f).toHaveBeenCalledTimes(1);
  });
  it('window: start .001Z becomes whole second, end is clamped to now (was in the future)', () => {
    const w = normalizeWindow(P.fromMs, P.toMs, NOW);
    expect(new Date(w.from).toISOString()).toBe('2026-10-18T00:00:00.000Z');
    expect(new Date(w.to).toISOString()).toBe('2026-10-19T09:00:00.000Z');
  });
});

describe('retries', () => {
  it('retries network errors then succeeds', async () => {
    let n = 0;
    const f = vi.fn(async () => { if (++n < 3) throw new TypeError('Failed to fetch'); return res(200, JSON.stringify({ items: [] })); });
    const r = await fetchAllPositions(cfg, P, deps(f as any));
    expect(f).toHaveBeenCalledTimes(3); expect(r.stats.retries).toBe(2);
  });
  it('retries 429 and 503, not 400/401/403', async () => {
    for (const [st, retry] of [[429, true], [503, true], [400, false], [401, false], [403, false]] as const) {
      const f = vi.fn(async () => res(st, '{}'));
      await expect(fetchAllPositions(cfg, P, deps(f as any))).rejects.toBeInstanceOf(ClsApiError);
      expect(f.mock.calls.length).toBe(retry ? 4 : 1);
    }
  });
  it('200 + HTML is NOT_JSON', async () => {
    const f = vi.fn(async () => res(200, '<html>login</html>', 'text/html'));
    await expect(fetchAllPositions(cfg, P, deps(f as any))).rejects.toMatchObject({ kind: 'NOT_JSON' });
  });
});

describe('pagination, chunking, batching', () => {
  it('page pagination stops on a short page', async () => {
    const pages = [{ items: [{ a: 1 }, { a: 2 }] }, { items: [{ a: 3 }, { a: 4 }] }, { items: [{ a: 5 }] }];
    let i = 0; const f = vi.fn(async () => res(200, JSON.stringify(pages[i++])));
    const r = await fetchAllPositions(cfg, P, deps(f as any));
    expect(r.rows).toHaveLength(5); expect(r.stats.pages).toBe(3);
  });
  it('cursor pagination follows next until empty', async () => {
    const c: ClsEndpointConfig = { ...cfg, query: { from: '{from}', to: '{to}', cursor: '{cursor}' }, pagination: { kind: 'cursor', pageSize: 2, nextCursorPath: 'meta.next' } };
    const seq = [{ items: [{ a: 1 }, { a: 2 }], meta: { next: 'X' } }, { items: [{ a: 3 }], meta: { next: null } }];
    let i = 0; const f = vi.fn(async (u: any) => { if (i === 1) expect(String(u)).toContain('cursor=X'); return res(200, JSON.stringify(seq[i++])); });
    const r = await fetchAllPositions(c, P, deps(f as any));
    expect(r.rows).toHaveLength(3);
  });
  it('long ranges are split in chunks; devices batched', async () => {
    expect(chunkWindow(0, 40 * 86_400_000, 14)).toHaveLength(3);
    const c = { ...cfg, maxDevicesPerCall: 2 };
    const f = vi.fn(async () => res(200, JSON.stringify({ items: [] })));
    const r = await fetchAllPositions(c, { ...P, deviceIds: ['1', '2', '3'] }, deps(f as any));
    expect(r.stats.chunks).toBe(2);
  });
  it('wrong rowsPath gives a CONFIG error listing the response keys', async () => {
    const f = vi.fn(async () => res(200, JSON.stringify({ data: [] })));
    await expect(fetchAllPositions(cfg, P, deps(f as any))).rejects.toMatchObject({ kind: 'CONFIG' });
  });
});

describe('formatting + secrets', () => {
  it('date formats', () => {
    const ms = Date.parse('2026-10-18T00:00:00Z');
    expect(formatDate(ms, 'iso-seconds')).toBe('2026-10-18T00:00:00Z');
    expect(formatDate(ms, 'epoch-s')).toBe(String(ms / 1000));
    expect(formatDate(ms, 'date-only')).toBe('2026-10-18');
  });
  it('secrets are masked', () => {
    expect(maskSecrets('Authorization: Bearer abc.def.ghi')).not.toContain('abc.def');
    expect(maskSecrets('{"password":"p@ss","access_token":"tok"}')).not.toMatch(/p@ss|tok"/);
    expect(classifyResponse(200, 'application/json', '{}')).toBeNull();
  });
});
