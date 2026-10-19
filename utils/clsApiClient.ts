/**
 * Robust CLS API client for the "Positions" operation. RUN SERVER-SIDE (Cloud Function), never from the browser:
 * the browser call fails with "Network error" when CORS blocks it, and exposes credentials.
 *
 * The endpoint is described by a CONFIG captured from the real CLS web app (see har_extract_cls_positions.py) — no URL is guessed here.
 * What this fixes vs the log in your screenshot:
 *   - 404 / HTML "Resource not found" is NOT retried and is reported as ENDPOINT_NOT_FOUND with the path, not as "Network error".
 *   - Only network errors, 429 and 5xx are retried (exponential backoff + jitter).
 *   - Dates are normalised: whole seconds (no ".001Z"), `to` never in the future, long ranges split in chunks, devices batched.
 *   - A 200 response that is HTML is reported as NOT_JSON.
 *   - Secrets are masked in every log line.
 */

import { parseConstraintViolation, describeViolations } from './clsDiagnostics';

export type ErrorKind = 'ENDPOINT_NOT_FOUND' | 'UNAUTHORIZED' | 'FORBIDDEN' | 'BAD_REQUEST' | 'RATE_LIMITED' | 'SERVER' | 'NETWORK' | 'NOT_JSON' | 'CONFIG';
export class ClsApiError extends Error {
  constructor(public kind: ErrorKind, message: string, public status?: number, public retryable = false) { super(message); this.name = 'ClsApiError'; }
}

export interface Pagination {
  kind: 'page' | 'offset' | 'cursor' | 'none';
  pageSize: number;
  startPage?: 0 | 1;
  pageParam?: string; sizeParam?: string;
  offsetParam?: string; limitParam?: string;
  cursorParam?: string; nextCursorPath?: string;
}
export interface ClsEndpointConfig {
  baseUrl: string;                       // e.g. https://<host>
  path: string;                          // e.g. /…/positions   (captured from the CLS web app)
  method: 'GET' | 'POST';
  query?: Record<string, string>;        // templates: {from} {to} {deviceIds} {type} {page} {pageSize} {offset} {cursor}
  body?: unknown;                        // JSON template, same placeholders inside strings
  headers?: Record<string, string>;      // NON-secret headers only
  dateFormat: 'iso-seconds' | 'iso-millis' | 'epoch-ms' | 'epoch-s' | 'date-only';
  deviceIdsFormat: 'csv' | 'repeat' | 'array' | 'single';
  deviceIdsParam?: string;               // query/body key for the devices when it is not templated
  typeMap?: { ALL?: string | null; GPS?: string; DOPPLER?: string };
  pagination: Pagination;
  rowsPath: string;                      // '' = root array; 'items'; 'data.positions' …
  maxWindowDays?: number;                // default 31
  maxDevicesPerCall?: number;            // default 50
}

export interface FetchParams { fromMs: number; toMs: number; deviceIds: string[]; type: 'ALL' | 'GPS' | 'DOPPLER'; nowMs?: number }
export interface Deps {
  fetchImpl: typeof fetch;
  getToken: () => Promise<string>;
  sleep?: (ms: number) => Promise<void>;
  log?: (line: string) => void;
  maxRetries?: number;                   // default 3
  maxPages?: number;                     // safety, default 2000
}

export const maskSecrets = (s: string) =>
  s.replace(/(Bearer\s+)[A-Za-z0-9\-._~+/]+=*/gi, '$1***')
   .replace(/("?(?:access_token|refresh_token|id_token|password|client_secret|authorization)"?\s*[:=]\s*"?)[^"&\s,}]+/gi, '$1***');

export function normalizeWindow(fromMs: number, toMs: number, nowMs = Date.now()) {
  const from = Math.floor(fromMs / 1000) * 1000;                 // 00:00:00.001 -> 00:00:00.000
  const to = Math.min(Math.floor(toMs / 1000) * 1000, Math.floor(nowMs / 1000) * 1000);   // never in the future
  if (!(from < to)) throw new ClsApiError('CONFIG', `Invalid window after normalisation: from >= to (${new Date(from).toISOString()} .. ${new Date(to).toISOString()})`);
  return { from, to };
}

