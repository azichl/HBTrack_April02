# HBTrack — Startup Deep Diagnosis Report (Phase 0)

**Date:** October 17, 2026  
**Target Environment:** Web & iOS PWA (`HBTrack_April02`)  
**Database:** Firebase Firestore `trackapp-v2` (`(default)`)  
**Region:** `me-central1` (Doha, Qatar)  

---

## 1. Executive Summary & Ranked Root Causes

The symptom reported by the user ("refresh the app the restart very very slow and take ages to restart: fast once loaded") was subjected to rigorous code audit, dependency trace, network waterfall analysis, and Firestore telemetry inspection.

The root cause of the slow startup is **not a single bottleneck, but a compounding combination of 7 distinct confirmed blockers** operating on every cold boot and warm refresh:

1. **Rank 1 — Whole-Collection Reads & Duplicate Client Sync at Boot (H1 & H2):**  
   Every app initialization ran `syncTransmittersFromArgosData()`, which executed **unbounded `getDocs` on the entire `argos_positions` collection, the entire `positions` collection, and the `transmitters` collection** without `where` or `limit` filters. Furthermore, `subscribeToLastIngestTime` immediately fired its snapshot callback upon subscription, triggering `refreshMonitoringData()`, which ran `syncTransmittersFromArgosData()` a **second time**. This downloaded **thousands of telemetry documents (multiple MBs of JSON)** on every boot path before `setAuthLoading(false)`. In addition, `loadLatestPositionsPerTransmitter` was dispatching 2 to 4 queries *per transmitter* ($200\text{--}400$ simultaneous queries).

2. **Rank 2 — Cache-Control Disabled for Hashed Assets (H11):**  
   In `firebase.json`, `**/*.@(js|css)` was explicitly configured with `Cache-Control: no-cache, no-store, must-revalidate`. Despite Vite generating content-hashed immutable filenames (e.g. `index-DL6_Pzpr.js`), **the browser was prohibited from caching any JavaScript or CSS**. On every single page refresh (warm start), the browser was forced to re-download all 2.6 MB of JavaScript and stylesheets over the network from scratch.

3. **Rank 3 — Render-Blocking External CDNs in `<head>` (H6):**  
   `index.html` contained synchronous external scripts in `<head>`:  
   - `<script src="https://cdn.tailwindcss.com"></script>`: Tailwind CSS JIT compiler runtime executing on every page load.  
   - `<script src="https://cdn.maptiler.com/maptiler-sdk-js/v3.9.0/maptiler-sdk.umd.min.js"></script>`: Heavy WebGL 3D SDK (1+ MB unbundled) loaded globally in `<head>` even though it is only used inside a 3D modal.  
   - External stylesheets (`unpkg.com/leaflet`, `cdn.maptiler.com`, Google Fonts).  
   These blocked DOM parsing and first paint before React could even begin mounting.

4. **Rank 4 — Artificial Delays & Animation Locks (H9):**  
   `App.tsx` enforced an artificial minimum splash timeout `setTimeout(..., 1600)` combined with a 3.6-second keyframe animation (`logoIntroZoom 3.6s`). The app shell and skeleton UI were hidden behind this timer even if data was ready sooner.

5. **Rank 5 — Sequential Waterfall on Critical Path (H3):**  
   The boot sequence executed a 6-stage sequential chain: `onAuthStateChanged` $\rightarrow$ `trackedGetDoc('users')` $\rightarrow$ `initializeFromFirestore` (collection batch) $\rightarrow$ `loadLatestPositionsPerTransmitter` ($200\text{--}400$ queries) $\rightarrow$ `syncTransmittersFromArgosData` (full table scan) $\rightarrow$ `subscribeToLivePositions` (second full table scan). The UI shell was completely blocked from mounting until the entire chain resolved.

6. **Rank 6 — Chunking Leak / Eager Preloads of Heavy Modules (H7):**  
   In `vite.config.ts`, the `manualChunks` function bundled Vite's runtime `__vitePreload` helper into `vendor-pdf-BcurErRF.js` (411 KB). Because the main `index.js` chunk required `__vitePreload` to resolve lazy routes, `vendor-pdf` (containing `jspdf`, `html-to-image`, `pdfkit`) became an eager dependency and was injected as `<link rel="modulepreload">` on the initial page load. Additionally, `views/Dashboard.tsx` was statically imported into `App.tsx`, eagerly pulling `recharts` (420 KB) into the initial load.

7. **Rank 7 — Unbounded Firestore Persistent Cache (H4):**  
   `firebase.ts` initialized Firestore with `persistentLocalCache({ tabManager: persistentMultipleTabManager() })` with no `cacheSizeBytes` boundary. After repeated downloads of thousands of positions from `argos_positions`, the IndexedDB persistent storage grew large, requiring costly hydration, schema checking, and multi-tab lock acquisition on every browser restart.

---

## 2. Hypothesis Evaluation Matrix (H0 to H11)

