import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../../../firebase';

export interface SystemHealth {
  lastSuccess?: string;
  lastPoll?: string;
  status: 'healthy' | 'lagging' | 'degraded' | 'error' | 'idle';
  totalIngested?: number;
  totalTransmittersScanned?: number;
  lagMinutes?: number;
  lastRebuild?: string;
  lastVerification?: string;
  repairedCount?: number;
  notice?: string;
  lastError?: string;
  updatedBy?: string;
}

/**
 * Computes sync lag in minutes relative to now.
 */
export function computeSyncLagMinutes(health: SystemHealth | null): number {
  if (!health) return 0;
  if (health.lagMinutes !== undefined && !isNaN(health.lagMinutes)) {
    return health.lagMinutes;
  }
  const refTime = health.lastSuccess || health.lastPoll || health.lastRebuild;
  if (!refTime) return 0;
  const elapsedMs = Date.now() - new Date(refTime).getTime();
  if (isNaN(elapsedMs) || elapsedMs <= 0) return 0;
  return Math.round(elapsedMs / 60000);
}

/**
 * Determines if sync lag exceeds the warning threshold (default 120 mins = 2 hours).
 */
export function isSyncLagging(health: SystemHealth | null, thresholdMinutes = 120): boolean {
  if (!health) return false;
  if (health.status === 'lagging' || health.status === 'degraded' || health.status === 'error') {
    return true;
  }
  const lag = computeSyncLagMinutes(health);
  return lag > thresholdMinutes;
}

/**
 * Loads current system health record once.
 */
export async function getSystemHealth(): Promise<SystemHealth | null> {
  try {
    const snap = await getDoc(doc(db, 'system_health', 'sync'));
    if (snap.exists()) {
      return snap.data() as SystemHealth;
    }
  } catch (err) {
    console.warn('[SystemHealth] Failed to load system health record:', err);
  }
  return null;
}

/**
 * Subscribes to realtime updates of the system_health/sync document.
 */
export function subscribeSystemHealth(
  onUpdate: (health: SystemHealth | null) => void,
  onError?: (error: Error) => void
): () => void {
  const syncRef = doc(db, 'system_health', 'sync');
  return onSnapshot(
    syncRef,
    (snapshot) => {
      if (snapshot.exists()) {
        onUpdate(snapshot.data() as SystemHealth);
      } else {
        onUpdate(null);
      }
    },
    (error) => {
      console.warn('[SystemHealth] Realtime subscription error:', error);
      onError?.(error);
    }
  );
}
