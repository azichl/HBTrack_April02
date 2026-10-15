# DIAGNOSIS_2.md — Step 0 Full Diagnostic Report

**Project:** HBTrack (HBTrack_April02)  
**Firebase Project:** `trackapp-v2` (`509636113713`)  
**Date:** October 15, 2026  
**Investigator:** Flash 3.8  
**Rules Applied:** Zero code modified during Step 0; read-only inspection and Firestore direct verification.

---

## 1. Summary of Hypotheses (H1–H7)

| # | Hypothesis | Status | Summary Evidence |
| :--- | :--- | :--- | :--- |
| **H1** | **Reconcile runs in browser & triggered manually with competing client writers** | **CONFIRMED** | `reconcilePipeline.ts` writes from client. Meanwhile, `Monitoring.tsx` lines 66–68 auto-triggers `refreshMonitoringData()` on mount, which executes `syncTransmittersFromArgosData()`. Multiple background write loops race each other. |
| **H2** | **Overwrite instead of merge & field stripping** | **CONFIRMED** | While `saveDocument` uses `{ merge: true }`, whole-document construction in `syncTransmittersFromArgosData` ([`firestoreService.ts`#L820](file:///Users/abdelazizchlih/HBTrack_April02/services/firestoreService.ts#L820)) and coordinate wipes in `resetAllTransmitterCoordinates` ([`firestoreService.ts`#L992-1002](file:///Users/abdelazizchlih/HBTrack_April02/services/firestoreService.ts#L992-L1002)) overwrite coordinates with `null` when triggered. |
| **H3** | **Key duplication / split identity (`trans-244289` vs `244289`)** | **CONFIRMED** | **Both documents exist simultaneously in Firestore right now**: `transmitters/244289` AND `transmitters/trans-244289`. `syncArgosToFirebase` in [`appStore.ts`#L1255](file:///Users/abdelazizchlih/HBTrack_April02/store/appStore.ts#L1255) forces `id: 'trans-${pid}'`, while `reconcilePipeline.ts` line 201 creates `id: pid`. |
| **H4** | **Status/visibility rules hide transmitters** | **CONFIRMED** | In [`Monitoring.tsx`#L138-142](file:///Users/abdelazizchlih/HBTrack_April02/views/Monitoring.tsx#L138-L142) and [`LiveTracking.tsx`#L1507-1510](file:///Users/abdelazizchlih/HBTrack_April02/views/LiveTracking.tsx#L1507-L1510), any transmitter with `derived_status === 'Static test'` is filtered out if it has no fixes in the current month in the local in-memory cache. |
| **H5** | **`limit(50)` without stable `orderBy` in status recalculator** | **CONFIRMED** | In [`appStore.ts`#L1868-1874](file:///Users/abdelazizchlih/HBTrack_April02/store/appStore.ts#L1868-L1874), queries to `argos_positions` and `positions` use `limit(50)` without `orderBy('timestamp', 'desc')`. Firestore returns arbitrary historical points; `evaluateTransmitterStatus` evaluates old/static data and updates the live transmitter in Firestore to `Static test` or `Inactive`. |
| **H6** | **Derived collection ordering & message date vs location date** | **CONFIRMED** | `argos_positions` documents only store `timestamp` (no separate `locationDate` or `messageDate`). Burst transmissions of buffered points cause timestamps to be evaluated against satellite arrival time rather than GPS acquisition time. |
| **H7** | **Static-test monthly archival runs on load** | **CONFIRMED** | `hasCurrentMonthFixesMap` runs on local state in `Monitoring.tsx` (lines 122–132) and `LiveTracking.tsx` (lines 1507–1510). Because local `positions` array is loaded with a 7-day limit ([`firestoreService.ts`#L629](file:///Users/abdelazizchlih/HBTrack_April02/services/firestoreService.ts#L629)), transmitters whose status was set to `Static test` disappear immediately. |

---

## 2. PTT 244289 Direct Document Comparison in Firestore

Direct retrieval from `projects/trackapp-v2/databases/(default)/documents/transmitters/`:

### Document A: `transmitters/244289` (Canonical ID)
```json
{
  "name": "projects/trackapp-v2/databases/(default)/documents/transmitters/244289",
  "fields": {
    "id": "244289",
    "platform_id": "244289",
    "status": "active",
    "derived_status": "Active",
    "bird_id": "bird-W001-2024",
    "assigned_bird_ring": "NA",
    "model": "30g",
    "manufacturer": "Microsensory",
    "lat": 46.94809,
    "latitude": 46.94809,
    "last_latitude": 46.94809,
    "lon": 66.87809,
    "longitude": 66.87809,
    "last_longitude": 66.87809,
    "last_fix": "2026-10-14T21:47:00.435Z",
    "battery_voltage": 4,
    "deployed": true,
    "duty_cycle": "8h ON/16h OFF",
    "radio_time": "None",
    "satellite_time": "Continuous",
    "site_location": "Zhezqazgan",
    "program_region": "Kazakhastan",
    "updatedAt": "2026-10-15T05:01:53.844Z",
    "updatedBy": "0UkgQN11EsQpBXKmdF9lpOsgXSf2"
  },
  "createTime": "2026-10-14T09:47:22.853223Z",
  "updateTime": "2026-10-15T05:01:53.883147Z"
}
```

### Document B: `transmitters/trans-244289` (Legacy Prefixed ID)
```json
{
  "name": "projects/trackapp-v2/databases/(default)/documents/transmitters/trans-244289",
  "fields": {
    "id": "trans-244289",
    "platform_id": "244289",
    "status": "active",
    "derived_status": "Active",
    "bird_id": "bird-W001-2024",
    "assigned_bird_ring": "NA",
    "model": "30g",
    "manufacturer": "Microsensory",
    "lat": 46.94809,
    "latitude": 46.94809,
    "last_latitude": 46.94809,
    "lon": 66.87809,
    "longitude": 66.87809,
    "last_longitude": 66.87809,
    "last_fix": "2026-10-14T21:47:00.435Z",
    "battery_voltage": 4,
    "deployed": true,
    "duty_cycle": "8h ON/16h OFF",
    "radio_time": "None",
    "satellite_time": "Continuous",
    "site_location": "Zhezqazgan",
    "program_region": "Kazakhastan",
    "updatedAt": {
      "seconds": 1792039895,
      "nanoseconds": 56000000
    },
    "updatedBy": "9XuRo4rkERQACRHNjjXeiMZegZ83"
  },
  "createTime": "2026-10-14T06:00:03.596810Z",
  "updateTime": "2026-10-15T04:53:43.202737Z"
}
```

### Key Differences & Split Brain
- `transmitters/244289` was created at 09:47 UTC and updated by user `0UkgQN11EsQpBXKmdF9lpOsgXSf2` via the new repository/pipeline layer.
- `transmitters/trans-244289` was created at 06:00 UTC and updated at 04:53 UTC by user `9XuRo4rkERQACRHNjjXeiMZegZ83` via legacy `syncTransmittersFromArgosData`.
- `updatedAt` format differs: one is a Firestore Timestamp string ISO, the other is an unflattened map `{ seconds, nanoseconds }`.
- On startup, `deduplicateTransmitters` ([`appStore.ts`#L310](file:///Users/abdelazizchlih/HBTrack_April02/store/appStore.ts#L310)) marks `trans-244289` for deletion. But as soon as `Monitoring` mounts, `refreshMonitoringData()` calls `syncTransmittersFromArgosData()`, which writes `saveDocument('transmitters', 'trans-244289', newTx)` again.

---

## 3. Query Analysis: Why Transmitters Disappear from Monitoring & Live Map

### Monitoring Table Query & Filter
In [`views/Monitoring.tsx`#L134-144](file:///Users/abdelazizchlih/HBTrack_April02/views/Monitoring.tsx#L134-L144):
```typescript
const tableData = useMemo<MonitoringTableRow[]>(() => {
  return transmitters
    .filter(t => {
      const st = t.derived_status || t.status;
      const isStatic = st === 'Static test' || st === 'Static Test' || st === 'static';
      if (isStatic && !hasCurrentMonthFixesMap.get(String(t.platform_id))) {
        return false; // <-- EXCLUDED HERE
      }
      return true;
    })
```

### Live Map Markers Filter
In [`views/LiveTracking.tsx`#L1503-1510](file:///Users/abdelazizchlih/HBTrack_April02/views/LiveTracking.tsx#L1503-L1510):
```typescript
const relevantTransmitters = transmitters.filter(t => {
   const status = t.derived_status || t.status || 'Active';
   const isStatic = status === 'Static test' || status === 'Static Test' || status === 'static';

   // Rule: Static test status tags MUST have fixes in current calendar month to display on live map
   if (isStatic && !hasCurrentMonthFixesMap.get(String(t.platform_id))) {
     return false; // <-- EXCLUDED HERE
   }
```

### The Exclusion Mechanism
1. On initial sync or reconcile, `t.derived_status` is `'Active'`, coordinates are set, and the transmitter is rendered.
2. In the background or on navigation to Monitoring, `recalculateTransmitterStatuses` runs ([`appStore.ts`#L1868-1874](file:///Users/abdelazizchlih/HBTrack_April02/store/appStore.ts#L1868-L1874)).
3. It performs:
   `query(collection(db, 'argos_positions'), where('platformId', '==', pidStr), limit(50))`
   **without an `orderBy('timestamp', 'desc')` clause**.
4. Firestore returns 50 arbitrary documents. If those 50 documents are from an older static test session (or have minimal displacement), `evaluateTransmitterStatus` evaluates them and assigns `derived_status = 'Static test'` or `'Inactive'`.
5. It then commits this back to Firestore: `await saveDocument('transmitters', t.id, statusUpdates)`.
6. On the next render or refresh, `hasCurrentMonthFixesMap` only checks the memory `positions` array (which only loads the last 7 days from Firestore). Because the transmitter now has `derived_status === 'Static test'` and has no records in that 7-day memory cache, **both `Monitoring.tsx` and `LiveTracking.tsx` filter it out permanently**.

---

## 4. All Documents Containing `244289` Across Collections

| Collection | Document Path / ID | Key Fields Verified in Firestore |
| :--- | :--- | :--- |
| `transmitters` | `transmitters/244289` | `id: "244289"`, `platform_id: "244289"`, `lat: 46.94809`, `lon: 66.87809`, `bird_id: "bird-W001-2024"`, `derived_status: "Active"` |
| `transmitters` | `transmitters/trans-244289` | `id: "trans-244289"`, `platform_id: "244289"`, `lat: 46.94809`, `lon: 66.87809`, `bird_id: "bird-W001-2024"`, `derived_status: "Active"` |
| `birds` | `birds/bird-W001-2024` | `id: "bird-W001-2024"`, `assigned_transmitter_id: "244289"`, `ring_id: "NA"`, `species: "Houbara Bustard - Wild"` |
| `positions` | `positions/pos-4960492380477868979` | `transmitter_id: "244289"`, `platformId: "244289"`, `lat: 46.9605`, `lon: 66.87512`, `lc: "1"`, `locationType: "Doppler"`, `timestamp: "2026-10-13T10:56:26.089"` |
| `positions` | `positions/pos-5089368342172777175` | `transmitter_id: "244289"`, `platformId: "244289"`, `lat: 46.94538`, `lon: 66.90363`, `lc: "A"`, `locationType: "Doppler"`, `timestamp: "2026-10-12T20:20:45.837"` |
| `positions` | `positions/pos-6027175834355967301` | `transmitter_id: "244289"`, `platformId: "244289"`, `lat: 46.94619`, `lon: 66.90216`, `lc: "B"`, `locationType: "Doppler"`, `timestamp: "2026-10-12T21:10:45.54"` |
| `positions` | `positions/pos-6108896983470038525` | `transmitter_id: "244289"`, `platformId: "244289"`, `lat: 46.94621`, `lon: 66.90216`, `lc: "B"`, `locationType: "Doppler"`, `timestamp: "2026-10-12T20:44:45.686"` |
| `positions` | `positions/pos-6168400359618287202` | `transmitter_id: "244289"`, `platformId: "244289"`, `lat: 46.94538`, `lon: 66.90363`, `lc: "A"`, `locationType: "Doppler"`, `timestamp: "2026-10-12T20:18:45.837"` |
| `argos_positions` | `argos_positions/244289_46925340_66836610_1791968529799` | `platformId: "244289"`, `lat: 46.92534`, `lon: 66.83661`, `lc: "A"`, `locationType: "Doppler"`, `dopplerError: "609"`, `timestamp: "2026-10-14T09:02:09.799Z"` |
| `argos_positions` | `argos_positions/244289_46937780_66894210_1791625095587` | `platformId: "244289"`, `lat: 46.93778`, `lon: 66.89421`, `lc: "A"`, `locationType: "Doppler"`, `dopplerError: "990"`, `timestamp: "2026-10-10T09:38:15.587Z"` |
| `argos_positions` | `argos_positions/244289_46937820_66894310_1791626295446` | `platformId: "244289"`, `lat: 46.93782`, `lon: 66.89431`, `lc: "B"`, `locationType: "Doppler"`, `dopplerError: "1014"`, `timestamp: "2026-10-10T09:58:15.446Z"` |
| `argos_positions` | `argos_positions/244289_46937870_66894880_1791623536225` | `platformId: "244289"`, `lat: 46.93787`, `lon: 66.89488`, `lc: "A"`, `locationType: "Doppler"`, `dopplerError: "1003"`, `timestamp: "2026-10-10T09:12:16.225Z"` |
| `argos_positions` | `argos_positions/244289_46937940_66894530_1791628215268` | `platformId: "244289"`, `lat: 46.93794`, `lon: 66.89453`, `lc: "B"`, `locationType: "Doppler"`, `dopplerError: "1057"`, `timestamp: "2026-10-10T10:30:15.268Z"` |

### Code Locations Building `trans-` Prefixes
1. [`services/firestoreService.ts`#L820](file:///Users/abdelazizchlih/HBTrack_April02/services/firestoreService.ts#L820): `id: 'trans-${pid}'`
2. [`services/firestoreService.ts`#L960](file:///Users/abdelazizchlih/HBTrack_April02/services/firestoreService.ts#L960): `const docId = 'trans-${cleanPid}'`
3. [`store/appStore.ts`#L1105](file:///Users/abdelazizchlih/HBTrack_April02/store/appStore.ts#L1105): `const canonicalId = 'trans-${pid}'`
4. [`store/appStore.ts`#L1255](file:///Users/abdelazizchlih/HBTrack_April02/store/appStore.ts#L1255): `id: 'trans-${pid}'`
5. [`store/appStore.ts`#L1266](file:///Users/abdelazizchlih/HBTrack_April02/store/appStore.ts#L1266): `id: 'trans-${pid}'`
6. [`store/appStore.ts`#L1317](file:///Users/abdelazizchlih/HBTrack_April02/store/appStore.ts#L1317): `id: 'trans-${pid}'`
7. [`store/appStore.ts`#L1348](file:///Users/abdelazizchlih/HBTrack_April02/store/appStore.ts#L1348): `id: 'trans-${pid}'`

---

## 5. Dangerous Code Patterns Identified

### Pattern A: `limit()` without `orderBy`
- [`store/appStore.ts`#L1504](file:///Users/abdelazizchlih/HBTrack_April02/store/appStore.ts#L1504): `query(collection(db, 'argos_positions'), where('platformId', '==', String(t.platform_id)), limit(50))`
- [`store/appStore.ts`#L1508](file:///Users/abdelazizchlih/HBTrack_April02/store/appStore.ts#L1508): `query(collection(db, 'positions'), where('transmitter_id', '==', String(t.platform_id)), limit(50))`
- [`store/appStore.ts`#L1868](file:///Users/abdelazizchlih/HBTrack_April02/store/appStore.ts#L1868): `query(collection(db, 'argos_positions'), where('platformId', '==', pidStr), limit(50))`
- [`store/appStore.ts`#L1872](file:///Users/abdelazizchlih/HBTrack_April02/store/appStore.ts#L1872): `query(collection(db, 'positions'), where('transmitter_id', '==', pidStr), limit(50))`
*Impact:* Returns non-deterministic records; causes incorrect status computation.

### Pattern B: Destructive Deletes & Coordinate Resets
- [`services/firestoreService.ts`#L977-1016](file:///Users/abdelazizchlih/HBTrack_April02/services/firestoreService.ts#L977-L1016): `resetAllTransmitterCoordinates()` loops through ALL transmitters and sets `lat: null`, `lon: null`, `latitude: null`, `longitude: null`, `last_fix: null`, `derived_status: 'inactive'`.
- [`store/appStore.ts`#L1665-1675](file:///Users/abdelazizchlih/HBTrack_April02/store/appStore.ts#L1665-L1675): `deduplicateTransmitters` deletes `trans-244289` on init while other code paths regenerate it.

### Pattern C: Startup Triggered Background Mutation
- [`views/Monitoring.tsx`#L66-68](file:///Users/abdelazizchlih/HBTrack_April02/views/Monitoring.tsx#L66-L68): Runs `refreshMonitoringData()` immediately on component mount, writing to Firestore on plain page navigation.

---

## 6. Real CLS Field Names in Telemetry Documents

Inspecting 5 raw documents from `argos_positions` in Firestore:

```
Document 1: argos_positions/244289_46925340_66836610_1791968529799
  - lat: 46.92534
  - lon: 66.83661
  - lc: "A"
  - locationType: "Doppler"
  - platformId: "244289"
  - dopplerError: "609"
  - rawData: "Doppler: 609"
  - satellite: "UNK"
  - timestamp: "2026-10-14T09:02:09.799Z"

Document 2: argos_positions/242080_40600333_66936833_1789646400000
  - lat: 40.60033333
  - lon: 66.93683333
  - lc: ""
  - locationType: "GPS"
  - platformId: "242080"
  - dopplerError: "0"
  - rawData: "Doppler: 0"
  - satellite: "UNK"
  - timestamp: "2026-09-17T12:00:00.000Z"

Document 3: argos_positions/242080_40573620_66952890_1790571052942
  - lat: 40.57362
  - lon: 66.95289
  - lc: "B"
  - locationType: "Doppler"
  - platformId: "242080"
  - dopplerError: "1293"
  - rawData: "Doppler: 1293"
  - satellite: "UNK"
  - timestamp: "2026-09-28T04:50:52.942Z"

Document 4: positions/pos-4960492380477868979
  - lat: 46.9605
  - lon: 66.87512
  - lc: "1"
  - locationType: "Doppler"
  - platformId: "244289"
  - transmitter_id: "244289"
  - satellite: "CS"
  - raw_data: "d56a02394d89467a325112"
  - timestamp: "2026-10-13T10:56:26.089"

Document 5: positions/pos-5089368342172777175
  - lat: 46.94538
  - lon: 66.90363
  - lc: "A"
  - locationType: "Doppler"
  - platformId: "244289"
  - transmitter_id: "244289"
  - satellite: "KIN4D"
  - raw_data: "fd6445800000000002176c"
  - timestamp: "2026-10-12T20:20:45.837"
```

### Exact Telemetry Fields Analysis
1. **Location Date (Fix Time):** Currently **NOT stored** as a distinct field in `argos_positions`. It was mapped into `timestamp`.
2. **Message Date (Satellite Reception Time):** Currently **NOT stored** in `argos_positions` at all.
3. **Location Class:** Field is named `lc` (e.g. `'GPS'`, `'3'`, `'2'`, `'1'`, `'0'`, `'A'`, `'B'`, `'Z'`).
4. **Coordinates:** Fields are named `lat` and `lon` (numbers). In some legacy positions docs, duplicated as `latitude` and `longitude`.
5. **Battery:** In raw data payload `rawData` / `raw_data` as hex or string; decoded into `battery_voltage`.
6. **Satellite:** Field is named `satellite` (e.g. `'KIN4D'`, `'CS'`, `'UNK'`).
7. **Current Sorting Field:** The application uses `timestamp` exclusively.

---

## 7. `ingest_runs` Verification

- Query against `ingest_runs` returned 0 documents (`[]`).
- Root cause: `reconcilePipeline.ts` has code to write to `ingest_runs`, but in production the reconciliation had not been committed through that specific path, or was previously cleared.

---

## 8. Conclusion for Step 0 Gate

The root causes of disappearing transmitters are verified with file and line evidence:
1. **Split-brain ID conflict (`trans-244289` vs `244289`)**: multiple functions fight over doc IDs and delete/re-create them.
2. **Non-deterministic `limit(50)` queries**: lack `orderBy('timestamp', 'desc')`, causing client-side `recalculateTransmitterStatuses` to assign `Static test` or `Inactive` based on arbitrary old records.
3. **Current-month cache filter**: `Monitoring` and `LiveTracking` auto-hide any transmitter flagged as `Static test` when its fixes are not in the 7-day memory cache.
4. **Uncoordinated client writes**: `Monitoring.tsx` auto-triggers Firestore writes on component mount.

**No code was modified in this diagnostic step.** We are ready to proceed with Step 1 (Freeze Client Bleeding) upon your confirmation.
