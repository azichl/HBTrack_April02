import { bootInteractive, traced } from './bootTrace';

/** Run `fn` when the browser is idle (never on the critical path). */
export function whenIdle(fn: () => void, timeoutMs = 3000) {
  const ric = (window as any).requestIdleCallback as ((cb: () => void, o?: { timeout: number }) => number) | undefined;
  if (ric) ric(fn, { timeout: timeoutMs });
  else setTimeout(fn, 500);
}

/**
 * Run a heavy/maintenance job at most once per `minIntervalMs` per browser, and only when idle.
 * Use it for anything that currently runs "on every app start" (client reconcile, archival, cleanups).
 * Best fix: move such jobs server-side; this is the safety net.
 */
export function runIdleOnce(key: string, minIntervalMs: number, job: () => Promise<void>) {
  const k = `idleOnce:${key}`;
  const last = Number(localStorage.getItem(k) ?? 0);
  if (Date.now() - last < minIntervalMs) return;
  localStorage.setItem(k, String(Date.now()));
  whenIdle(() => { job().catch((e) => console.error(`[idleOnce:${key}]`, e)); });
}

export interface BootDeps<User, Role> {
  waitForAuth: () => Promise<User | null>;
  /** Use getIdTokenResult() WITHOUT forceRefresh (a forced refresh adds a network round trip on every start). */
  loadRole: (u: User) => Promise<Role>;
  loadSettings: () => Promise<void>;
  startTransmitters: () => Promise<void>;     // resolves on first snapshot
  loadBirdsSummary: () => Promise<void>;
  loadAlertCount: () => Promise<void>;
  onSignedOut: () => void;
  onReady: (user: User, role: Role) => void;  // render the app shell + first view NOW
}

/**
 * Stage 1 (critical, parallel):  auth -> [role | settings | transmitters]
 * Stage 2 (right after ready):   birds summary, alert count
 * Stage 3 (idle):                everything else (maintenance, prefetch next view chunk)
 * No whole-collection reads of positions / alerts / logs at boot.
 */
export async function runBootSequence<User, Role>(d: BootDeps<User, Role>) {
  const user = await traced('auth', d.waitForAuth);
  if (!user) { d.onSignedOut(); bootInteractive(); return; }

  const [role] = await Promise.all([
    traced('role', () => d.loadRole(user)),
    traced('settings', d.loadSettings),
    traced('transmitters (first load)', d.startTransmitters),
  ]);

  d.onReady(user, role);           // user sees the app here
  bootInteractive();               // prints the report (only when ?bootTrace=1)

  // Stage 2: non-blocking
  void traced('birds summary', d.loadBirdsSummary);
  void traced('alert count', d.loadAlertCount);

  // Stage 3: idle prefetch of the most likely next chunks (no data)
  whenIdle(() => {
    void import('../../views/LiveTracking');   // ADAPT paths to the real lazy views
    void import('../../views/Monitoring');
  });
}
