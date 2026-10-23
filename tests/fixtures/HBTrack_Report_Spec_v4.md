# HBTrack — Report: Subject Data, Status, Track & Map Popovers (v4)
**For:** Antigravity · Builds on specs v1–v3. The report layout now matches the legacy PDF design — **keep it exactly as it is.**

## 0. Design lock (do this first, 30 min)
The legacy design is the reference: `legacy_report_baseline_244289.png` (extracted from `Houbara_Tracking_Report_244289.pdf`, 2244 × 1770 px = **1122 × 885 CSS px at 2×**, PDF page 841.5 × 663.75 pt).
1. Fixed report page frame **1122 × 885 CSS px**; export PNG must be 2244 × 1770 and PDF 841.5 × 663.75 pt (the last PNG export was 2244 × 1884, i.e. taller than the lock).
2. Add a Playwright visual-regression test: load the report with a fixed mocked bird (the 244289 data), viewport wide enough for the frame, fonts loaded, Edit mode off, compare to the baseline with `pixelmatch` (threshold 0.1, ≤ 0.5 % differing pixels, map tiles/track mocked or masked). It must pass before and after every task below.
3. **Rule:** no task in this spec may change the default look. New controls default to the value that reproduces the current render (see §4: mini-map default **ON**, coordinate format default **DMM**).

---

## 1. Selecting a ring / Darvic bird imports nothing from the Bird table (stale data bug)

### Evidence (screenshots)
After choosing ring **7751** from the Bird ID list:
- Bird Data shows `Transmitter ID = Qatar.Environment 7751` and Ring Number = the same string, i.e. the **list label was used as the identifier** instead of resolving the bird record.
- Everything else is stale from the previous bird: coordinates (46° 51.2736′ / 46° 56.5680′), dates, KPIs (9.86 km, 72.89 km, 738 days), temperature, camp, and the map chips still say `244289`. The Track badge says `0` while the map still draws pins.
- In the Bird table this bird shows **"No Transmitter"**.

### Root causes to eliminate
1. The option's *display label* is passed down as an ID. The option must carry `{ birdId, transmitterId? }` and the report must resolve from `birdId`.
2. Report blocks read from different state sources; the identity block updated but track/coordinates/KPIs/temperature kept the last transmitter's cached state.

### Required: one resolved `ReportSubject`, everything reads from it
```ts
export type IdKind = 'ptt' | 'ring' | 'darvic';
export type BirdStatus = 'alive' | 'dead' | 'potential_mortality' | 'inactive';

export interface ReportSubject {
  key: string;                                   // `${bird.id}:${transmitter?.id ?? 'none'}` — every cache/hook is keyed by this
  searched: { kind: IdKind; value: string };
  bird: BirdRecord | null;                       // from the Bird table
  transmitters: TransmitterRecord[];             // all transmitters linked to the bird
  active?: TransmitterRecord;                    // the one used for tracking
  display: {
    birdId: string;                              // subtitle value (searched kind: ptt | ring | darvic)
    transmitterId: string;                       // transmitter PTT or the Bird-table wording for none ("No Transmitter")
    ringNumber: string;                          // bird.ring or "NA"
    mapChipLabel: string;                        // chip on map pins: PTT if exists, else ring, else darvic
  };
  release?: { date?: string; lat?: number; lon?: number };   // bird record first, else first fix
  latest?: { date: string; lat: number; lon: number };       // only if fixes exist
  track: { points: Fix[]; status: 'loading' | 'ready' | 'none' };
  status: { value: BirdStatus; source: 'transmitter' | 'bird'; editable: boolean };
}
```
Resolution (`resolveReportSubject(option)`, reuse existing Bird/transmitter hooks; no duplicate fetch logic):
1. Use `option.birdId` to load the Bird record. Only if absent, fall back to a case-insensitive, space/dash-insensitive match on ring → Darvic → PTT.
2. Transmitters = those linked to the bird (Bird table link and/or transmitters collection). `active` = the non-inactive one, else the most recent. If more than one, add `Transmitter ▾` in the Text popover → "Subject" to switch.
3. Track = fixes of `active` (or `[]` / `status:'none'`). Release = bird record release date/coordinates, else first fix. Latest = last fix.
4. **Bird Data mapping** (same rows, same design, no new rows):
   | Row | Value |
   |---|---|
   | Transmitter ID | `active.ptt` else the **same "No Transmitter" string/i18n key the Bird table uses** (AR equivalent from the same key) |
   | Ring Number | `bird.ring` else `NA` |
   | Species / Gender | `bird` fields (translated like the Bird table) |
   | Bird Status | §2 |
