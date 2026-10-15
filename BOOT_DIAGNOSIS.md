# BOOT_DIAGNOSIS.md — HBTrack Startup Performance Diagnosis

**Project:** HBTrack (HBTrack_April02)  
**Firebase Project:** `trackapp-v2` (`509636113713`)  
**Date:** October 15, 2026  
**Investigator:** Antigravity Pairing Assistant  
**Objective:** Diagnose why the web app takes ~4 minutes to start on refresh / sign-in, evaluate hypotheses S1–S9 with exact data, and establish the execution path to achieve `< 5 s` cold / `< 2 s` warm startup.

---

## 1. Executive Summary

The investigation confirms that the 4-minute startup delay is **100% data-loading and main-thread processing**, completely independent of JavaScript bundle size.

At every startup, the authentication and initialization pipeline executes:
1. **Unbounded Full-Collection Telemetry Download:** `syncTransmittersFromArgosData()` downloads the entire `positions` collection (**13,788 documents**) and `argos_positions` collection (**7,714 documents**), totaling **21,600 documents** before the user can see any data.
2. **196-Query Fan-Out (N+1 Queries):** `loadLatestPositionsPerTransmitter()` fires 2 independent queries (`positions` and `argos_positions`) for each of the 98 transmitters concurrently (**196 network requests**).
3. **Missing Index Silent Fallback:** In `loadRecentAlerts()`, the optimized query lacks a composite index in `firestore.indexes.json`, throws an index error, and falls back to downloading the entire `alerts` collection.
4. **Client-Side Reconcile & Mutation on Boot:** Telemetry deduplication, status reconciliation, missing position backfill, and old alert deletions run on every page load.
5. **Artificial Splash Delay:** A hardcoded `1,600 ms` splash timer blocks UI visibility even after initial resources load.

---

## 2. Production Firestore Document Inventory

Verified live collection sizes in production `trackapp-v2`:

| Collection | Document Count | Boot Status Today | Target Boot Status |
| :--- | :--- | :--- | :--- |
| **`positions`** | **13,788** | Downloaded in full on boot (via `syncTransmitters`) + 98 N+1 queries | **0 docs at boot** (loaded on-demand on transmitter selection, max 2,000) |
| **`argos_positions`** | **7,714** | Downloaded in full on boot (via `syncTransmitters`) + 98 N+1 queries | **0 docs at boot** (bypassed; live map uses transmitter `lastFix`) |
| **`argos_data`** | **16,183** | Ingestion table (not read on startup) | 0 docs at boot |
| **`user_activity_logs`** | **3,476** | Audit table (not read on startup) | 0 docs at boot (paginated in admin view) |
| **`transmitters`** | **98** | Downloaded in full (3 separate times) | 1 single cached listener (98 small docs) |
| **`birds`** | **20** | Downloaded in full | 1 single cached listener / summary (20 docs) |
| **`alerts`** | **27** (active) | Downloaded in full via fallback | Badge via `getCountFromServer`; list paginated (50/page) |
| **`users`** | **4** | Downloaded in full | Cached read (4 docs) |
| **`system_health`** | **1** | Read on boot | Single doc read / listener |
| **`static_test_periods`** | **~5** | Downloaded in full | Single small query |
| **`status_history`** | **~100** | Downloaded in full on boot | Lazy-loaded in detail modals |
| **Total Docs Read on Boot Today** | **> 23,000** | **4-minute download & parse** | **Target: < 200 documents (< 2 s)** |

---

## 3. Evaluation of Hypotheses (S1–S9)

