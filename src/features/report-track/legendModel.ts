// src/features/report-track/legendModel.ts
// ONE legend model used by BOTH the legend editor and the legend printed on the report map.
// Pure functions: no React, no DOM.
//
// IMPORTANT for the integration: DEFAULT_LEGEND below must be generated from / reconciled with the
// legend definition that already exists in the app (same ids, same English/Arabic labels, same colours),
// so that the default render stays identical to the legacy report (design lock).

export type LegendShape = 'circle' | 'square' | 'triangle' | 'line' | 'dashed' | 'dotted';
export type Lang = 'en' | 'ar';

export const SHAPE_LABEL: Record<LegendShape, string> = {
  circle: 'Circle', square: 'Square', triangle: 'Tent / Triangle', line: 'Line', dashed: 'Dashed line', dotted: 'Dotted line',
};

export interface LegendDefault { id: string; label: Record<Lang, string>; color: string; shape: LegendShape }

export interface LegendItem { id: string; label: string; color: string; shape: LegendShape; visible: boolean; custom?: boolean }

export type LegendMode = 'inline' | 'cols-1' | 'cols-2' | 'cols-3';

export interface LegendLayout {
  mode: LegendMode;        // inline = one line that wraps when needed (the legacy look)
  fontScale: number;       // 1 = legacy size; 0.7 … 1.8
  iconScale: number;       // 1 = legacy size; 0.6 … 2
}

export interface LegendOverride { label?: string; color?: string; shape?: LegendShape; visible?: boolean }

export interface LegendState {
  overrides: Record<string, LegendOverride>;
  custom: LegendItem[];
  order: string[];         // ids in display order; unknown/missing ids are appended in default order
  layout: LegendLayout;
}

export const DEFAULT_LEGEND_LAYOUT: LegendLayout = { mode: 'inline', fontScale: 1, iconScale: 1 };
export const DEFAULT_LEGEND_STATE: LegendState = { overrides: {}, custom: [], order: [], layout: DEFAULT_LEGEND_LAYOUT };

export const DEFAULT_LEGEND: LegendDefault[] = [
  { id: 'release',     label: { en: 'Release Location',            ar: 'موقع الإطلاق' },        color: '#701a2b', shape: 'circle' },
  { id: 'latest',      label: { en: 'Latest Location',             ar: 'آخر موقع' },            color: '#22c55e', shape: 'circle' },
  { id: 'camp',        label: { en: 'Camp',                        ar: 'مخيم' },                color: '#f59e0b', shape: 'triangle' },
  { id: 'distCamp',    label: { en: 'Distance to Camp',            ar: 'المسافة إلى المخيم' },  color: '#d97706', shape: 'dashed' },
  { id: 'distRelease', label: { en: 'Distance from Release point', ar: 'المسافة من نقطة الإطلاق' }, color: '#dc2626', shape: 'dashed' },
  { id: 'track',       label: { en: 'Flight Track',                ar: 'مسار الطيران' },        color: '#6366f1', shape: 'line' },
  { id: 'mainRoad',    label: { en: 'Main Road',                   ar: 'طريق رئيسي' },          color: '#c4a484', shape: 'line' },
  { id: 'towns',       label: { en: 'Cities & Towns',              ar: 'مدن وقرى' },            color: '#6b7280', shape: 'square' },
];

/** Items that are NOT in the defaults but come from the data (e.g. one per track period). */
export type ExtraItem = Omit<LegendItem, 'visible' | 'custom'>;

export interface ResolvedLegendItem extends LegendItem {
  defaultLabel: string;     // fallback when the user clears the text
  displayLabel: string;     // what the map legend prints
  onMap: boolean;           // false = the element is not on this map (e.g. no camp distance line)
  overridden: boolean;      // differs from the default (drives the ↺ button)
  shown: boolean;           // visible && onMap  → printed on the map legend
}

export interface ResolvedLegend { items: ResolvedLegendItem[]; shown: ResolvedLegendItem[] }

