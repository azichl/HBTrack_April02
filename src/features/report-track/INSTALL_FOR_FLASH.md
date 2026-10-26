# Install guide for Flash 3.8 — Custom Map Report, pass 7
Scope: **Custom Map Report only. Do not edit the live map.** Copy this whole folder to `src/features/report-track/`
(it replaces the earlier loose files with the same names). Import `./ReportTrack.css` once in the report page.
Optional dev deps for the tests: `vitest jsdom @testing-library/react @testing-library/dom @testing-library/user-event`.
Run `npx vitest run src/features/report-track` → **49 tests must pass** (they pass in the author's sandbox).

Do the five steps in order. After each step run `tsc --noEmit` and the report's visual-regression test (default look must not change).

---
## 1. Legend: editor ⇄ map legend sync  (files: legendModel.ts, legendStore.ts, LegendBlock.tsx, LegendEditorPanel.tsx)
**Cause:** the editor and the printed legend read different sources (editor said "Last Location" / listed "Distance to Camp"; the map legend said "Latest Location" and did not print it).

1. Find the app's existing legend definition (ids, English/Arabic labels, colours, shapes). **Reconcile `DEFAULT_LEGEND` in `legendModel.ts` with it** (same ids/labels/colours, so the default render is identical). Delete every other copy of those defaults.
2. Create ONE store per report and persist it in the report document:
```tsx
const legendStore = useMemo(
  () => createLegendStore(doc.legend ?? DEFAULT_LEGEND_STATE, s => updateReportDoc({ legend: s })), []);
```
3. Replace the printed legend with:
```tsx
<LegendBlock store={legendStore} lang={reportLang} presence={presence} extra={periodItems}
             onEdit={editMode ? openLegendPopover : undefined} />
```
   `presence` = which elements really exist on THIS map, e.g.
   `{ release: !!release, latest: !!latest, camp: camps.length > 0, distCamp: showCampDistance && hasCampDistanceLine, distRelease: showReleaseDistance, track: model.shown > 0 && !settings.periodsEnabled, mainRoad: placeLabelsOn, towns: placeLabelsOn }`.
   `periodItems` = `settings.periodsEnabled ? model.legend.map(l => ({ id: l.id, label: l.label, color: l.color, shape: 'line' as const })) : []` (from `buildTrackRenderModel`).
4. Replace the BODY of the existing "Map Legend" popover with `<LegendEditorPanel store={legendStore} lang={reportLang} presence={presence} extra={periodItems} onDone={closePopover} />` (keep the popover shell/header). **Delete the old editor state, draft copies and any second legend list.**
5. Presentation (**1 line / 1 column / 2 columns / 3 columns**), **text size** and **icon size** are already inside `LegendEditorPanel`; they write `legend.layout`. In `ReportTrack.css` set `--hb-legend-base-fs` to the legend font size used today (legacy value) so 100 % = unchanged.
6. Layout safety (fixed 1122×885 frame): the map frame must be `flex:1; min-height:0` and the legend card `flex:none`, so a taller legend (columns) shrinks the map instead of overflowing the page.
7. Export: set `data-exporting="true"` on the report root while exporting (the pencil has `data-export-hide`).

Done when: typing in the editor changes the map legend on the same keystroke; items with no element on the map show a "not on map" badge and are not printed; counts read `printed / total`.

## 2. Path colour by periods  (files: periodsModel.ts, PeriodsEditor.tsx, trackRenderModel.ts)
1. In the Flight Path Customizer, when the "Color Path by Periods" switch is ON render:
```tsx
<PeriodsEditor periods={draft.periods} range={dataRangeOf(fixes.map(f => f.t))}
               onChange={periods => patch({ periods })} />
```
   When OFF, hide the editor but keep the periods in settings.
2. `+ Add period` creates the next period with a new colour (first = whole data range; next = day after the last end). `Example` fills two periods. Dates are ISO `yyyy-mm-dd` strings (native date inputs bind directly). Inverted ranges show an error; overlaps a warning.
3. The map must be drawn from `buildTrackRenderModel(fixes, settings)` (UTC-day inclusive, segment colour = period of its end point, first matching period wins, dates outside all periods use the default track colour). If the existing overlay computes periods itself, **delete that code** and use the model.
4. Legend gets one entry per period (see step 1, `periodItems`); the "Flight Track" entry is hidden while periods are on (`presence.track=false`).
5. Apply/Cancel/Reset semantics stay as in the popover today (live preview while open).

## 3. Bird Data chip size  (ReportTrack.css → `.hb-chip`)
Give the Bird Status chip (and the Ring "NA" chip) the class `hb-chip` and **remove any explicit font-size/padding/height set on it**. It then inherits the size of the neighbouring value text (**the same size as "Male"**) and is bold. The 🔒 icon uses `.hb-lock` (0.9em). Colours (green/red/orange/black) stay as they are. Test: in the browser, `getComputedStyle(statusChip).fontSize === getComputedStyle(genderValue).fontSize` and `fontWeight` is `700`; the row height must not grow.

## 4. Icon size for points and locations  (files: iconScale.ts, IconSizeSection.tsx, ReportTrack.css)
1. Add `iconScale: IconScaleState` (default `DEFAULT_ICON_SCALE`) to the map-elements state (persist with the report). In the **Map Elements & Overlays** popover render
   `<IconSizeSection value={elements.iconScale} onChange={iconScale => updateElements({ iconScale })} />`.
2. Put `style={iconScaleVars(elements.iconScale)}` on the element that contains the map and its pins.
3. Apply it to the pins:
   * **DOM / `L.divIcon` / MapLibre markers:** give the INNER element the class `hb-pin-release`, `hb-pin-latest`, `hb-icon-camp` or `hb-icon-stopover` (CSS in `ReportTrack.css`; the pin tip is the transform origin so the coordinate does not move). **Never put a CSS transform on the element the map positions itself** (Leaflet's `.leaflet-marker-icon` root) — wrap the content and scale the wrapper.
   * **`L.icon` (image root):** recreate the icon when the scale changes: `iconSize: [w*s, h*s], iconAnchor: [ax*s, ay*s], popupAnchor: [px*s, py*s]` with `s = effectiveScale(elements.iconScale, id)`.
4. Default is 100 % for every icon, so the baseline render does not change. Track point dots keep their own size slider in the Track popover.

## 5. Verify (report back with evidence)
* `npx vitest run src/features/report-track` → 49 passed.
* Playwright on the real report: edit a legend label, colour, shape, order, columns (1/2/3), text size → printed legend changes immediately and in the exported PNG/PDF; Add 2 periods with different colours → two line colours and two legend entries; icon sliders change pin sizes (pin tip stays on the coordinate); status chip font size equals the "Male" font size.
* v4 visual-regression baseline still passes; `scripts/assert-scope.sh` passes (live map untouched).
