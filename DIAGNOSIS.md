# HBTrack — Diagnostic Report (Phase 0)

Date: October 14, 2026
Target System: HBTrack (React 19, TypeScript, Vite 6, Firebase Firestore & Auth, Cloud Functions v2)

---

## 1. Executive Summary

This diagnostic evaluates every hypothesis formulated in §2 of `HBTrack_bug_analysis_and_plan.md`. The findings confirm that data loss, table synchronization failures (e.g., PTT 244289), startup slowness, and security bypasses stem from:
1. **Un-awaited, fire-and-forget write paths** that swallow errors and update local Zustand state optimistically without database guarantees.
2. **Missing automated reconciliation pipeline**: raw Argos ingestion is disconnected from the domain entities (`transmitters`, `birds`, `monitoring`), leaving PTTs orphaned in `argos_positions`.
3. **Key format impedance mismatch**: inconsistent ID typing and doc ID prefixes (`trans-244289` vs `244289`, number vs string).
4. **Ungated Danger Zone**: Wipe Data is rendered and executable without role checks on the client, and lacks backend callable enforcement.
5. **Monolithic bundle & unconstrained boot queries**: a 4.1 MB single JavaScript chunk and collection-wide scans on boot (`argos_positions`, `positions`, `status_history`) causing 10,000+ unnecessary document reads on page load.

---

## 2. Evaluation of Hypotheses (§2 of Remediation Plan)

### D — "I create transmitters and birds, then they disappear"