export function resolveLegend(
  state: LegendState,
  opts: { defaults?: LegendDefault[]; presence?: Record<string, boolean>; extra?: ExtraItem[]; lang?: Lang } = {},
): ResolvedLegend {
  const defaults = opts.defaults ?? DEFAULT_LEGEND;
  const presence = opts.presence ?? {};
  const lang = opts.lang ?? 'en';

  const base: LegendItem[] = [
    ...defaults.map(d => ({ id: d.id, label: d.label[lang], color: d.color, shape: d.shape, visible: true })),
    ...(opts.extra ?? []).map(e => ({ ...e, visible: true })),
    ...state.custom.map(c => ({ ...c, custom: true })),
  ];

  const byId = new Map(base.map(b => [b.id, b]));
  const orderedIds = [
    ...state.order.filter(id => byId.has(id)),
    ...base.map(b => b.id).filter(id => !state.order.includes(id)),
  ];

  const items = orderedIds.map(id => {
    const b = byId.get(id)!;
    const ov = state.overrides[id] ?? {};
    const label = ov.label ?? b.label;
    const merged: LegendItem = {
      ...b,
      label,
      color: ov.color ?? b.color,
      shape: ov.shape ?? b.shape,
      visible: ov.visible ?? b.visible,
    };
    const onMap = presence[id] !== false;
    return {
      ...merged,
      defaultLabel: b.label,
      displayLabel: label.trim() ? label : b.label,
      onMap,
      overridden: Object.keys(ov).length > 0,
      shown: merged.visible && onMap,
    } satisfies ResolvedLegendItem;
  });
  return { items, shown: items.filter(i => i.shown) };
}

/* ------------------------------ reducers (pure) ------------------------------ */

export const setOverride = (s: LegendState, id: string, patch: LegendOverride): LegendState => {
  const cust = s.custom.find(c => c.id === id);
  if (cust) return { ...s, custom: s.custom.map(c => (c.id === id ? { ...c, ...patch } : c)) };   // custom items are edited in place
  return { ...s, overrides: { ...s.overrides, [id]: { ...s.overrides[id], ...patch } } };
};

export const resetItem = (s: LegendState, id: string): LegendState => {
  const { [id]: _removed, ...rest } = s.overrides;
  return { ...s, overrides: rest };
};

export const setAllVisible = (s: LegendState, ids: string[], visible: boolean): LegendState =>
  ids.reduce((acc, id) => setOverride(acc, id, { visible }), s);

let seq = 0;
export const addCustom = (s: LegendState, partial: Partial<LegendItem> = {}): LegendState => {
  const id = partial.id ?? `custom:${Date.now().toString(36)}${(seq++).toString(36)}`;
  const item: LegendItem = { id, label: partial.label ?? 'New item', color: partial.color ?? '#0ea5e9', shape: partial.shape ?? 'circle', visible: true, custom: true };
  return { ...s, custom: [...s.custom, item], order: s.order.length ? [...s.order, id] : s.order };
};

export const removeCustom = (s: LegendState, id: string): LegendState => ({
  ...s, custom: s.custom.filter(c => c.id !== id), order: s.order.filter(o => o !== id),
});

/** Move one step up/down inside the CURRENT displayed order (pass the resolved ids). */
export const moveItem = (s: LegendState, currentOrder: string[], id: string, dir: -1 | 1): LegendState => {
  const i = currentOrder.indexOf(id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= currentOrder.length) return s;
  const next = [...currentOrder];
  [next[i], next[j]] = [next[j], next[i]];
  return { ...s, order: next };
};

export const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export const setLayout = (s: LegendState, patch: Partial<LegendLayout>): LegendState => {
  const l = { ...s.layout, ...patch };
  return { ...s, layout: { mode: l.mode, fontScale: clamp(Math.round(l.fontScale * 100) / 100, 0.7, 1.8), iconScale: clamp(Math.round(l.iconScale * 100) / 100, 0.6, 2) } };
};

export const resetLegend = (): LegendState => DEFAULT_LEGEND_STATE;

/* ------------------------------ layout → style ------------------------------ */

export const MODE_LABEL: Record<LegendMode, string> = { inline: '1 line', 'cols-1': '1 column', 'cols-2': '2 columns', 'cols-3': '3 columns' };

/**
 * Container style for the printed legend. Column modes use CSS grid with explicit rows and
 * `grid-auto-flow: column` (reads top→bottom, then next column). Grid is plain layout, so PDF/PNG export
 * (html2canvas / dom-to-image) renders it exactly; CSS multi-column is avoided on purpose.
 */
export function legendContainerStyle(layout: LegendLayout, count: number): Record<string, string | number> {
  const vars = { '--hb-legend-scale': layout.fontScale, '--hb-legend-icon-scale': layout.iconScale };
  if (layout.mode === 'inline') {
    return { ...vars, display: 'flex', flexWrap: 'wrap', gap: '6px 18px', alignItems: 'center' };
  }
  const cols = Math.max(1, Math.min(Number(layout.mode.split('-')[1]), Math.max(count, 1)));
  const rows = Math.max(1, Math.ceil(count / cols));
  return {
    ...vars,
    display: 'grid',
    gridAutoFlow: 'column',
    gridTemplateRows: `repeat(${rows}, auto)`,
    gridTemplateColumns: `repeat(${cols}, max-content)`,
    gap: '6px 28px',
    justifyContent: 'start',
  };
}