export function chunkWindow(from: number, to: number, days: number) {
  const step = days * 86_400_000; const out: { from: number; to: number }[] = [];
  for (let s = from; s < to; s += step) out.push({ from: s, to: Math.min(s + step, to) });
  return out;
}

export function formatDate(ms: number, f: ClsEndpointConfig['dateFormat']): string {
  const d = new Date(ms);
  switch (f) {
    case 'iso-seconds': return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
    case 'iso-millis': return d.toISOString();
    case 'epoch-ms': return String(ms);
    case 'epoch-s': return String(Math.floor(ms / 1000));
    case 'date-only': return d.toISOString().slice(0, 10);
  }
}

const getPath = (obj: unknown, path: string): unknown => path ? path.split('.').reduce<any>((o, k) => (o == null ? o : o[k]), obj) : obj;

function fill(tpl: string, v: Record<string, string>): string { return tpl.replace(/\{(\w+)\}/g, (_, k) => (k in v ? v[k] : `{${k}}`)); }
function fillDeep(x: unknown, v: Record<string, string>): unknown {
  if (typeof x === 'string') return fill(x, v);
  if (Array.isArray(x)) return x.map((i) => fillDeep(i, v));
  if (x && typeof x === 'object') return Object.fromEntries(Object.entries(x).map(([k, val]) => [k, fillDeep(val, v)]));
  return x;
}

export function classifyResponse(status: number, contentType: string, bodyText: string): ClsApiError | null {
  const isHtml = /text\/html/i.test(contentType) || /^\s*<(!doctype|html)/i.test(bodyText);
  const snippet = maskSecrets(bodyText.replace(/\s+/g, ' ').slice(0, 160));
  if (status === 404) return new ClsApiError('ENDPOINT_NOT_FOUND', `404: the CLS URL for Positions does not exist${isHtml ? ' (HTML "not found" page: wrong path/host/version, not an API answer)' : ''}. Re-capture the endpoint from the CLS web app. Body: ${snippet}`, 404, false);
  if (status === 401) return new ClsApiError('UNAUTHORIZED', '401: token missing/expired/invalid for this client.', 401, false);
  if (status === 403) return new ClsApiError('FORBIDDEN', '403: the account/client has no access to Positions (role/scope or device list).', 403, false);
  if (status === 429) return new ClsApiError('RATE_LIMITED', '429: rate limited.', 429, true);
  if (status >= 500) return new ClsApiError('SERVER', `${status}: CLS server error. ${snippet}`, status, true);
  if (status >= 400) {
    const pv = parseConstraintViolation(bodyText);
    const detail = pv ? describeViolations(pv).join(' | ') : maskSecrets(bodyText.replace(/\s+/g, ' ').slice(0, 1500));   // FULL text, never cut at 100 chars
    return new ClsApiError('BAD_REQUEST', `${status}: request rejected — ${detail}`, status, false);
  }
  if (isHtml) return new ClsApiError('NOT_JSON', `200 but the body is HTML, not JSON (gateway/login/proxy page). ${snippet}`, status, false);
  return null;
}

export interface FetchStats { requests: number; pages: number; rows: number; retries: number; chunks: number }

