# DIAGNOSIS v3 — HBTrack GPS History Zig-Zag & Location Date Classification

**Date:** 2026-10-18  
**Analysis Target:** PTT 43574 & Core Position Classification Pipeline  
**Reference Document:** `HBTrack_gps_zigzag_deep_analysis_and_plan.md`

---

## 1. Executive Summary

The diagnostic investigation confirms that the GPS history zig-zag defect is caused by **GPS positions being stamped with satellite message reception/arrival timestamps instead of the tag's true GPS acquisition timestamp (`locationDate`)**.

GPS fixes acquired while the bird was at the Almaty and Zhezqazgan camps were memorized in tag flash memory and transmitted days later during satellite passes over the field area. Because ingestion recorded the satellite reception time (`msgDatetime`) as the position timestamp:
1. Historical camp positions were stamped with field reception timestamps (e.g., an Oct 6/7 Zhezqazgan camp fix delivered Oct 14 received an Oct 14 timestamp).
2. Sorting chronologically by timestamp caused the track polyline to violently alternate between the bird's active field coordinates ($43.87^\circ\text{N}, 73.30^\circ\text{E}$) and the Zhezqazgan camp ($47.14^\circ\text{N}, 67.81^\circ\text{E}$, over 650 km away).
3. Doppler positions appeared unaffected only because Doppler fixes are computed in real time during the satellite pass ($\text{lag} \approx 0$).

---

## 2. Ingestion Evidence & Endpoint Analysis

