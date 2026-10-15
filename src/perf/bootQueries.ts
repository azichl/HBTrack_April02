/**
 * Bounded, lazy queries. ADAPT: collection names and field names (`fixTime` = LOCATION date, see the CLS plan;
 * `pttId`, `lastFix` etc.) to the real schema found in Phase 0.
 */
import {
  collection, documentId, getCountFromServer, limit, orderBy, query, startAfter, where,
  type DocumentSnapshot, type Firestore, type Unsubscribe,
} from 'firebase/firestore';
import { trackedGetDocs, trackedOnSnapshot } from './firestoreTracked';
import { changesOf, createBatcher } from './snapshotBatcher';

export const COL = {
  transmitters: 'transmitters',
  birds: 'birds',
  positions: 'positions',
  alerts: 'alerts',
} as const;

export interface TransmitterSummary { id: string; [k: string]: unknown }

/** Hundreds of small docs, one listener, deterministic order, ONE store update per 150 ms. */
export function subscribeTransmitters(
  db: Firestore,
  apply: (upserts: TransmitterSummary[], removedIds: string[]) => void,
  onError?: (e: unknown) => void,
): Unsubscribe {
  const batcher = createBatcher<TransmitterSummary>(apply);
  const unsub = trackedOnSnapshot(
    'transmitters (listener)',
    query(collection(db, COL.transmitters), orderBy(documentId())),
    (snap) => {
      const { upserts, removed } = changesOf<TransmitterSummary>(snap, (id, data) => ({ id, ...data }));
      batcher.push(upserts, removed);
      if (snap.metadata.fromCache === false && snap.docChanges().length === snap.size) batcher.flushNow(); // first full load -> immediate
    },
    onError,
  );
  return () => { batcher.cancel(); unsub(); };
}

/** Track of ONE transmitter, only when the user selects it. Bounded by time window AND count. */
export async function fetchTrack(db: Firestore, pttId: string, opts: { days?: number; max?: number } = {}) {
  const { days = 30, max = 2000 } = opts;
  const since = new Date(Date.now() - days * 86_400_000);
  const q = query(
    collection(db, COL.positions),
    where('pttId', '==', pttId),
    where('fixTime', '>=', since),
    orderBy('fixTime', 'desc'),
    limit(max),
  );
  const snap = await trackedGetDocs(`track ${pttId}`, q); // needs composite index (pttId asc, fixTime desc)
  return snap.docs.map((d) => ({ id: d.id, ...d.data() })).reverse(); // chronological
}

/** Simple concurrency limiter (no dependency). */
export async function mapLimit<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k]); }
  }));
  return out;
}

/** Fallback ONLY if transmitter docs don't carry `lastFix` yet: 1 doc per PTT, 6 in parallel. */
export function fetchLastFixes(db: Firestore, pttIds: string[]) {
  return mapLimit(pttIds, 6, async (id) => {
    const snap = await trackedGetDocs(
      `lastFix ${id}`,
      query(collection(db, COL.positions), where('pttId', '==', id), orderBy('fixTime', 'desc'), limit(1)),
    );
    return snap.docs[0] ? { id, ...snap.docs[0].data() } : null;
  });
}

/** Badge number WITHOUT downloading the alerts (1 billed read per 1000 index entries instead of N docs). */
export async function countUnreadAlerts(db: Firestore): Promise<number> {
  const snap = await getCountFromServer(query(collection(db, COL.alerts), where('read', '==', false)));
  return snap.data().count;
}

/** Alerts list: pages of 50, loaded only when the Alerts view opens. */
export async function pageAlerts(db: Firestore, cursor?: DocumentSnapshot, size = 50) {
  const base = [orderBy('createdAt', 'desc'), limit(size)] as const;
  const q = cursor
    ? query(collection(db, COL.alerts), ...base, startAfter(cursor))
    : query(collection(db, COL.alerts), ...base);
  const snap = await trackedGetDocs('alerts page', q);
  return { items: snap.docs.map((d) => ({ id: d.id, ...d.data() })), next: snap.docs[snap.docs.length - 1] };
}

/** DIAGNOSTIC: how many docs does each collection hold? Run from the console: await __countDocs() */
export async function countCollections(db: Firestore, names: string[]) {
  const rows: Record<string, number> = {};
  for (const n of names) rows[n] = (await getCountFromServer(collection(db, n))).data().count;
  // eslint-disable-next-line no-console
  console.table(rows);
  return rows;
}