5. Subtitle `Bird ID <value>`: value = the identifier kind that was searched (`display.birdId`).
6. **Stale-state guard:** cancel in-flight loads on subject change; all report hooks take `subject.key` as a dependency; clear previous track/KPI/temperature immediately on change.
7. **Empty states keep the layout frame** (design lock): no-transmitter bird → coordinates table shows release date/lat/lon from the Bird table and `—` for Latest; KPI cards show `—`; temperature block shows a quiet "No data" in the chart area (or uses release coordinates if available); map shows only what exists (release pin if coordinates exist; no Latest pin, no track, no camp distance lines); legend hides entries whose element is absent; Track badge shows `0`.
8. Map pin chips use `display.mapChipLabel` (not a hardcoded transmitter).
9. Tests: (a) switch 244289 → ring 7751 → the report DOM text contains no `244289`; (b) a bird with a transmitter shows its PTT; (c) a ring-only bird shows "No Transmitter" and no stale numbers; (d) selecting by Darvic and by PTT resolve the same bird.

---

## 2. Bird status — source, manual rule, colours

### Source and editing rule
- **Bird with transmitter(s):** status is **imported automatically from the transmitter** using the **existing transmitter status function used by the live map** (including the manual `Dead` status and `Inactive` rules). In the report it is **read-only**: show a small lock icon with tooltip "Status comes from the transmitter".
- **Bird without transmitter (ring ID / Darvic ID only):** the status cell is a **select** (Alive · Dead · Potential mortality · Inactive) in Edit mode, saved to the **Bird table record** (same field the Bird table uses), so the Bird table and report always agree. Writes are undoable and show Saved ✓.
- No report-only override for either case (remove the `statusOverride` idea from v3).

