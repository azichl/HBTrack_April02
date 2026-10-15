import {
  getDocs, getDoc, onSnapshot,
  type DocumentData, type DocumentReference, type DocumentSnapshot, 
  type FirestoreError, type Query, type QuerySnapshot, type Unsubscribe,
} from 'firebase/firestore';
import { bootDocs, bootEnd, bootStart } from './bootTrace';

/** Drop-in replacement for getDocs that reports docs / billed reads / duration to the boot report. */
export async function trackedGetDocs<T = DocumentData>(label: string, q: Query<T>): Promise<QuerySnapshot<T>> {
  bootStart(label);
  const snap = await getDocs(q);
  bootDocs(label, snap.size, snap.metadata.fromCache ? 0 : snap.size);
  bootEnd(label, snap.metadata.fromCache ? 'from cache' : undefined);
  return snap;
}

/** Drop-in replacement for getDoc that reports docs / billed reads / duration to the boot report. */
export async function trackedGetDoc<T = DocumentData>(label: string, ref: DocumentReference<T>): Promise<DocumentSnapshot<T>> {
  bootStart(label);
  const snap = await getDoc(ref);
  const docs = snap.exists() ? 1 : 0;
  bootDocs(label, docs, snap.metadata.fromCache ? 0 : docs);
  bootEnd(label, snap.metadata.fromCache ? 'from cache' : undefined);
  return snap;
}

/** Drop-in replacement for onSnapshot; only the FIRST snapshot is measured (initial download). */
export function trackedOnSnapshot<T = DocumentData>(
  label: string,
  q: Query<T>,
  next: (snap: QuerySnapshot<T>) => void,
  error?: (e: FirestoreError) => void,
): Unsubscribe {
  let first = true;
  bootStart(label);
  return onSnapshot(
    q,
    (snap) => {
      if (first) {
        first = false;
        bootDocs(label, snap.size, snap.metadata.fromCache ? 0 : snap.size);
        bootEnd(label, snap.metadata.fromCache ? 'from cache' : undefined);
      }
      next(snap);
    },
    (e) => { bootEnd(label, `ERROR ${e.code}`); error?.(e); },
  );
}

/** Drop-in replacement for doc onSnapshot; only the FIRST snapshot is measured. */
export function trackedOnDocSnapshot<T = DocumentData>(
  label: string,
  ref: DocumentReference<T>,
  next: (snap: DocumentSnapshot<T>) => void,
  error?: (e: FirestoreError) => void,
): Unsubscribe {
  let first = true;
  bootStart(label);
  return onSnapshot(
    ref,
    (snap) => {
      if (first) {
        first = false;
        const docs = snap.exists() ? 1 : 0;
        bootDocs(label, docs, snap.metadata.fromCache ? 0 : docs);
        bootEnd(label, snap.metadata.fromCache ? 'from cache' : undefined);
      }
      next(snap);
    },
    (e) => { bootEnd(label, `ERROR ${e.code}`); error?.(e); },
  );
}

