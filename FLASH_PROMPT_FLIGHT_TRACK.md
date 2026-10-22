# Flash 3.8 Execution Prompt — Multi-Period & GPS/Doppler Flight Track Customizer

The modular file `components/reports/FlightTrackCustomizer.tsx` has been created in the repository. It exports:
- `FlightTrackConfig`, `TrackColorPeriod`, `ColoredTrackSegment`
- `buildColoredTrackSegments(rawPoints, config)`
- `<FlightTrackCustomizer />`

Please wire `FlightTrackCustomizer` into `components/reports/CustomMapProductionReport.tsx` as follows:

### 1. Import `FlightTrackCustomizer` and `buildColoredTrackSegments`
At the top of `components/reports/CustomMapProductionReport.tsx`, import:
```tsx
import {
  FlightTrackCustomizer,
  FlightTrackConfig,
  buildColoredTrackSegments
} from './FlightTrackCustomizer';
```

### 2. Add flightTrackConfig State
In `CustomMapProductionReport.tsx`, add state:
```tsx
const [flightTrackConfig, setFlightTrackConfig] = useState<FlightTrackConfig>({
  enabled: showFlightTrack,
  locationType: 'ALL',
  filterStartDate: '',
  filterEndDate: '',
  useColorPeriods: false,
  defaultColor: '#6366f1',
  lineWeight: 3,
  lineDashed: false,
  showTrackPoints: false,
  periods: [
    {
      id: 'period-1',
      label: '01/01/2026 → 30/04/2026',
      startDate: '2026-01-01',
      endDate: '2026-04-30',
      color: '#2563eb'
    },
    {
      id: 'period-2',
      label: '01/05/2026 → 22/10/2026',
      startDate: '2026-05-01',
      endDate: '2026-10-22',
      color: '#f97316'
    }
  ]
});
```
And keep `showFlightTrack` synchronized with `flightTrackConfig.enabled` (when the user toggles the `إظهار مسار التتبع (Flight Track)` checkbox, update `flightTrackConfig.enabled` too).

### 3. Compute Colored Track Segments with useMemo
In `CustomMapProductionReport.tsx`, compute:
```tsx
const { segments: coloredTrackSegments, filteredPoints: activeTrackPoints } = useMemo(
  () => buildColoredTrackSegments(allHistoryPoints, { ...flightTrackConfig, enabled: showFlightTrack }),
  [allHistoryPoints, flightTrackConfig, showFlightTrack]
);
```

### 4. Render `<FlightTrackCustomizer />` in the Customizer Drawer
Inside the Customizer settings panel (`showCustomizer`), render:
```tsx
<FlightTrackCustomizer
  config={{ ...flightTrackConfig, enabled: showFlightTrack }}
  onChange={(next) => {
    setFlightTrackConfig(next);
    setShowFlightTrack(next.enabled);
  }}
  totalRawPoints={allHistoryPoints.length}
  activePointCount={activeTrackPoints.length}
  allHistoryPoints={allHistoryPoints}
/>
```

### 5. Render Colored Polylines & Optional Track Points Inside `<MapContainer>`
Replace the single flight track `<Polyline>` inside `<MapContainer>` with:
```tsx
{showFlightTrack && coloredTrackSegments.map((seg) =>
  seg.positions.length > 1 ? (
    <Polyline
      key={seg.id}
      positions={seg.positions}
      pathOptions={{
        color: seg.color || flightTrackConfig.defaultColor,
        weight: flightTrackConfig.lineWeight || 3,
        dashArray: flightTrackConfig.lineDashed ? '6, 6' : undefined,
        opacity: 0.9
      }}
    />
  ) : null
)}

{showFlightTrack && flightTrackConfig.showTrackPoints && activeTrackPoints.map((pt, idx) => (
  <CircleMarker
    key={`trk-pt-${idx}-${pt.ts}`}
    center={[pt.lat, pt.lon]}
    radius={3}
    pathOptions={{
      fillColor: '#ffffff',
      fillOpacity: 0.95,
      color: pt.color,
      weight: 1
    }}
  />
))}
```

### 6. Show Period Colors in the Map Legend Bar (`.trk-legend`)
Inside `.trk-legend` at the bottom of the map frame, when `showFlightTrack` is true:
If `flightTrackConfig.useColorPeriods` is true and `coloredTrackSegments.length > 0`, render a legend item for each segment showing its color bar and `seg.label` (e.g. `01/01/2026 → 30/04/2026`).
Otherwise render a single legend item for the Flight Track with `flightTrackConfig.defaultColor` and badge (`${flightTrackConfig.locationType}`).

### 7. Build, Deploy Live, and Push to Both GitHub Repositories
- Run `npm run build` and verify 0 errors.
- Run `firebase deploy --only hosting` to update `https://trackapp-v2.web.app/`.
- Commit and push to both `HBTrack_April02` and `ios` repositories.