### Colours — same as the live map
Do **not** invent a palette. Find the colour constants the live map uses for status (markers/popups) and move them into a shared `src/constants/statusColors.ts` consumed by the live map and the report. Required mapping (use the live map's exact values; fallbacks only if none exist):

| Status | Colour |
|---|---|
| Alive | green |
| Dead | red |
| Potential mortality | orange |
| Inactive | black |

```ts
export const STATUS_LABEL = {
  alive:               { en: 'Alive',               ar: 'حي' },
  dead:                { en: 'Dead',                ar: 'نافق' },
  potential_mortality: { en: 'Potential mortality', ar: 'نفوق محتمل' },
  inactive:            { en: 'Inactive',            ar: 'غير نشط' },
} as const;

/** table-driven normaliser: EN/AR, case, spaces, underscores, hyphens */
export function normalizeStatus(raw?: string | null): BirdStatus | null {
  const s = (raw ?? '').toString().trim().toLowerCase().replace(/[\s_-]+/g, ' ');
  if (['alive', 'حي'].includes(s)) return 'alive';
  if (['dead', 'ميت', 'نافق'].includes(s)) return 'dead';
  if (['potential mortality', 'نفوق محتمل', 'احتمال نفوق'].includes(s)) return 'potential_mortality';
  if (['inactive', 'غير نشط', 'خامل'].includes(s)) return 'inactive';
  return null;                                   // unknown → neutral grey chip with the raw text
}
```
Chip rendering (same pill shape/size as today): **text colour = status colour**, background = that colour at ~12 % (`color-mix(in srgb, var(--c) 12%, white)`), border = ~25 %. Inactive: black text on light grey. Text follows the report language; same colours in PDF/PNG. Tests: normaliser (table-driven), colour mapping, editable vs locked cases.

---

## 3. Track popover ("history track path") — controls do nothing, points not shown

### Evidence
- The popover opens, but the **old inline "Customize" button + "Show Track" checkbox + counter still exist in the settings card** (screenshot 2, top). Two entry points = two states. The toolbar badge showed `0` while the card showed `1716 / 1716`.
- `Points` and `Show coordinates on map` are off by default and the report map shows only the line.

### Required
1. **One source of truth:** `useTrackSettings(subject.key)` (Firestore + localStorage as in v1). Delete the old inline Customize/Show Track card controls and any parallel state; the Studio bar `Track ▾` is the only entry. Keep only the `Show Track` master checkbox if it is the same state (bind it to `settings.show`).
2. **Wiring contract** — each control must have an observable effect on the report map; add a component test per row:

   | Control | State key | Observable effect |
   |---|---|---|
   | Point type All/GPS/Doppler | `type` | filters points; badge `shown / total` changes |
   | Date from / to | `from`, `to` | filters points; invalid range disables Apply |
   | Default colour | `color` | track colour |
   | Width slider | `width` | stroke width, live |
   | **Points** | `showPoints` | circle marker at every fix (radius 3 px, white 1 px stroke, GPS vs Doppler distinct colours) |
   | **Show coordinates on map** | `showCoordinateLabels` | printed `lat, lon` label per thinned point; turning it on auto-enables Points |
   | Colour path by periods | `periodsEnabled`, `periods[]` | per-period segment colours and point colours |
   | Reset / Cancel / Apply | — | draft discarded / defaults / commit + close, live preview while open |
3. **Point markers with coordinates must match the live map.** Reuse the live map's history-track layer through the shared `HistoryTrackLayer` (v2 §3). Do not write a second implementation. Report-mode label thinning: greedy chronological, **min 70 px** spacing, collision-avoid with legend/scale bar/north arrow/mini-map, leader lines for displaced labels; coordinate format = the Map popover's DD/DMM/DMS setting.
4. Points and labels must appear in PNG/PDF export (no hover dependence).
5. Date inputs: keep native `type="date"`, ensure each stores ISO, show an inline error and a `Clear` link; fix the focus highlight (only the active segment is highlighted today).
6. The toolbar badge, the popover counter and the legend's Flight Track entry all read the same filtered-points selector.

---

## 4. Map popover — make every control work

### Evidence (screenshot 3)
Colour chips render as **empty white boxes** (colour not bound); Mini-map toggle is **off** while the mini-map is drawn on the report; coordinate format shows **DD** selected while the report draws DMM (`067° 00.0000'E`). Most toggles have no consumer.

### Required
1. One store: `ReportDocument.mapElements` (v3 §1). The report map renderer and the legend are its **only** consumers. Delete any local-only `useState` in the popover.
2. **Defaults must reproduce the legacy render:** Release ✓, Latest ✓, Camps ✓ (all camps) with distance lines ✓, Stopovers ✗, Flight track ✓, Release→Latest distance ✓, Camp→Latest distance ✓, Place labels ✗ (legacy has none; keep the current default if different, but it must match the baseline), North arrow ✓, Scale bar ✓, Graticule ✓, **coordinate format DMM**, **Mini-map ✓**, distance unit km.
3. **Wiring contract** (add an RTL/Playwright test for each row; delete any control with no consumer):

   | Control | Effect |
   |---|---|
   | Release / Latest show + label + size | pin visibility, label text, marker size |
   | Each camp: show checkbox | camp icon and name |
   | Each camp: **Dist** checkbox | dashed distance line + km chip from that camp to latest |
   | Stopovers show / dots / dates | stopover markers and date labels |
   | Flight track | track visibility (same state as the Track popover `show`) |
   | Distance Release→Latest / Camp→Latest | line + chip (red / orange); chip text follows unit |
   | Distance unit km / mi | all chips, KPI cards ("Distance from Release", "Distance to Camp"), scale bar |
   | North arrow, scale bar, graticule | element visibility |
   | Coord format DD / DMM / DMS | graticule labels, point coordinate labels, and the Release/Latest coordinates table |
   | Mini-map inset | Kazakhstan inset visibility |
   | Colour chips | show the **actual current colour**; click opens the picker; writes through to `ReportDocument.colors` (same keys as the Colors popover so both stay in sync); `↺` resets |
4. Legend entries auto-hide when their element is hidden or absent (e.g. no track, no camp), unless pinned.
5. Popover layout: sections collapsible (Points · Lines & Distances · Map Furniture), sticky header/footer (`Reset` · `Done`), live-apply, height `min(80vh, 640px)`, scroll inside, never overlapping the toolbar.
6. All changes are undoable, autosaved, and identical in PDF/PNG.

---

## Acceptance checklist
1. Design-lock visual test passes; PNG export is 2244 × 1770, PDF 841.5 × 663.75 pt.
2. Choose ring **7751**: Bird Data comes from the Bird table, Transmitter ID reads "No Transmitter" (same wording as Bird table), Ring Number correct, release date/location from the Bird table, no `244289` or any previous-bird number anywhere in the report, Track badge `0`.
3. Transmitter birds show the status computed by the live map's transmitter logic and cannot be edited in the report; no-transmitter birds can be edited and the change appears in the Bird table.
4. Status colours: green / red / orange / black, text colour follows, identical to the live map's constants (shared module).
5. Track popover: every row in the §3 table has a passing test; with Points on, markers appear on the report map; with coordinates on, labels appear and don't overlap; export includes them; the old inline Customize card is gone.
6. Map popover: every row in the §4 table has a passing test; colour chips show real colours; defaults reproduce the baseline.
7. `tsc --noEmit`, `vite build` clean; no new console warnings. The summary lists each control and the file/line that consumes it.