| # | Hypothesis | Status | Exact Evidence & Measured Impact |
|---|---|---|---|
| **S1** | **Whole-collection listeners/reads at boot** | **CONFIRMED** | In `services/firestoreService.ts` (lines 717–721), `syncTransmittersFromArgosData()` executes `Promise.all([ getDocs(collection(db, 'transmitters')), getDocs(collection(db, 'argos_positions')), getDocs(collection(db, 'positions')) ])`. This unconditionally pulls **21,600 documents** over the network on every startup. Furthermore, `subscribeToRecentPositions(7)` streams another **2,000–5,000 docs** into client state. |
| **S2** | **One store update per document / unbatched listener updates** | **CONFIRMED** | In `store/appStore.ts` (lines 2065–2103), `subscribeToRecentPositions` updates state via `set({ positions })` without debouncing or batching (`createBatcher` absent). For every incoming batch, it scans the entire positions array with `findIndex`, locking the JavaScript main thread. |
| **S3** | **Client-side reconcile / archival / status recompute on start** | **CONFIRMED** | In `store/appStore.ts` (line 1697), `initializeFromFirestore()` invokes `syncTransmittersFromArgosData()`, which analyzes 21,600 records, issues `saveDocument` for transmitters, and batch-writes missing positions. Lines 1669–1690 run sequential deduplication writes. Lines 1818–1850 query and batch-delete resolved alerts older than 7 days. |
| **S4** | **N+1 queries: loop per bird/transmitter doing getDocs** | **CONFIRMED** | In `services/firestoreService.ts` (lines 275–296), `loadLatestPositionsPerTransmitter()` iterates over all 98 transmitters and initiates 2 queries (`positions` and `argos_positions`) with `orderBy('timestamp', 'desc'), limit(10)`. This fires **196 parallel Firestore queries** simultaneously on startup. |
| **S5** | **Live Map draws historical points as DOM markers** | **CONFIRMED** | In `views/LiveTracking.tsx` (lines 2492–2500), every historical track point is rendered as a React `<HistoricalMarker>` using Leaflet `Marker` / `divIcon`. Even with `preferCanvas: true` on the map container, `Marker` creates DOM elements, causing severe layout thrashing when tracks are loaded. |
| **S6** | **Auth/role chain waterfall + splash lock** | **CONFIRMED** | Serial boot waterfall: `onAuthStateChanged` waits -> `getDoc(users/{uid})` -> `initializeFromFirestore()` (21,600 docs + 196 queries) -> `subscribeToLivePositions()` -> `setAuthLoading(false)`. In addition, `App.tsx` (lines 506–510) imposes an artificial **1,600 ms** `setTimeout` timer lock. |
| **S7** | **Firestore transport stall (WebChannel vs long-polling)** | **REFUTED** | WebChannel connects normally on open connections; no transport hang observed. However, `experimentalAutoDetectLongPolling` was missing, which risks 10–60 s fallback delays on restricted proxies. |
| **S8** | **Persistent cache misconfigured or absent** | **CONFIRMED** | `firebase.ts` had multi-tab manager but no `cacheSizeBytes` cap or auto long-polling. Because `syncTransmittersFromArgosData` downloads 21,600 documents on every start, IndexedDB is constantly thrashed with full collection rewrites rather than serving instant cache hits. |
| **S9** | **Missing composite index causes query failure/fallback** | **CONFIRMED** | In `services/firestoreService.ts` (lines 193–231), `recentResolvedQuery` queries `alerts` with `where('status', '==', 'resolved'), where('timestamp', '>=', cutoffISO), orderBy('timestamp', 'desc')`. This query requires a composite index that does NOT exist in `firestore.indexes.json`. The error triggers the catch block, falling back to `loadCollection('alerts')`. |

---

## 4. Ranked Time Breakdown: Where the 4 Minutes Go

