# Live Map History-Track Options & Rules Discovery

Documented from `views/LiveTracking.tsx`, `services/firestoreService.ts`, and `utils/formatting.ts`.

## 1. History Options Exposed by the Live Map

| Option / Label | State Key in `LiveTracking.tsx` | Type | Default Value | Notes |
|---|---|---|---|---|
| **Show History** (`السجل` / `History`) | `showHistory` | `boolean` | `false` | Controls whether historical paths are loaded and rendered. Auto-enabled when choosing a bird from search. |
| **History Mode** | `historyMode` | `'preset' \| 'custom'` | `'preset'` | Switch between preset time horizons and custom date pickers. |
| **Presets** | `historyPreset` | `'last_pos' \| '24h' \| '7d' \| '30d' \| '1y' \| '2y'` | `'24h'` | Pre-calculated time ranges relative to `now`. |
| **Custom Range** | `customDates` | `{ start: string, end: string }` | `{ start: today - 7d, end: today }` | Inputs for start date and end date. |
| **Location Type** (`All` / `GPS` / `Doppler`) | `historyFixType` | `'All' \| 'GPS' \| 'Doppler'` | `'All'` | Filters fixes and path rendering: `GPS`, `Doppler`, or `All`. |
| **Track Line Colors** | `colors` | `string[]` | `['#6366f1', ...]` | Default primary track color is `#6366f1` (Indigo). |
| **Degraded Fixes Filter** | `showDegradedFixes` | `boolean` | `false` | Hides low quality fixes (Doppler classes A/B or error radius > 2000m). |

---

## 2. Point Classification: GPS vs Doppler

- **Primary classifier:** `classifyLocationType(lc?: string, rawLocType?: string, satellite?: string): 'GPS' | 'DOPPLER'` located in `utils/formatting.ts:145`.
  - Fix is **GPS** if `rawLocType === 'GPS'` or `lc === 'GPS'` or `lc === 'G'` or `satellite === 'GPS'`.
  - Fix is **Doppler** if `rawLocType === 'DOPPLER'` or `lc` is one of `'3', '2', '1', '0', 'A', 'B', 'Z'`.
- **Firestore normalization:** `getHistoricalPositions` in `services/firestoreService.ts:1287`:
  `const isGps = d.locationType === 'GPS' || (!d.locationType && (!d.lc || d.lc === 'GPS'));`
  `const locType: 'GPS' | 'DOPPLER' = isGps ? 'GPS' : 'DOPPLER';`
- **Report adapter rule:** The report uses `toFix(raw): Fix` mapping `kind: 'GPS' | 'DOPPLER'` using this exact classification rule.

---

## 3. Data Hook & Loader

- **Function:** `getHistoricalPositions(transmitterIds: string[], startDate: Date, endDate: Date)` in `services/firestoreService.ts:1269`.
- **Collections Queried:**
  1. `argos_positions` by `platformId` (`== pidStr`).
  2. `positions` by `transmitter_id` (`== pidStr`).
- **Processing:** Raw documents are validated with `processDocToRawFix` and deduplicated/normalized via `buildFixes(rawFixesForPtt)` in `src/data/positions/positionsEngine.ts`.
- **Report usage:** The report calls `useReportFixes(targetPttId)` which invokes `getHistoricalPositions` over the full active history window and converts documents into `Fix[]`.

---

## 4. Coordinate Format Setting & Formatter

- **Legacy Report Standard:** `DMM` (Degrees + Decimal Minutes, e.g. `46° 51.2736′ N  066° 54.4866′ E`).
- **Options Available:**
  - `DMM`: Degrees Decimal Minutes (`DD° MM.MMMM′ H`) - *Report Default*.
  - `DD`: Decimal Degrees (`DD.DDDDD° H`).
  - `DMS`: Degrees Minutes Seconds (`DD° MM′ SS.SS″ H`).
- **Formatter function:** `formatCoord(v, axis, fmt)` and `formatLatLon(lat, lon, fmt)` in `src/features/report-track/trackRenderModel.ts`.

---

## 5. Colors Used Across Live Tracking and Reports

| Element | Hex Color | Usage |
|---|---|---|
| **Default Flight Track** | `#6366f1` | Primary historical flight path polyline. |
| **GPS Fix Markers** | `#16a34a` | Green indicator for high-precision GPS fixes. |
| **Doppler Fix Markers** | `#f59e0b` | Amber indicator for Argos Doppler fixes. |
| **Marker Halo Ring** | `#ffffff` | 2px white outer stroke for contrast over maps. |
| **Alternate Track Colors** | `#ec4899`, `#14b8a6`, `#8b5cf6`, `#ef4444`, `#10b981`, `#3b82f6` | Multi-transmitter or multi-period palettes. |
