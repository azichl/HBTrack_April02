// src/features/report-track/iconScale.ts
// Icon size for map points and locations (Release pin, Latest pin, Camps, Stopovers).
// 1 = the legacy size, so the default render does not change (design lock).

export type IconId = 'release' | 'latest' | 'camps' | 'stopovers';
export const ICON_IDS: IconId[] = ['release', 'latest', 'camps', 'stopovers'];
export const ICON_LABEL: Record<IconId, string> = { release: 'Release location', latest: 'Latest location', camps: 'Field camps', stopovers: 'Stopovers' };

export interface IconScaleState { master: number; items: Record<IconId, number> }

export const DEFAULT_ICON_SCALE: IconScaleState = { master: 1, items: { release: 1, latest: 1, camps: 1, stopovers: 1 } };

export const MIN_SCALE = 0.4;
export const MAX_SCALE = 2.5;
export const clampScale = (n: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.round(n * 100) / 100));

/** master × item, clamped. */
export const effectiveScale = (s: IconScaleState, id: IconId) => clampScale(s.master * s.items[id]);

/** CSS variables to put on the MAP FRAME element (style={iconScaleVars(state)}). */
export function iconScaleVars(s: IconScaleState): Record<string, string> {
  return Object.fromEntries(ICON_IDS.map(id => [`--hb-icon-scale-${id}`, String(effectiveScale(s, id))]));
}

export const setMaster = (s: IconScaleState, v: number): IconScaleState => ({ ...s, master: clampScale(v) });
export const setItem = (s: IconScaleState, id: IconId, v: number): IconScaleState => ({ ...s, items: { ...s.items, [id]: clampScale(v) } });
