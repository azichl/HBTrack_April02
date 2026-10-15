import type { DocumentData, QuerySnapshot } from 'firebase/firestore';

/**
 * Coalesces many snapshot changes into ONE store update per interval.
 * Prevents "one setState per document" -> thousands of re-renders (the usual reason the UI freezes while data streams in).
 */
export function createBatcher<T extends { id: string }>(
  apply: (upserts: T[], removedIds: string[]) => void,
  intervalMs = 150,
) {
  let up = new Map<string, T>();
  let rm = new Set<string>();
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = () => {
    timer = null;
    if (!up.size && !rm.size) return;
    const u = [...up.values()];
    const r = [...rm];
    up = new Map();
    rm = new Set();
    apply(u, r);
  };

  return {
    push(upserts: T[], removedIds: string[] = []) {
      upserts.forEach((x) => { up.set(x.id, x); rm.delete(x.id); });
      removedIds.forEach((id) => { rm.add(id); up.delete(id); });
      if (!timer) timer = setTimeout(flush, intervalMs);
    },
    flushNow: flush,
    cancel() { if (timer) clearTimeout(timer); timer = null; up = new Map(); rm = new Set(); },
  };
}

/** Convert a snapshot to upserts/removals using docChanges (cheap) instead of re-mapping the whole snapshot. */
export function changesOf<T extends { id: string }>(
  snap: QuerySnapshot<DocumentData>,
  map: (id: string, data: DocumentData) => T,
): { upserts: T[]; removed: string[] } {
  const upserts: T[] = [];
  const removed: string[] = [];
  snap.docChanges().forEach((c) => {
    if (c.type === 'removed') removed.push(c.doc.id);
    else upserts.push(map(c.doc.id, c.doc.data()));
  });
  return { upserts, removed };
}
