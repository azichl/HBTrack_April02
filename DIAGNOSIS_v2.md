# DIAGNOSIS v2 — Root Causes RC1–RC6 & Codebase Findings

**Date:** 2026-10-17  
**Project:** HBTrack (Houbara Tracker)  
**Spec Reference:** `HBTrack_location_date_diagnosis_and_plan.md`  

---

## 1. Commit of the Last Screenshot Update

- **Commit SHA:** `1d1c2c9623d5def2863b10c29248287f8d21281d` (`1d1c2c9`)
- **Commit Message:** `feat(reports): fill report map frame with real live view, smart crop, and dynamic GIS scale`
- **Files Modified/Added:**
  - `components/reports/CustomMapProductionReport.tsx` (added Mode A / Mode B switches, Leaflet live frame integration)
  - `components/reports/ReportLiveMapFrame.tsx` (new file)
  - `components/reports/fitToFrame.ts` (new file)
  - `components/reports/liveViewState.ts` (new file)
  - `components/reports/reportMapFrame.css` (new file)
  - `components/reports/smartCrop.ts` (new file)
  - `store/appStore.ts` (added `liveViewState` to `exportedMapView`)
  - `views/LiveTracking.tsx` (captured `liveViewState` on export)
- **Restoration Target (Plan §9):** Revert the complex vector re-render mode in `CustomMapProductionReport.tsx`, restore the previous exact live-map screenshot capture behaviour, and size the `<img>` to fill 100% × 100% of the report map window with `object-fit: cover` (no white/navy bands, no padding/borders).

---

## 2. Confirmation & File Evidence for Root Causes RC1–RC6