### 2.1 Endpoints Used
- In [`services/argosService.ts#L302`](file:///Users/abdelazizchlih/HBTrack_April02/services/argosService.ts#L302) and [`functions/clsPipeline.js#L703`](file:///Users/abdelazizchlih/HBTrack_April02/functions/clsPipeline.js#L703), the ingestion pipeline queries the CLS **messages** endpoint:
  ```http
  POST /telemetry/api/v1/retrieve-bulk
  ```
  Payload:
  ```json
  {
    "retrieveMetadata": true,
    "retrieveRawData": true,
    "retrieveDoppler": true,
    "retrieveGpsLoc": true,
    "retrieveSensors": true,
    "retrieveAdditionnalProperties": true
  }
  ```

### 2.2 Field Mapping Discrepancy
| CLS API Field | Semantic Meaning | App Ingestion Mapping | Status |
|---|---|---|---|
| `msgDatetime` / `date` | Satellite arrival time | Stamped as `timestamp` / fallback `locationDate` | **BROKEN** |
| `gpsLocDate` / `dateOfPosition` | True GPS fix acquisition date | Skipped when null; fell back to `msgDate` | **BROKEN** |
| `gpsLocLat` / `gpsLocLon` | GPS coordinates | Decoded coordinates | Valid |
| `dopplerLocDate` | Doppler computation date | Stamped as `locationDate` | Valid (lag $\approx 0$) |
| `dopplerLocClass` | Doppler LC (3, 2, 1, 0, A, B, Z) | `lc` / `locationClass` | Valid |
| `dopplerLocErrorRadius` | Doppler error radius (m) | `errorRadiusM` / `dopplerError` | Valid |

### 2.3 Evidence of Stale GPS Stamping (Firestore Live Document)
Document `argos_positions/43574_GPS_1792229959` retrieved from production Firestore:
```json
{
  "__path__": "argos_positions/43574_GPS_1792229959",
  "platformId": "43574",
  "locationType": "GPS",
  "lat": 43.8707,
  "lon": 73.3029,
  "timestamp": "2026-10-17T09:39:18.911Z",
  "locationDate": "2026-10-17T09:39:18.911Z",
  "firstMessageDate": "2026-10-17T09:39:18.911Z",
  "lagMinutes": 0,
  "rawData": "fb8301358d9965eca614d5",
  "source": "cls-api"
}
```
*Note:* The GPS position has `lagMinutes: 0` because `locationDate` was stamped with the exact satellite arrival time `2026-10-17T09:39:18.911Z`.

---

## 3. Evaluation of Root Causes (R1 – R7)

| Cause | Description | Verdict | File & Line Evidence |
|---|---|---|---|
| **R1** | **GPS `locationDate` is stamped with arrival date.** Stale GPS fixes re-sent hours/days later appear as recent fixes. | **CONFIRMED** | [`services/argosService.ts#L76`](file:///Users/abdelazizchlih/HBTrack_April02/services/argosService.ts#L76) (`rawTs = msgDate \|\| new Date().toISOString()`), [`functions/clsPipeline.js#L140`](file:///Users/abdelazizchlih/HBTrack_April02/functions/clsPipeline.js#L140). |
| **R2** | **Legacy data in Firestore retains arrival stamps.** Re-querying historical collections returns corrupt dates. | **CONFIRMED** | Firestore documents in `argos_positions` (e.g. `43574_25810500_51344300_1789206600000`) lack normalized `locationDate` and have arrival timestamps. |
| **R3** | **Two stores / two readers.** Live Map reads `positions` (boot) + `argos_positions` (history), while Argos Data reads both. | **CONFIRMED** | [`services/firestoreService.ts#L1341-L1347`](file:///Users/abdelazizchlih/HBTrack_April02/services/firestoreService.ts#L1341-L1347), [`views/LiveTracking.tsx#L1674`](file:///Users/abdelazizchlih/HBTrack_April02/views/LiveTracking.tsx#L1674). |
| **R4** | **Windowing and ordering use arrival field `timestamp`.** Queries use `where('timestamp', '>=', ...)` and `orderBy('timestamp', 'desc')`. | **CONFIRMED** | [`services/firestoreService.ts#L200-L201`](file:///Users/abdelazizchlih/HBTrack_April02/services/firestoreService.ts#L200-L201), `L614-L620`, [`store/appStore.ts#L1509`](file:///Users/abdelazizchlih/HBTrack_April02/store/appStore.ts#L1509), `L1889`. |
| **R5** | **Type filter leaks / misclassification.** GPS and Doppler positions merged or misclassified in single message row. | **CONFIRMED** | Ingestion previously picked `lat = item.gpsLocLat ?? item.dopplerLocLat`, dropping the secondary fix or mixing Doppler into GPS tracks. |
| **R6** | **Twins & Duplicates by Unit Type.** Dual reporting (`DS` and `Houbara`) produces twin documents. | **CONFIRMED** | `tests/fixtures/app_export_43574.json` contains 2 Doppler rows for same epoch second with `unitType: "DS"` (error 1970) and `"Houbara"` (error 0). |
| **R7** | **ALL mode draws a single polyline connecting GPS and Doppler.** Doppler noise (up to 3 km) adds artificial jitter. | **CONFIRMED** | [`views/LiveTracking.tsx#L1925-L1954`](file:///Users/abdelazizchlih/HBTrack_April02/views/LiveTracking.tsx#L1925-L1954) connected all fixes into a single polyline. Spec §5 requires GPS line only + Doppler as hollow dots. |

---

## 4. Guard Script Verification (`check_forbidden_date_fields.sh`)

Running `bash check_forbidden_date_fields.sh .` flagged:
- 22 occurrences of `orderBy('timestamp', 'desc')` or `where('timestamp', ...)` in `services/firestoreService.ts` and `store/appStore.ts`.
- Multiple reads across dual collections (`positions` and `argos_positions`).

---

## 5. Defects D1 – D9 Verification (`compare_cls_vs_app.py`)

Output from benchmark comparison on PTT 43574:
- **D1:** 100% of rows have `Location date == Received (first message)` (Delay +0m).
- **D2:** Twin rows created per `Unit type` (`DS` and `Houbara`).
- **D3:** Doppler error radius lost (0 m) on `Houbara` twin.
- **D4:** Deliveries always 1 (no aggregation).
- **D5:** Coordinates truncated to 4 decimals instead of full 5+ precision.
- **D6:** Stale GPS fix (02:01) re-stamped as 07:39:41 (+5.64 h delay).
- **D8:** Newest GPS differs: CLS `07:00:00 (43.8748, 73.3084)` vs App `07:39:41 (43.8730, 73.3075)`.
- **D9:** App export historically limited rows per PTT while CLS has 77 fixes.

---

## 6. Implementation Action Plan

1. **Step 1 — Engine:**
   - Install reference `positionsEngine.ts` with `buildFixes`, `buildTrack`, `filterFixes`, `lastFix`, `presetWindow`, and `mapLayers`.
   - Setup tests under `src/data/positions/` and verify 15/15 tests passing.

2. **Step 2 — Ingestion Fix:**
   - Parse true `gpsLocDate` / `GPS Date of position` for GPS fixes, and `dopplerLocDate` / `msgDatetime` for Doppler fixes.
   - Reject/quarantine any record lacking a true acquisition date; NEVER fall back to `msgDatetime`.
   - Normalize fixes via `buildFixes` into deterministic ID `{ptt}_{GPS|DOP}_{epochSeconds}`.

3. **Step 3 — Single Source Reader:**
   - Standardize queries to filter and order by `locationDateMs` / `t` (UTC).
   - In Live Map, use `mapLayers` so **ALL** renders the GPS track line with Doppler rendered as unlinked hollow dots.
   - Break track lines when gap $> 48\text{ h}$ or speed $> 120\text{ km/h}$.

4. **Step 4 — Argos Data & Export:**
   - Ensure full filtered history export (matching CLS columns, 5-decimal coordinates, real lag).