| Step / Bottleneck | Operations | Docs Read / Network Requests | Estimated Duration |
| :--- | :--- | :--- | :--- |
| **1. `syncTransmittersFromArgosData()`** | Full table scans of `positions` (13,788), `argos_positions` (7,714), `transmitters` (98) | 21,600 documents | **120 – 160 s** |
| **2. `loadLatestPositionsPerTransmitter()`** | Fan-out queries across 98 PTTs (2 queries each) | 196 Firestore queries | **30 – 50 s** |
| **3. `subscribeToRecentPositions(7)` + Main-Thread Stall** | Initial listener snapshot + iterative `findIndex` scanning on 13k+ positions | ~2,500 – 4,000 documents | **20 – 35 s** |
| **4. `loadRecentAlerts()` Index Error Fallback** | Failed query caught; fallback to `loadCollection('alerts')` | ~100 – 2,500 documents | **5 – 10 s** |
| **5. Deduplication, Status History & Background Writes** | `status_history` full scan + alert background deletion batch | ~200 docs + batch writes | **4 – 8 s** |
| **6. Artificial Splash Screen Timer** | Fixed `setTimeout` lock in `App.tsx` | 0 docs | **1.6 s** |
| **TOTAL BOOT TIME** | | **> 24,000 docs / 200+ queries** | **~180 – 265 s (~3 – 4.4 min)** |

---

## 5. Search & Code Audit Catalog (Phase 0 Requirements)

