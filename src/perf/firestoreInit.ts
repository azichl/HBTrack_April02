import type { FirebaseApp } from 'firebase/app';
import {
  getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager, type Firestore,
} from 'firebase/firestore';

/**
 * Create the Firestore instance ONCE, before any getFirestore() call anywhere in the app
 * (initializeFirestore throws if the instance already exists -> fallback below).
 *
 * - persistentLocalCache: a reload is served from IndexedDB instantly, then only deltas are downloaded.
 * - experimentalAutoDetectLongPolling: avoids the multi-second/minute stall behind proxies / corporate
 *   networks where WebChannel streaming is blocked and the SDK retries before falling back.
 */
export function createFirestore(app: FirebaseApp): Firestore {
  try {
    return initializeFirestore(app, {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
        cacheSizeBytes: 100 * 1024 * 1024, // 100 MB
      }),
      experimentalAutoDetectLongPolling: true,
    });
  } catch {
    return getFirestore(app); // already initialised elsewhere
  }
}
