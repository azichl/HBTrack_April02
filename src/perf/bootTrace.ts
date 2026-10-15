/**
 * Boot profiler. Zero-cost when disabled.
 * Enable with  ?bootTrace=1  in the URL, or localStorage.setItem('bootTrace','1'), or in dev mode.
 * Usage:
 *   bootStart('auth'); ...; bootEnd('auth');
 *   const v = await traced('role', () => loadRole());
 *   bootInteractive();            // call when the first useful screen is on screen -> prints the table
 */
export interface BootEntry {
  name: string;
  startMs: number;
  endMs?: number;
  durMs?: number;
  docs: number;        // documents received
  serverReads: number; // documents that were NOT served from cache (billed reads)
  note?: string;
}

const enabled = (() => {
  try {
    return (
      (typeof import.meta !== 'undefined' && (import.meta as any).env?.DEV) ||
      new URLSearchParams(window.location.search).has('bootTrace') ||
      localStorage.getItem('bootTrace') === '1'
    );
  } catch { return false; }
})();

const entries = new Map<string, BootEntry>();
let longTaskMs = 0;
let longTaskCount = 0;

if (enabled && typeof PerformanceObserver !== 'undefined') {
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) { longTaskMs += e.duration; longTaskCount++; }
    }).observe({ type: 'longtask', buffered: true } as PerformanceObserverInit);
  } catch { /* longtask not supported */ }
}

const now = () => performance.now(); // ms since navigation start

export function bootStart(name: string) {
  if (!enabled) return;
  entries.set(name, { name, startMs: now(), docs: 0, serverReads: 0 });
}

export function bootEnd(name: string, note?: string) {
  if (!enabled) return;
  const e = entries.get(name) ?? { name, startMs: now(), docs: 0, serverReads: 0 };
  e.endMs = now();
  e.durMs = e.endMs - e.startMs;
  if (note) e.note = note;
  entries.set(name, e);
}

export function bootDocs(name: string, docs: number, serverReads: number) {
  if (!enabled) return;
  const e = entries.get(name) ?? { name, startMs: now(), docs: 0, serverReads: 0 };
  e.docs += docs;
  e.serverReads += serverReads;
  entries.set(name, e);
}

export async function traced<T>(name: string, fn: () => Promise<T>): Promise<T> {
  bootStart(name);
  try { return await fn(); } finally { bootEnd(name); }
}

export function bootInteractive() {
  if (!enabled) return;
  bootEnd('INTERACTIVE');
  const rows = [...entries.values()]
    .sort((a, b) => a.startMs - b.startMs)
    .map((e) => ({
      step: e.name,
      'start (s)': +(e.startMs / 1000).toFixed(2),
      'duration (s)': e.durMs != null ? +(e.durMs / 1000).toFixed(2) : '(open)',
      docs: e.docs,
      'server reads': e.serverReads,
      note: e.note ?? '',
    }));
  const totalDocs = rows.reduce((s, r) => s + r.docs, 0);
  const totalReads = rows.reduce((s, r) => s + r['server reads'], 0);
  // eslint-disable-next-line no-console
  console.group(`%cBOOT REPORT`, 'font-weight:bold;color:#7a1c32');
  console.table(rows);
  console.log(`Total docs: ${totalDocs} | billed reads: ${totalReads} | main-thread long tasks: ${longTaskCount} (${(longTaskMs / 1000).toFixed(1)} s blocked)`);
  console.groupEnd();
  (window as any).__bootReport = { rows, totalDocs, totalReads, longTaskMs, longTaskCount };
}

if (enabled) {
  bootStart('INTERACTIVE'); // measured from module load; startMs is relative to navigation start via now()
  entries.get('INTERACTIVE')!.startMs = 0;
}
if (typeof window !== 'undefined') {
  (window as any).__bootInteractive = bootInteractive;
}
export const bootTraceEnabled = enabled;

