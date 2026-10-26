// src/features/report-track/labelScale.ts
// Label scale and sizing configuration for map points and overlays.

export type LabelScaleId = 'release' | 'latest' | 'camps' | 'distances' | 'custom';
export const LABEL_SCALE_IDS: LabelScaleId[] = ['release', 'latest', 'camps', 'distances', 'custom'];

export const LABEL_SCALE_NAMES: Record<LabelScaleId, { en: string; ar: string }> = {
  release: { en: 'Release label', ar: 'تسمية موقع الإطلاق' },
  latest: { en: 'Latest location label', ar: 'تسمية آخر موقع' },
  camps: { en: 'Field camp labels', ar: 'تسميات المخيمات' },
  distances: { en: 'Distance pills', ar: 'كبسولات المسافات' },
  custom: { en: 'Custom map labels', ar: 'تسميات الخريطة المخصصة' }
};

export interface LabelScaleState {
  master: number;
  items: Record<LabelScaleId, number>;
}

export const DEFAULT_LABEL_SCALE: LabelScaleState = {
  master: 1,
  items: {
    release: 1,
    latest: 1,
    camps: 1,
    distances: 1,
    custom: 1
  }
};

export const MIN_LABEL_SCALE = 0.5;
export const MAX_LABEL_SCALE = 2.0;
export const clampLabelScale = (n: number) =>
  Math.min(MAX_LABEL_SCALE, Math.max(MIN_LABEL_SCALE, Math.round(n * 100) / 100));

export const effectiveLabelScale = (
  s: LabelScaleState = DEFAULT_LABEL_SCALE,
  id: LabelScaleId
) => {
  const master = s.master ?? 1;
  const item = s.items?.[id] ?? 1;
  return clampLabelScale(master * item);
};

export function labelScaleVars(s: LabelScaleState = DEFAULT_LABEL_SCALE): Record<string, string> {
  return Object.fromEntries(
    LABEL_SCALE_IDS.map(id => [`--hb-label-scale-${id}`, String(effectiveLabelScale(s, id))])
  );
}

export const setLabelMaster = (s: LabelScaleState, v: number): LabelScaleState => ({
  ...s,
  master: clampLabelScale(v)
});

export const setLabelItem = (
  s: LabelScaleState,
  id: LabelScaleId,
  v: number
): LabelScaleState => ({
  ...s,
  items: { ...s.items, [id]: clampLabelScale(v) }
});
