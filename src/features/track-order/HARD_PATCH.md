# Hard patch — the drawn line can no longer be out of order
Copy `orderLine.ts` (+ `orderLine.test.ts`, 7 tests pass) to `src/features/track-order/`. Then make exactly these changes.

## 1. At the place that hands the coordinates to the map (your snippet)
BEFORE
```ts
const polylineCoords: Array<[number, number]> = layers.line.points.map(f => [f.lat, f.lon] as [number, number]);
```
AFTER (inside the component, with the other hooks; `normMap` is the map you already use in `formatPoint`)
```ts
import { orderLine } from '../features/track-order/orderLine';   // adjust the path

const orderedLine = useMemo(
  () => orderLine(layers.line.points, {
    timeOf: f => normMap.get(f.id)?.t ?? f.t,                 // FIX (location) time — never the message time
    tieOf:  f => normMap.get(f.id)?.messageT ?? f.firstMessageMs,
    label: 'live-history',
    describe: f => ({ id: f.id, type: f.type, cls: f.cls }),
  }).points,
  [layers.line.points, normMap],
);
const polylineCoords: Array<[number, number]> = orderedLine.map(f => [f.lat, f.lon] as [number, number]);
```
If this code is not inside a component body (inside JSX or an IIFE) drop `useMemo` and call `orderLine(...)` directly.

## 2. Wherever `layers` is built
Wrap `line.points` with the same call, so the order is also right for everything else that reads it (period/segment colouring, point markers, tooltips, counters).

## 3. Every other history line
Search the project for `<Polyline`, `positions=`, `polyline(` and `setLatLngs`. **Each** history line must receive `orderLine(...).points` (live map, history panel, report map). Do not leave one path that bypasses it (that is the usual reason a fix "changes nothing").

## 4. Read the evidence (this answers "why did it not work")
Open the live map for device 43574. If the input was not chronological the console prints
`[orderLine live-history] input was not chronological: N reversals of M points …` plus a table of the first 10 offenders (previous/current time, id, type, class). Also run once: `console.log(orderLine(layers.line.points, {...same options, warn:false}).report)`. Send me or paste into the ticket: `reversalsBefore`, `reversalsAfter` (must be 0), `repeatedCoords`, `missingTime`.

* `reversalsBefore > 0` → the order was wrong upstream; it is now corrected at render. Also fix the upstream sort so counters/exports are right.
* `reversalsBefore = 0` and the zig-zag is still drawn → the order is NOT the cause (or `f.t` is the wrong time). Check in this order:
  1. **Is `f.t` the fix time?** For the point 34.7646, 67.1639, `new Date(f.t).toISOString()` must be `2026-10-25T04:00:00.000Z`. If it is `2026-10-26T13:19:12…`, `toFix` is reading the message date: `console.log(Object.keys(raw), raw)` for that record and map the field that holds the Argos table's "Location date (UTC)".
  2. **Low-quality Doppler fixes** (class A/B/0, error radius of km) jump around even when ordered. Compare the drawn type/class of the spikes (the offenders table prints them) with the Argos table's class filter.
  3. **A second line** is drawn by another component or a cached layer (step 3).
  4. `repeatedCoords > 0` → the same fix arrives from two sources with different times (e.g. `positions` with the message time and `argos_positions` with the fix time). De-duplicate by coordinates before the line is built.

## 5. Report map
`toFix` must set `t` from the same fix time (`normMap.get(id)?.t`). `buildTrackRenderModel` already sorts by `t`; with the right `t` the report line is chronological too.

## 6. Done when
* Live map and report map for 43574 and 244289 show no zig-zag; `reportAfter.reversalsAfter === 0`.
* The point 34.7646, 67.1639 is the FIRST point of the 25–26/10 stretch and its popup says Fix time 2026-10-25 04:00:00.
* `npx vitest run src/features/track-order` → 20 tests pass.