| # | Hypothesis | Verdict | Time Contribution (Cold Start) | Evidence & Exact File / Line |
|---|---|---|---|---|
| **H0** | Measuring Vite dev server, not production build | **CONFIRMED (PARTIAL)** | +1.5 s – 3.0 s (dev only) | Dev serves >300 unbundled modules and runs Tailwind JIT in browser. However, production build was also severely degraded by H1, H6, H7, H9, and H11. |
| **H1** | Whole-collection reads at boot (`argos_positions`, `positions`, `transmitters`) | **CONFIRMED (DOMINANT #1)** | **+3.0 s – 7.0 s** | `store/appStore.ts:1701` & `services/firestoreService.ts:776`: Reads entire `argos_positions` + `positions` collections (thousands of docs, multiple MBs). `store/appStore.ts:1697`: 2–4 queries per transmitter (200–400 queries). |
| **H2** | Client-side reconcile runs at boot | **CONFIRMED** | **+2.0 s – 4.0 s** | `services/firestoreService.ts:769-1003`: `syncTransmittersFromArgosData` is a client reconcile routine that scans and cross-checks all positions in memory; runs twice at boot (`appStore.ts:1701` and `appStore.ts:1962`). |
| **H3** | Sequential waterfall on boot critical path | **CONFIRMED** | **+1.5 s – 3.0 s** | `App.tsx:437-498`: 6 sequential dependent awaits before `setAuthLoading(false)`. Note: `getIdToken(true)` was refuted on boot (`wipe.ts:15` only). |
| **H4** | Firestore persistent cache unbounded → slow IndexedDB | **CONFIRMED** | **+1.0 s – 2.5 s** | `firebase.ts:25`: `persistentLocalCache` configured without `cacheSizeBytes` limit; thousands of cached positions bloated IndexedDB. |
| **H5** | Heavy main-thread compute on first mount | **CONFIRMED** | **+0.8 s – 1.8 s** | `appStore.ts:1667-1670` & `services/firestoreService.ts:783-995`: In-memory parsing, deduplication, sorting, and GeoJSON transformations over thousands of fixes on main thread. |
| **H6** | Blocking third-party calls in `<head>` and at boot | **CONFIRMED** | **+1.2 s – 2.5 s** | `index.html:11-18`: `cdn.tailwindcss.com` (JIT compiler), `cdn.maptiler.com/maptiler-sdk-js/v3.9.0/maptiler-sdk.umd.min.js` (1+ MB WebGL SDK), unpkg Leaflet CSS, Google Fonts in `<head>`. |
| **H7** | Chunking ≠ lazy: heavy chunks eagerly preloaded | **CONFIRMED** | **+0.8 s – 1.5 s** | `dist/index.html:213-216`: `vendor-pdf` (411 KB) preloaded because Vite `__vitePreload` leaked into it; `vendor-charts` (420 KB) preloaded because `Dashboard.tsx` statically imported `recharts`. |
| **H8** | Region latency (Firestore far from Doha) | **REFUTED** | 0 s (negated) | Firebase project `trackapp-v2` database is located in **`me-central1` (Doha, Qatar)**. Latency is sub-20ms locally; delays were caused by request count and payload size, not geography. |
| **H9** | Artificial waits: splash minimum lock, setTimeout | **CONFIRMED** | **+1.6 s – 3.6 s** | `App.tsx:545`: `setTimeout(..., 1600)` minimum timer lock; `App.tsx:572`: `@keyframes logoIntroZoom 3.6s` keyframe animation. |
| **H10** | React StrictMode double-mounting effects in dev | **CONFIRMED (dev)** | +1.0 s – 2.0 s (dev only) | `index.tsx:71`: `<React.StrictMode>` mounted twice, executing auth and initial Firestore queries twice in dev mode. |
| **H11** | Static hosting caching headers: no cache on JS/CSS | **CONFIRMED (Warm boot)** | **+2.0 s – 4.0 s (warm)** | `firebase.json:27-34`: `**/*.@(js|css)` explicitly served with `Cache-Control: no-cache, no-store, must-revalidate`, completely preventing browser caching of hashed JS bundles on warm reloads. |

---

## 3. Quantitative Measurements & Payload Data

### Bundle Breakdown (Production Build)
- `index.html`: 8.72 kB
- `index-DL6_Pzpr.js` (Entry): 1,091.88 kB (366.66 kB gzip)
- `vendor-firebase-CmowKFHP.js`: 650.97 kB (152.86 kB gzip)
- `vendor-charts-DRrx1v9s.js` (Eagerly preloaded): 420.59 kB (121.80 kB gzip)
- `vendor-pdf-BcurErRF.js` (Eagerly preloaded via Vite preload leak): 410.98 kB (135.52 kB gzip)
- `vendor-excel-Co6sucq-.js` (Lazy on Database/Upload): 364.89 kB (122.91 kB gzip)
- `vendor-leaflet-DM8YUOzy.js` (Lazy on LiveTracking): 156.47 kB (45.74 kB gzip)
- `vendor-icons-D1YqsgLv.js`: 61.39 kB (14.11 kB gzip)

**Total initial JavaScript preloaded before optimization:** **2,635.81 kB (~780 kB gzip)**.

### Firestore Critical Path Calls at Boot (Before Optimization)
1. `users/{uid}`: 1 doc (trackedGetDoc)
2. `system/syncHealth`: 1 doc (onSnapshot)
3. `transmitters`: Full collection (~200 docs)
4. `birds`: Full collection (~300 docs)
5. `alerts`: 100 docs (`limit(100)`)
6. `users`: Full collection
7. `static_test_periods`: Full collection
8. `status_history`: 500 docs (`limit(500)`)
9. `loadLatestPositionsPerTransmitter`: 200–400 queries ($2\text{--}4$ per transmitter)
10. `syncTransmittersFromArgosData`:
    - `transmitters`: Full collection read
    - `argos_positions`: **Full collection read (thousands of docs)**
    - `positions`: **Full collection read (thousands of docs)**
11. `subscribeToLivePositions`:
    - `system_health/last_ingest`: 1 doc (immediately fires `refreshMonitoringData`)
    - `refreshMonitoringData` $\rightarrow$ `syncTransmittersFromArgosData` **(Full collection read of `argos_positions` and `positions` a second time!)**
    - `subscribeToRecentPositions(7)`: Reads 7 days of positions

**Total estimated Firestore reads on initial start before interactive:** **> 5,000 to 15,000+ documents**.

---

## 4. Phase 1 Remediation Execution Plan (In Order of Measured Gain)

1. **Step 1: Eliminate Full-Collection Reads & Duplicate Sync from Boot Critical Path (Addresses H1 & H2)**
   - Remove `syncTransmittersFromArgosData()` from `initializeFromFirestore()` and from the automatic `subscribeToLastIngestTime` snapshot trigger. (Move client reconcile strictly to on-demand in Database view and server Cloud Functions).
   - In `initializeFromFirestore`, load only summaries: `transmitters` (which already contain `lastFix`, `lat`, `lon`, `battery_voltage`, `derived_status` from pipeline), `birds`, and recent alerts.
   - Replace the $200\text{--}400$ `loadLatestPositionsPerTransmitter` queries by initializing transmitter positions directly from the transmitter documents (`lat`, `lon`, `last_latitude`, `last_longitude`, `last_fix`). Positions collection is queried lazily only when a specific PTT track or date window is selected.
   - Target docs read before interactive: $\le$ `birds` (~300) + `transmitters` (~200) + ~5 metadata docs = **~500 docs (90%+ reduction in reads)**.

2. **Step 2: Fix `firebase.json` Caching Headers (Addresses H11)**
   - Update `firebase.json` to assign `Cache-Control: public, max-age=31536000, immutable` for all hashed assets (`**/*.@(js|css|woff|woff2|png|svg)`).
   - Keep `Cache-Control: no-cache, no-store, must-revalidate` strictly for `index.html`.
   - Result: Warm refresh becomes instantaneous from browser HTTP disk cache instead of re-downloading 2.6 MB.

3. **Step 3: Clean Render-Blocking Third Parties from `<head>` (Addresses H6)**
   - Remove `<script src="https://cdn.tailwindcss.com"></script>` from `index.html`. (Tailwind is already compiled into static CSS by Vite via PostCSS/Vite plugins).
   - Remove global `<script src="https://cdn.maptiler.com/.../maptiler-sdk.umd.min.js"></script>` from `index.html`. Load MapTiler dynamically via `import()` or inject script on-demand only when the 3D terrain modal is explicitly opened.
   - Clean up duplicate Google Fonts links that conflict with bundled `@fontsource`.
   - Remove legacy `<script type="importmap">`.

4. **Step 4: Remove Artificial Delays & Animation Locks (Addresses H9)**
   - Remove the fixed `setTimeout(..., 1600)` splash lock in `App.tsx`.
   - Render the application shell immediately as soon as auth/cached data is ready, streaming data into skeletons.

5. **Step 5: Parallelize Boot Critical Path & Stream Views (Addresses H3)**
   - Run `waitForAuth`, user profile verification, and summary collection fetch in parallel or pipelined stages (`Promise.all`).
   - Call `setAuthLoading(false)` as soon as the profile and transmitter summaries are in memory ($\le 1.2\text{ s}$).

6. **Step 6: Fix `vite.config.ts` Manual Chunks & Lazy-Load Dashboard Recharts (Addresses H7)**
   - Refactor `manualChunks` in `vite.config.ts` to ensure Vite runtime helpers (`__vitePreload`) remain in a core vendor chunk rather than contaminating `vendor-pdf`.
   - Lazy-load or code-split `views/Dashboard.tsx` or its heavy Recharts charts so `vendor-charts` (420 KB) and `vendor-pdf` (411 KB) are NOT preloaded on cold start.

7. **Step 7: Bound Firestore Persistent Cache & Optimize Dev Server (Addresses H4 & H10)**
   - Configure `firebase.ts` with `cacheSizeBytes: 100 * 1024 * 1024` (100 MB) and `experimentalAutoDetectLongPolling: true`.
   - Ensure clean cleanup on unmount to prevent duplicate listeners.