export async function fetchAllPositions(cfg: ClsEndpointConfig, p: FetchParams, deps: Deps): Promise<{ rows: Record<string, unknown>[]; stats: FetchStats }> {
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const log = (s: string) => deps.log?.(maskSecrets(s));
  const maxRetries = deps.maxRetries ?? 3;
  const maxPages = deps.maxPages ?? 2000;
  const stats: FetchStats = { requests: 0, pages: 0, rows: 0, retries: 0, chunks: 0 };
  const { from, to } = normalizeWindow(p.fromMs, p.toMs, p.nowMs);
  const windows = chunkWindow(from, to, cfg.maxWindowDays ?? 31);
  const devBatches: string[][] = [];
  const per = cfg.maxDevicesPerCall ?? 50;
  if (!p.deviceIds.length) devBatches.push([]); else for (let i = 0; i < p.deviceIds.length; i += per) devBatches.push(p.deviceIds.slice(i, i + per));
  const rows: Record<string, unknown>[] = [];

  const callOnce = async (vars: Record<string, string>, devs: string[]): Promise<unknown> => {
    let attempt = 0;
    for (;;) {
      const url = new URL(cfg.path, cfg.baseUrl);
      const q: Record<string, string> = {};
      for (const [k, v] of Object.entries(cfg.query ?? {})) q[k] = fill(v, vars);
      if (cfg.deviceIdsParam && devs.length && cfg.deviceIdsFormat !== 'array') {
        if (cfg.deviceIdsFormat === 'repeat') devs.forEach((d) => url.searchParams.append(cfg.deviceIdsParam!, d));
        else q[cfg.deviceIdsParam] = devs.join(',');
      }
      for (const [k, v] of Object.entries(q)) if (v !== '' && !/^\{\w+\}$/.test(v)) url.searchParams.set(k, v);
      const init: RequestInit = { method: cfg.method, headers: { Accept: 'application/json', ...(cfg.headers ?? {}), Authorization: `Bearer ${await deps.getToken()}` } };
      if (cfg.method === 'POST') {
        const body = fillDeep(cfg.body ?? {}, vars) as Record<string, unknown>;
        if (cfg.deviceIdsParam && devs.length && cfg.deviceIdsFormat === 'array') body[cfg.deviceIdsParam] = devs;
        (init.headers as Record<string, string>)['Content-Type'] = 'application/json';
        init.body = JSON.stringify(body);
      }
      stats.requests++;
      log(`${cfg.method} ${url.pathname}${url.search}`);
      try {
        const res = await deps.fetchImpl(url.toString(), init);
        const text = await res.text();
        const err = classifyResponse(res.status, res.headers.get('content-type') ?? '', text);
        if (err) throw err;
        try { return JSON.parse(text); } catch { throw new ClsApiError('NOT_JSON', `200 but body is not valid JSON: ${maskSecrets(text.slice(0, 120))}`, res.status, false); }
      } catch (e) {
        const err = e instanceof ClsApiError ? e : new ClsApiError('NETWORK', `Network error: ${(e as Error).message} (in a browser this is usually CORS — call from the server)`, undefined, true);
        if (!err.retryable || attempt >= maxRetries) throw err;
        attempt++; stats.retries++;
        const wait = Math.min(30_000, 500 * 2 ** attempt) + Math.floor(Math.random() * 250);
        log(`${err.kind} — retry ${attempt}/${maxRetries} in ${wait} ms`);
        await sleep(wait);
      }
    }
  };

  for (const w of windows) for (const devs of devBatches) {
    stats.chunks++;
    const pg = cfg.pagination;
    let page = pg.startPage ?? 1, offset = 0, cursor = '';
    for (let n = 0; n < maxPages; n++) {
      const vars: Record<string, string> = {
        from: formatDate(w.from, cfg.dateFormat), to: formatDate(w.to, cfg.dateFormat),
        deviceIds: devs.join(','), type: cfg.typeMap?.[p.type] ?? (p.type === 'ALL' ? '' : p.type),
        page: String(page), pageSize: String(pg.pageSize), offset: String(offset), cursor,
      };
      if (pg.kind === 'page') { if (pg.pageParam) vars[pg.pageParam] = String(page); }
      const body = (await callOnce(vars, devs)) as unknown;
      const list = getPath(body, cfg.rowsPath);
      if (!Array.isArray(list)) throw new ClsApiError('CONFIG', `rowsPath "${cfg.rowsPath}" did not resolve to an array in the response (keys: ${Object.keys((body ?? {}) as object).join(', ')})`);
      stats.pages++; stats.rows += list.length; rows.push(...(list as Record<string, unknown>[]));
      log(`page ${n + 1}: ${list.length} rows`);
      if (pg.kind === 'none' || list.length === 0) break;
      if (pg.kind === 'cursor') { const next = getPath(body, pg.nextCursorPath ?? 'next') as string | null | undefined; if (!next) break; cursor = String(next); }
      else if (list.length < pg.pageSize) break;
      else if (pg.kind === 'page') page++; else offset += list.length;
    }
  }
  return { rows, stats };
}