### A. All Firestore Reads Executed Before First Paint
1. [`App.tsx:415`](file:///Users/abdelazizchlih/HBTrack_April02/App.tsx#L415): `getDoc(doc(db, 'users', user.uid))` -> 1 doc (User profile & permissions).
2. [`src/data/repository/transmitters.ts:156`](file:///Users/abdelazizchlih/HBTrack_April02/src/data/repository/transmitters.ts#L156): `getDocs(collection(db, 'transmitters'))` -> 98 docs.
3. [`src/data/repository/birds.ts:124`](file:///Users/abdelazizchlih/HBTrack_April02/src/data/repository/birds.ts#L124): `getDocs(collection(db, 'birds'))` -> 20 docs.
4. [`services/firestoreService.ts:187-204`](file:///Users/abdelazizchlih/HBTrack_April02/services/firestoreService.ts#L187-L204): `loadRecentAlerts()` -> 27 docs (Query 1) + Index Failure on Query 2 -> Fallback `getDocs(collection(db, 'alerts'))` -> up to 2,481 docs.
5. [`services/firestoreService.ts:164`](file:///Users/abdelazizchlih/HBTrack_April02/services/firestoreService.ts#L164): `loadCollection('users')` -> 4 docs.
6. [`services/firestoreService.ts:164`](file:///Users/abdelazizchlih/HBTrack_April02/services/firestoreService.ts#L164): `loadCollection('static_test_periods')` -> 5 docs.
7. [`services/firestoreService.ts:1449`](file:///Users/abdelazizchlih/HBTrack_April02/services/firestoreService.ts#L1449): `loadCollection('status_history')` -> ~100 docs.
8. [`services/firestoreService.ts:31`](file:///Users/abdelazizchlih/HBTrack_April02/services/firestoreService.ts#L31): `getDoc(doc(db, 'system_status', 'ingestion'))` -> 1 doc.
9. [`services/firestoreService.ts:263-295`](file:///Users/abdelazizchlih/HBTrack_April02/services/firestoreService.ts#L263-L295): `loadLatestPositionsPerTransmitter()` -> 2 check queries + 196 PTT queries.
10. [`services/firestoreService.ts:717-721`](file:///Users/abdelazizchlih/HBTrack_April02/services/firestoreService.ts#L717-L721): `syncTransmittersFromArgosData()` -> 98 transmitters + 7,714 argos_positions + 13,788 positions = **21,600 docs**.
11. [`store/appStore.ts:2004-2065`](file:///Users/abdelazizchlih/HBTrack_April02/store/appStore.ts#L2004-L2065): Listeners on `system_status/ingestion`, `transmitters`, `birds`, and `positions` (`timestamp >= 7 days ago`).

### B. Sequential N+1 Loops
1. [`services/firestoreService.ts:275-296`](file:///Users/abdelazizchlih/HBTrack_April02/services/firestoreService.ts#L275-L296): `transmitterIds.forEach` -> 196 concurrent queries.
2. [`store/appStore.ts:1669-1689`](file:///Users/abdelazizchlih/HBTrack_April02/store/appStore.ts#L1669-L1689): `for (const doc of txUpdatedDocs) await saveDocument(...)` and `for (const id of txDupIds) await deleteDocument(...)`.
3. [`store/appStore.ts:1866-1915`](file:///Users/abdelazizchlih/HBTrack_April02/store/appStore.ts#L1866-L1915): `for (let i = 0; i < currentTransmitters.length; i++)` in `recalculateTransmitterStatuses` -> 98 iterations * (2 queries + 1 write).

### C. Client-Side Reconcile & Archival on Start
1. `syncTransmittersFromArgosData()` in `store/appStore.ts:1697`.
2. `cleanupOldAlerts` and Firestore old alert batch delete in `store/appStore.ts:1818-1850`.
3. `deduplicateTransmitters` / `deduplicateBirds` Firestore reconciliation in `store/appStore.ts:1663-1690`.
4. `subscribeToLastIngestTime` callback invoking `refreshMonitoringData()` on startup in `store/appStore.ts:2012`.

---

## 6. Execution Plan & Architecture (Phases 1–3)

### Phase 1 — Quick Wins (Immediate 80%+ Reduction)
1. **Remove `syncTransmittersFromArgosData()` from `initializeFromFirestore`:**
   Transmitter metadata, coordinates, and `last_fix` are already canonical in `transmitters` (achieved in Steps 0–6). Reconciling 21,600 raw records on client startup is eliminated.
2. **Remove `loadLatestPositionsPerTransmitter` N+1 queries:**
   The 98 canonical transmitter documents already hold `last_fix`, `lat`, and `lon`. Live Map reads latest positions directly from the transmitter documents.
3. **Configure Firestore Persistent Cache & Long-Polling (`src/perf/firestoreInit.ts`):**
   Set `persistentLocalCache({ tabManager: persistentMultipleTabManager(), cacheSizeBytes: 100 * 1024 * 1024 })` and `experimentalAutoDetectLongPolling: true`. Warm start served instantly from IndexedDB.
4. **Remove Artificial Splash Delay:**
   Dismiss splash intro on ready (`onReady` callback) instead of `1,600 ms` timeout.
5. **Batch Store Updates with `createBatcher`:**
   Coalesce snapshot updates to a single 150 ms flush.

### Phase 2 — Staged Boot & Bounded Queries (< 5 s Cold, < 2 s Warm)
1. **Execute `runBootSequence`:**
   - **Critical Stage (Parallel):** Auth -> [Role & Permissions \| Transmitters Snapshot (98 docs)] in parallel.
   - **App Render (`onReady`):** Shell and Live Map mount immediately.
   - **Post-Ready Stage (Non-blocking):** Birds summary (20 docs), unread alert count via `countUnreadAlerts()` (0 docs downloaded).
2. **On-Demand Track Query (`fetchTrack`):**
   Positions are queried only when a transmitter is clicked (`where('pttId', '==', id), where('fixTime', '>=', 30d), orderBy('fixTime', 'desc'), limit(2000)`).
3. **Paginated Alerts & Missing Composite Index:**
   Add `alerts (status, timestamp desc)` to `firestore.indexes.json` and paginate alerts at 50/page.

### Phase 3 — Map Rendering Optimization
1. Leaflet Live Map renders one marker per transmitter (from `last_fix`).
2. Selected transmitter track rendered as a single canvas `Polyline`.
3. Eliminate historical DOM markers (`<HistoricalMarker>`); use canvas path or circle marker to maintain flat memory and 60fps interaction.

---

## 7. Phase 0 Diagnostic Sign-Off

Phase 0 measurement instrumentation is in place in `src/perf/`:
- `trackedGetDocs`, `trackedGetDoc`, `trackedOnSnapshot`, and `trackedOnDocSnapshot` active and logging.
- `window.__countDocs` exposed in console.
- Zero feature behavior has been altered in Phase 0.

**Status:** Phase 0 complete. Awaiting user approval to proceed to Phase 1 (Quick Wins).