| Hypothesis | Status | File & Line Evidence | Technical Findings |
|---|---|---|---|
| **D.1 Rules reject the write and the error is swallowed** | **CONFIRMED** | [`store/appStore.ts#L487-L489`](file:///Users/abdelazizchlih/HBTrack_April02/store/appStore.ts#L487-L489), [`views/Transmitters.tsx#L121`](file:///Users/abdelazizchlih/HBTrack_April02/views/Transmitters.tsx#L121), [`views/Birds.tsx#L180`](file:///Users/abdelazizchlih/HBTrack_April02/views/Birds.tsx#L180) | `fireAndForget = (fn) => fn().catch(err => console.error('[Firestore Sync]', err))` catches all errors silently. Caller functions never `await` writes. No user toast or error indicator is rendered. |
| **D.2 Local-state only** | **CONFIRMED** | [`store/appStore.ts#L906-L919`](file:///Users/abdelazizchlih/HBTrack_April02/store/appStore.ts#L906-L919), [`store/appStore.ts#L1010-L1024`](file:///Users/abdelazizchlih/HBTrack_April02/store/appStore.ts#L1010-L1024) | `addBird` and `addTransmitter` call `set()` first, updating the in-memory array immediately, and only then schedule an un-awaited background `saveDocument()`. If network latency, auth token expiration, rules rejection, or a page reload occurs, the memory state is wiped. |
| **D.3 Read query silently excludes the doc** | **CONFIRMED** | [`views/Monitoring.tsx#L135-L143`](file:///Users/abdelazizchlih/HBTrack_April02/views/Monitoring.tsx#L135-L143), [`views/LiveTracking.tsx#L1503-L1535`](file:///Users/abdelazizchlih/HBTrack_April02/views/LiveTracking.tsx#L1503-L1535) | `Monitoring` filters out transmitters if `status === 'Static test'` and no fixes exist in the current calendar month. `LiveTracking` hides `Inactive` transmitters after 30 days. If a new transmitter is created without a default status or without fixes, it is filtered out of both views. |
| **D.4 Wrong collection / doc ID mismatch** | **CONFIRMED** | [`store/appStore.ts#L1001-L1006`](file:///Users/abdelazizchlih/HBTrack_April02/store/appStore.ts#L1001-L1006), [`services/firestoreService.ts#L280-L292`](file:///Users/abdelazizchlih/HBTrack_April02/services/firestoreService.ts#L280-L292) | Transmitters use `trans-${pid}` as Firestore doc ID, but `positions` uses `transmitter_id: pid` (raw digits), and `argos_positions` uses `platformId: pid`. ID lookups frequently fail due to prefix mismatches (`trans-244289` vs `244289`). |
| **D.5 Offline persistence + failed sync** | **REFUTED** | [`firebase.ts#L1-L25`](file:///Users/abdelazizchlih/HBTrack_April02/firebase.ts#L1-L25) | Offline IndexedDB persistence is NOT enabled (`getFirestore(app)` is initialized without `persistentLocalCache`). The app uses memory cache, so writes cannot be queued across reloads. |
| **D.6 Another surface overwrites it** | **CONFIRMED** | [`store/appStore.ts#L395-L401`](file:///Users/abdelazizchlih/HBTrack_April02/store/appStore.ts#L395-L401), [`store/appStore.ts#L1630-L1657`](file:///Users/abdelazizchlih/HBTrack_April02/store/appStore.ts#L1630-L1657) | On every app initialization, `deduplicateTransmitters` and `deduplicateBirds` scan records and fire background `deleteDocument` calls for any doc ID that doesn't match the arbitrarily chosen canonical ID. |

---

### B — Argos Table ↔ Argos Data ↔ Transmitters ↔ Birds ↔ Monitoring ↔ Live Map

| Hypothesis | Status | File & Line Evidence | Technical Findings |
|---|---|---|---|
| **B.1 No pipeline step exists / trigger not firing** | **CONFIRMED** | [`views/ArgosData.tsx#L63-L90`](file:///Users/abdelazizchlih/HBTrack_April02/views/ArgosData.tsx#L63-L90), [`store/appStore.ts#L1310-L1425`](file:///Users/abdelazizchlih/HBTrack_April02/store/appStore.ts#L1310-L1425), [`functions/index.js#L1-L577`](file:///Users/abdelazizchlih/HBTrack_April02/functions/index.js#L1-L577) | There is NO Cloud Function trigger listening to `argos_positions` or `argos_raw`. Promotion from raw Argos data to `transmitters` or `monitoring` only happens if `syncArgosToFirebase` is called via manual API pull or if `syncTransmittersFromArgosData` runs. |
| **B.2 Join-key mismatch (PTT 244289)** | **CONFIRMED** | [`services/firestoreService.ts#L274-L292`](file:///Users/abdelazizchlih/HBTrack_April02/services/firestoreService.ts#L274-L292), [`views/Monitoring.tsx#L124-L130`](file:///Users/abdelazizchlih/HBTrack_April02/views/Monitoring.tsx#L124-L130) | `argos_positions` stores `platformId` (number or string). `positions` stores `transmitter_id`. `transmitters` stores `platform_id` and doc ID `trans-${pid}`. When `platformId` is a number (`244289`), queries for string `'244289'` miss records unless explicitly cast both ways. |
| **B.3 Transmitter has no bird link** | **CONFIRMED** | [`views/Monitoring.tsx#L145`](file:///Users/abdelazizchlih/HBTrack_April02/views/Monitoring.tsx#L145), [`utils/formatting.ts#L290-L305`](file:///Users/abdelazizchlih/HBTrack_April02/utils/formatting.ts#L290-L305) | When PTTs are discovered from Argos, `bird_id` is blank (`''`). In `Monitoring`, unlinked transmitters show empty bird details. In `LiveTracking`, filtering by bird species or ring number excludes them. |
| **B.4 Status rules hide the data** | **CONFIRMED** | [`views/Monitoring.tsx#L136-L143`](file:///Users/abdelazizchlih/HBTrack_April02/views/Monitoring.tsx#L136-L143), [`views/LiveTracking.tsx#L1503-L1515`](file:///Users/abdelazizchlih/HBTrack_April02/views/LiveTracking.tsx#L1503-L1515) | If a transmitter's status evaluates to `Static test` or `Inactive`, strict time-window filters hide the marker unless recent fixes exist within the calendar month. |
| **B.5 Live map reads derived/summary doc never recomputed** | **CONFIRMED** | [`views/LiveTracking.tsx#L1503-L1540`](file:///Users/abdelazizchlih/HBTrack_April02/views/LiveTracking.tsx#L1503-L1540) | Live map does NOT query `argos_positions`. It only iterates over `transmitters` in Zustand. If `244289` exists in `argos_positions` but no `transmitter` doc exists, the live map never shows a marker for it. |
| **B.6 Partial batch failure** | **CONFIRMED** | [`services/firestoreService.ts#L115-L135`](file:///Users/abdelazizchlih/HBTrack_April02/services/firestoreService.ts#L115-L135) | If any single document in a batch write fails Firestore validation or rules, the entire batch of 400 fails, aborting subsequent writes. |
| **B.7 Duplicate/ordering problem** | **CONFIRMED** | [`store/appStore.ts#L1334`](file:///Users/abdelazizchlih/HBTrack_April02/store/appStore.ts#L1334), [`services/firestoreService.ts#L307-L315`](file:///Users/abdelazizchlih/HBTrack_April02/services/firestoreService.ts#L307-L315) | Discrepancies between `locationDate`, `gpsLocDate`, `dateOfPosition`, and `timestamp` cause timestamp sorting errors; fixes with valid coordinates get discarded or misordered. |

---

### A — Slow Startup

| Hypothesis | Status | File & Line Evidence | Technical Findings |
|---|---|---|---|
| **A.1 Everything loads at boot** | **CONFIRMED** | [`store/appStore.ts#L1620-L1680`](file:///Users/abdelazizchlih/HBTrack_April02/store/appStore.ts#L1620-L1680) | `initializeFromFirestore` loads 7 collections via `getDocs` simultaneously (`transmitters`, `birds`, `alerts`, `users`, `static_test_periods`, `status_history`, `system_status`), then fires 200+ position queries, then scans the ENTIRE `argos_positions` collection. On a database with tracking history, this triggers 10,000–25,000 document reads before the first tab renders. |
| **A.2 Single huge JS chunk** | **CONFIRMED** | [`vite.config.ts#L5-L30`](file:///Users/abdelazizchlih/HBTrack_April02/vite.config.ts#L5-L30), [`dist/assets/index--YKFJuPO.js`](file:///Users/abdelazizchlih/HBTrack_April02/dist/assets/index--YKFJuPO.js) | Production build produces a monolithic **4,102.51 kB (3.91 MB)** chunk containing Leaflet, Recharts, jsPDF, lucide-react, and all 15 views statically imported into `App.tsx`. |
| **A.3 Sequential waterfall** | **CONFIRMED** | [`App.tsx#L389-L449`](file:///Users/abdelazizchlih/HBTrack_April02/App.tsx#L389-L449) | Waterfall sequence: `onAuthStateChanged` → `getDoc('users', uid)` → `setCurrentUserProfile` → `await initializeFromFirestore()` → `subscribeToLivePositions()` → `setAuthLoading(false)`. First screen is blocked on all backend reads. |
| **A.4 Cross-origin fonts/CSS** | **REFUTED** | [`package.json#L12`](file:///Users/abdelazizchlih/HBTrack_April02/package.json#L12), [`index.html`](file:///Users/abdelazizchlih/HBTrack_April02/index.html) | Fonts are self-hosted via `@fontsource/ibm-plex-sans-arabic`. No external blocking CSS is loaded. |
| **A.5 Firestore memory cache only** | **CONFIRMED** | [`firebase.ts#L18-L23`](file:///Users/abdelazizchlih/HBTrack_April02/firebase.ts#L18-L23) | Firestore is initialized with standard `getFirestore(app)` without `persistentLocalCache` or multi-tab manager. Every page reload must re-fetch all data over the network. |

---

### C — Danger Zone & Role Enforcement

| Finding | File & Line Evidence | Details |
|---|---|---|
| **C.1 Wipe Data visible in Manage Data dropdown** | [`views/Database.tsx#L407-L416`](file:///Users/abdelazizchlih/HBTrack_April02/views/Database.tsx#L407-L416) | The dropdown item "Wipe Data (Danger Zone)" is shown to ANY logged-in user without checking `currentUserRole` or auth claims. |
| **C.2 Client-side check for Administrator instead of Manager** | [`views/Database.tsx#L94`](file:///Users/abdelazizchlih/HBTrack_April02/views/Database.tsx#L94), [`views/Database.tsx#L129-L136`](file:///Users/abdelazizchlih/HBTrack_April02/views/Database.tsx#L129-L136) | `DangerZone` checks `currentUserRole === 'Administrator'`. Managers are rejected, Administrators are allowed. |
| **C.3 Wipe operation executes via client-side batch deletes** | [`views/Database.tsx#L108`](file:///Users/abdelazizchlih/HBTrack_April02/views/Database.tsx#L108), [`services/firestoreService.ts#L85-L109`](file:///Users/abdelazizchlih/HBTrack_April02/services/firestoreService.ts#L85-L109) | `deleteCollection` is executed in the browser via repeated client-side `writeBatch(db)` calls instead of a secured, audited backend Cloud Function. |
| **C.4 Firestore Security Rules allow all authenticated writes** | [`firestore.rules#L6-L45`](file:///Users/abdelazizchlih/HBTrack_April02/firestore.rules#L6-L45) | Rules allow read/write for any authenticated user (`request.auth != null`). No role claims or collection delete locks exist. |

---

## 3. Inventory of Write Paths ("+ Add New Record" & Mutations)

| Entity | UI Trigger | Handler Location | Firestore Call | Awaited? | Error Surfaced? | Doc ID Strategy |
|---|---|---|---|---|---|---|
| **Transmitter** | `+ Add New Record` in Transmitters tab | [`views/Transmitters.tsx#L121`](file:///Users/abdelazizchlih/HBTrack_April02/views/Transmitters.tsx#L121) calling `addTransmitter` | [`store/appStore.ts#L1024`](file:///Users/abdelazizchlih/HBTrack_April02/store/appStore.ts#L1024): `saveDocument('transmitters', docId, normalizedTx)` | **NO** (`fireAndForget`) | **NO** (`console.error` only) | `trans-${pid}` |
| **Bird** | `+ Add New Record` in Birds tab | [`views/Birds.tsx#L180`](file:///Users/abdelazizchlih/HBTrack_April02/views/Birds.tsx#L180) calling `addBird` | [`store/appStore.ts#L919`](file:///Users/abdelazizchlih/HBTrack_April02/store/appStore.ts#L919): `saveDocument('birds', docId, normalizedBird)` | **NO** (`fireAndForget`) | **NO** (`console.error` only) | `bird-${rid}` or `bird-${timestamp}-${rand}` |
| **Monitoring** | Position Modal / Live Ingestion | [`views/Monitoring.tsx`](file:///Users/abdelazizchlih/HBTrack_April02/views/Monitoring.tsx) | Writes directly to `positions` via `savePositions` | Partial | No toast | `pos-${id}` |
| **Argos Data** | Manual fix modal | [`views/ArgosData.tsx#L240`](file:///Users/abdelazizchlih/HBTrack_April02/views/ArgosData.tsx#L240) | [`services/firestoreService.ts#L61`](file:///Users/abdelazizchlih/HBTrack_April02/services/firestoreService.ts#L61): `saveDocument('argos_positions', id, data)` | Yes | No toast | Auto or `msg.id` |

---

## 4. End-to-End Trace of PTT 244289 Across 6 Tables/Views

1. **Argos Raw / Argos Data Table**:
   - Record imported with `platformId: "244289"` or `244289` (number).
   - Stored in `argos_positions` collection under `doc.id = "pos-..."` or numeric string.
   - Visible in **Argos Data** view because that view queries `argos_positions` directly.
2. **Transmitters Table**:
   - `Transmitters` view reads from `store.transmitters` (loaded from `transmitters` collection).
   - Expected doc ID is `trans-244289`.
   - Because no automated trigger promotes raw Argos data to `transmitters`, `244289` does NOT exist in `transmitters` unless manually typed.
3. **Birds Table**:
   - Unlinked; no bird record exists with `assigned_transmitter_id: "244289"`.
4. **Monitoring Table**:
   - [`views/Monitoring.tsx#L134-L135`](file:///Users/abdelazizchlih/HBTrack_April02/views/Monitoring.tsx#L134-L135) builds rows strictly by mapping over `transmitters`.
   - Because `244289` is absent from `transmitters`, it is **completely absent from the Monitoring table**.
5. **Live Map**:
   - [`views/LiveTracking.tsx#L1503-L1535`](file:///Users/abdelazizchlih/HBTrack_April02/views/LiveTracking.tsx#L1503-L1535) computes markers strictly by filtering `transmitters`.
   - Because `244289` is absent from `transmitters`, **no pin or trail is rendered on the Live Map**.

---

## 5. Startup Performance Profile

### Bundle Composition (`dist/assets/index--YKFJuPO.js`: 4,102.51 kB)
Top contributors:
1. `jspdf` & `jspdf-autotable` (~650 kB) — statically imported in reports and QGIS export.
2. `recharts` (~450 kB) — statically imported in Dashboard and Reports.
3. `leaflet` & `react-leaflet` (~380 kB) — statically imported in LiveTracking and GIS.
4. `@firebase/*` (~420 kB) — auth, firestore, storage runtime.
5. `lucide-react` (~250 kB) — hundreds of individual icon imports.
6. 15 View Components (~1,200 kB combined) — `LiveTracking.tsx` alone is 4,212 lines.

### Boot Query Load (Executed before First Paint)
- `loadCollection('transmitters')`: full collection read.
- `loadCollection('birds')`: full collection read.
- `loadCollection('users')`: full collection read.
- `loadCollection('static_test_periods')`: full collection read.
- `loadAllStatusHistory()`: full collection read.
- `loadRecentAlerts()`: 2 compound queries.
- `loadLatestPositionsPerTransmitter()`: 50+ transmitters × 4 queries = 200 Firestore queries.
- `syncTransmittersFromArgosData()`: reads ALL documents in `argos_positions` and `positions`.
**Estimated Total Reads at Launch**: 12,000–30,000 document reads on an active tracking database.

---

## 6. Implementation Prerequisites for Phase 1 & Onward

1. **TypeScript Build Errors**: Prior to applying repository refactors, 20 typecheck errors (`parsedLat` undefined in `firestoreService.ts`, `t.lat`/`t.lon` accesses on `Transmitter`, missing `getHistoricalPositions` in `QGISConnect.tsx`, and canvas casting in `QGISMapProductionReport.tsx`) must be aligned with `types.ts`.
2. **Centralized Key Normalizer**: `normalizePttId(id: string | number): string` must be introduced to eliminate the `trans-` prefix and cast numbers to trimmed strings.
3. **Repository Layer**: `src/data/repository/{transmitters,birds,monitoring}.ts` will be the exclusive write path.
4. **Cloud Function & Rules**: `wipeCollection` callable function gated by `req.auth.token.role === 'manager'`, accompanied by updated `firestore.rules`.
