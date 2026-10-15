import { useEffect } from 'react';
import type { Unsubscribe } from 'firebase/firestore';

/**
 * Ref-counted Firestore listeners:
 *  - a listener starts only when a view that needs it mounts,
 *  - two views needing the same data share ONE listener,
 *  - the listener stops when the last view unmounts.
 * Replaces "start every onSnapshot in App/store at boot".
 */
interface Entry { refs: number; unsub: Unsubscribe }
const subs = new Map<string, Entry>();

export function acquire(key: string, start: () => Unsubscribe): () => void {
  let e = subs.get(key);
  if (!e) { e = { refs: 0, unsub: start() }; subs.set(key, e); }
  e.refs++;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const cur = subs.get(key);
    if (!cur) return;
    cur.refs--;
    if (cur.refs <= 0) { cur.unsub(); subs.delete(key); }
  };
}

export const activeSubscriptions = () => [...subs.entries()].map(([key, v]) => ({ key, refs: v.refs }));

export function useSharedSubscription(key: string, start: () => Unsubscribe, enabled = true, deps: unknown[] = []) {
  useEffect(() => {
    if (!enabled) return;
    return acquire(key, start);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled, ...deps]);
}