### RC1: Telemetry Ordering, Windowing, and "Latest" Promotion Keyed on Message Date / Arrival Order
- **Status:** **CONFIRMED**
- **Evidence:**
  1. [`store/appStore.ts#L1512`](file:///Users/abdelazizchlih/HBTrack_April02/store/appStore.ts#L1512) & [`#L1516`](file:///Users/abdelazizchlih/HBTrack_April02/store/appStore.ts#L1516):
     ```typescript
     const qArgos = query(collection(db, 'argos_positions'), where('platformId', '==', targetPid), orderBy('timestamp', 'desc'), limit(50));
     const qPos = query(collection(db, 'positions'), where('transmitter_id', '==', targetPid), orderBy('timestamp', 'desc'), limit(50));
     ```
     Background recalculation orders by `timestamp` (which is often satellite reception time or write time).
  2. [`store/appStore.ts#L1879`](file:///Users/abdelazizchlih/HBTrack_April02/store/appStore.ts#L1879) & [`#L1883`](file:///Users/abdelazizchlih/HBTrack_April02/store/appStore.ts#L1883):
     `recalculateTransmitterStatuses` queries both collections using `orderBy('timestamp', 'desc')`.
  3. [`services/firestoreService.ts#L423-L426`](file:///Users/abdelazizchlih/HBTrack_April02/services/firestoreService.ts#L423-L426):
     `subscribeToRecentPositions` filters with `where('timestamp', '>=', cutoffISO)`.
  4. [`views/LiveTracking.tsx#L1721-L1726`](file:///Users/abdelazizchlih/HBTrack_April02/views/LiveTracking.tsx#L1721-L1726):
     Time presets (24h, 7d, 30d, 1y, 2y) filter `rawPositions` using `safeParseTimestamp(r.timestamp)`. When delayed GPS fixes are delivered via satellite days later, their `timestamp` can be tagged as message arrival date, which leaks stale fixes (e.g. 22 fixes from 2, 6, 7 Oct at the camp) into the 7-day window.
  5. [`views/ArgosData.tsx#L293`](file:///Users/abdelazizchlih/HBTrack_April02/views/ArgosData.tsx#L293):
     ```typescript
     useSortableTable<any>(searchableData, 'timestamp')
     ```
     Default table sort key is `'timestamp'` (not explicitly `locationDate` descending).

---

### RC2: Ingestion is per Message rather than per Fix (Duplicates & Re-dated Points)
- **Status:** **CONFIRMED**
- **Evidence:**
  1. [`services/argosService.ts#L173`](file:///Users/abdelazizchlih/HBTrack_April02/services/argosService.ts#L173):
     ```typescript
     id: `msg-${item.deviceMsgUid || Math.random().toString(36).substr(2,9)}`
     ```
     Every received message gets a unique random/message UID doc ID.
  2. [`services/firestoreService.ts#L488`](file:///Users/abdelazizchlih/HBTrack_April02/services/firestoreService.ts#L488):
     `batchWriteArgosPositions` writes each `msg` into `argos_positions` as a distinct document.
  3. **Data Measurement (§1):**
     In PTT 43574, 1,087 messages generated ~14× duplicate documents for the same 75 GPS fixes and 255 Doppler fixes. Because IDs were non-deterministic (`msg-...`), re-importing or re-fetching from CLS created endless duplicate records.

---

### RC3: Last Fix Overwritten by Arrival Order Instead of `max(locationDate)`
- **Status:** **CONFIRMED**
- **Evidence:**
  1. [`services/firestoreService.ts#L851-L867`](file:///Users/abdelazizchlih/HBTrack_April02/services/firestoreService.ts#L851-L867):
     ```typescript
     const isNewer = isNaN(currLastFix) || latestRecord.tsMs >= currLastFix || !existingTx.lat || !existingTx.lon;
     if (isNewer) {
       await saveDocument('transmitters', pid, updates);
     }
     ```
     If an uncoordinated batch or client run evaluates fixes in arbitrary order, or if `currLastFix` is missing, an older fix overwrites `last_fix`, `lat`, and `lon`.
  2. Non-atomic client updates: Multiple browser sessions running `reconcilePipeline` concurrently perform non-transactional read-then-write updates without server-side compare-and-set.

---

### RC4: Live Map Path Sorted and Windowed by Message/Arrival Date
- **Status:** **CONFIRMED**
- **Evidence:**
  1. [`views/LiveTracking.tsx#L1824-L1825`](file:///Users/abdelazizchlih/HBTrack_April02/views/LiveTracking.tsx#L1824-L1825):
     ```typescript
     track.sort((a, b) => safeParseTimestamp(a.timestamp) - safeParseTimestamp(b.timestamp));
     ```
     `track` is sorted by `a.timestamp`. When delayed satellite transmissions arrive out of order, the path jumps back and forth between past stored locations and newly received points.
  2. **Measured Impact:** For PTT 43574, this caused the path to zig-zag across Kazakhstan, inflating calculated path distance from 1,488 km to 4,455 km (~3×), and drawing long lines back to Zhezkazgan camp (47.14 N, 67.81 E).
  3. Lack of line-break thresholds on temporal gaps (>48h) or unrealistic speeds (>120 km/h) connects discontinuous migration legs.

---

### RC5: GPS and Doppler Mixed Without Deterministic Storage Type
- **Status:** **CONFIRMED**
- **Evidence:**
  1. [`services/firestoreService.ts#L811-L816`](file:///Users/abdelazizchlih/HBTrack_April02/services/firestoreService.ts#L811-L816):
     ```typescript
     lc: r.lc || (r.locationType === 'Doppler' ? '3' : 'GPS'),
     locationType: classifyLocationType(r.lc, r.locationType, r.satellite)
     ```
     In existing documents, `locationType` is often undefined or inferred through heuristics.
  2. [`views/LiveTracking.tsx#L1814-L1822`](file:///Users/abdelazizchlih/HBTrack_April02/views/LiveTracking.tsx#L1814-L1822):
     Filtering relies on runtime re-classification via `classifyLocationType(p.lc, p.locationType, p.satellite)`. Because Doppler class `Z` and blank classes were not strictly normalized at ingestion, GPS and Doppler fixes leak across filters.

---

### RC6: Transmitters Disappearing from Monitoring and Live Map After Refresh
- **Status:** **CONFIRMED (Multifactor Root Cause Identified)**
- **Evidence & Breakdown:**
  1. **The "Static Test" Disappearance Filter:**
     In [`utils/statusCalculator.ts#L85-L89`](file:///Users/abdelazizchlih/HBTrack_April02/utils/statusCalculator.ts#L85-L89):
     ```typescript
     const isDeployed = transmitter.bird_id && transmitter.bird_id.trim() !== '';
     if (!isDeployed) {
       return { status: 'Static test', isNesting: false };
     }
     ```
     Any transmitter that does not yet have an assigned `bird_id` (e.g. newly synced PTT 244289) is automatically assigned status `Static test` by `evaluateTransmitterStatus`!
  2. **The Monitoring Table Filter Exclusion:**
     In [`views/Monitoring.tsx#L130-L137`](file:///Users/abdelazizchlih/HBTrack_April02/views/Monitoring.tsx#L130-L137):
     ```typescript
     const isStatic = st === 'Static test' || st === 'Static Test' || st === 'static';
     const hasCurrentMonthFix = hasCurrentMonthFixesMap.get(String(t.platform_id)) || (t.last_fix && getYearMonthKey(t.last_fix) === currentYearMonthKey);
     if (isStatic && !hasCurrentMonthFix) {
       return false; // Silently dropped from Monitoring table!
     }
     ```
     Once marked as `Static test`, if the transmitter does not have a fix in the current calendar month, it is **completely excluded** from the table!
  3. **The Live Map Default Filter Exclusion:**
     In [`views/LiveTracking.tsx#L1540-L1555`](file:///Users/abdelazizchlih/HBTrack_April02/views/LiveTracking.tsx#L1540-L1555):
     The default status filter is `selectedStatus = 'active'`. Transmitters marked as `Static test` or `Inactive` are **omitted** from `relevantTransmitters`, so no marker is rendered on the Live Map!
  4. **The 7-Day Window Listener Cutoff on Page Refresh:**
     In [`store/appStore.ts#L2073`](file:///Users/abdelazizchlih/HBTrack_April02/store/appStore.ts#L2073) & [`services/firestoreService.ts#L423-L426`](file:///Users/abdelazizchlih/HBTrack_April02/services/firestoreService.ts#L423-L426):
     On page refresh, `subscribeToRecentPositions(7)` queries `positions` with `where('timestamp', '>=', cutoffISO)`. It never queries `argos_positions`. If a transmitter has no fixes in `positions` within the last 7 days, the store has 0 positions for it, causing `utils/statusCalculator.ts:92` to mark it as `Inactive`.
  5. **Difference Between In-Memory Sync and Page Refresh:**
     - *Right after manual sync*: `refreshMonitoringData` holds all synced transmitters in Zustand state (`set({ transmitters, positions })`). Everything appears.
     - *After page reload*: Firestore listeners fire. `recalculateTransmitterStatuses` re-evaluates transmitters, sees no linked bird or empty 50-limit queries, overwrites the Firestore document with `status: 'Static test'` or `'Inactive'`, and the UI filters silently hide the transmitter.

---

## 3. Plan for Implementation Steps

1. **Step 1 — Screenshot Revert & Full Screen:**
   - Revert the `ReportLiveMapFrame` complex vector re-render in `CustomMapProductionReport.tsx`.
   - Restore direct screenshot capture of the live map (matching exact screen appearance including markers, widgets, and weather).
   - Render as `<img style="width:100%;height:100%;object-fit:cover">` in a `#ece8de` container with 0px bands.
2. **Step 2 — Ingestion & Deterministic Model:**
   - Canonical doc ID: `argos_positions/{pttId}_{GPS|DOP}_{locationDateEpochMs}`.
   - Strict UTC parsing, dedupe/upsert (`deliveryCount`, `firstMessageDate`, `lastMessageDate`, `lagMinutes`).
   - Store `locationType: 'GPS' | 'DOPPLER'`.
3. **Step 3 — Derived State & Stable Auto-Sync:**
   - `live.lastFix`, `live.lastGps`, `live.lastDoppler`, `live.lastMessageAt`.
   - Shared `isVisibleOnLiveMap` & `isVisibleInMonitoring`.
   - Fix status calculator so unassigned transmitters are not silently hidden as expired static tests.
   - Watchdog banner `system/syncHealth`.
4. **Step 4 — Argos Data Table:**
   - Default sort `locationDate DESC`.
   - Columns: PTT, Unit type, Location class, Location type, Error radius (m), Location date (UTC), Lon, Lat, Received, Delay, Deliveries.
5. **Step 5 — Live Map:**
   - Filter and order by `locationDate`.
   - ALL / GPS / DOPPLER toggles.
   - Segment break on >48h gap or >120 km/h speed.
6. **Step 6 — Back-fill & Verification:**
   - Run acceptance test suite G1–G10.
