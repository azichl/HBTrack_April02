/**
 * TEMPORARY diagnostic module (remove after the investigation).
 * Enable with ?profile=1 in the URL. Adds named boot milestones + Firestore read counters,
 * prints a table when the app becomes interactive. Dev/prod safe: no-op unless enabled.
 *
 * Usage:
 *   import { mark, probeGetDocs, probeOnSnapshot, bootReport } from '@/diagnostics/bootProfiler';
 *   mark('app:start')            // first line of main.tsx
 *   mark('auth:ready')           // onAuthStateChanged first callback
 *   mark('role:ready')           // after claims known
 *   mark('data:first')           // first Firestore snapshot rendered
 *   mark('ui:interactive')       // shell usable (not splash)
 *   bootReport()                 // prints & copies table
 * Replace TEMPORARILY `getDocs(q)` -> `probeGetDocs('transmitters', q)` and `onSnapshot(q, cb)` -> `probeOnSnapshot('birds', q, cb)`
 * for every call executed before first interactive. Do the same inside reconcile/integrity code if it runs at boot.
 */
import { getDocs, getDoc, onSnapshot, type Query, type QuerySnapshot, type DocumentReference, type DocumentSnapshot, type DocumentData } from 'firebase/firestore';

const ENABLED = typeof location !== 'undefined' && new URLSearchParams(location.search).has('profile');
const t0 = typeof performance !== 'undefined' ? performance.timeOrigin : 0;
const marks: { name: string; ms: number }[] = [];
const reads: { label: string; kind: string; docs: number; ms: number; at: number; fromCache: boolean }[] = [];

export const mark = (name: string) => {
  if (!ENABLED) return;
  const ms = Math.round(performance.now());
  marks.push({ name, ms });
  performance.mark(name);
};

export async function probeGetDocs<T = DocumentData>(label: string, q: Query<T>) {
  if (!ENABLED) return getDocs(q);
  const s = performance.now();
  const snap = await getDocs(q);
  reads.push({ label, kind: 'getDocs', docs: snap.size, ms: Math.round(performance.now() - s), at: Math.round(s), fromCache: snap.metadata.fromCache });
  return snap;
}

export async function probeGetDoc<T = DocumentData>(label: string, ref: DocumentReference<T>) {
  if (!ENABLED) return getDoc(ref);
  const s = performance.now();
  const snap = await getDoc(ref);
  reads.push({ label, kind: 'getDoc', docs: snap.exists() ? 1 : 0, ms: Math.round(performance.now() - s), at: Math.round(s), fromCache: snap.metadata.fromCache });
  return snap;
}

export function probeOnSnapshot<T = DocumentData>(label: string, q: Query<T>, cb: (s: QuerySnapshot<T>) => void) {
  if (!ENABLED) return onSnapshot(q, cb);
  const s = performance.now();
  let first = true;
  return onSnapshot(q, (snap) => {
    if (first) {
      first = false;
      reads.push({ label, kind: 'onSnapshot(first)', docs: snap.size, ms: Math.round(performance.now() - s), at: Math.round(s), fromCache: snap.metadata.fromCache });
    }
    cb(snap);
  });
}

export function probeOnDocSnapshot<T = DocumentData>(label: string, ref: DocumentReference<T>, cb: (s: DocumentSnapshot<T>) => void) {
  if (!ENABLED) return onSnapshot(ref, cb);
  const s = performance.now();
  let first = true;
  return onSnapshot(ref, (snap) => {
    if (first) {
      first = false;
      reads.push({ label, kind: 'onDocSnapshot(first)', docs: snap.exists() ? 1 : 0, ms: Math.round(performance.now() - s), at: Math.round(s), fromCache: snap.metadata.fromCache });
    }
    cb(snap);
  });
}

export function bootReport() {
  if (!ENABLED) return;
  const totalDocs = reads.reduce((a, r) => a + r.docs, 0);
  const out = { marks, reads, totalDocsBeforeInteractive: totalDocs, timeOriginISO: new Date(t0).toISOString() };
  console.table(marks); console.table(reads);
  console.log(`Firestore docs read before interactive: ${totalDocs}`);
  try { (navigator as any).clipboard?.writeText(JSON.stringify(out, null, 2)); } catch { /* ignore */ }
  return out;
}

if (typeof window !== 'undefined') {
  (window as any).__bootProfiler = { mark, bootReport, marks, reads };
}
