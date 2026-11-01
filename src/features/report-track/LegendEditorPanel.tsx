// src/features/report-track/LegendEditorPanel.tsx
// Body of the "Map Legend" popover. Render it INSIDE the existing popover shell (replace its current body).
// Live commit: every keystroke / click writes to the shared store, so the printed legend changes at once.

import {
  MODE_LABEL, SHAPE_LABEL, addCustom, moveItem, removeCustom, resetItem, resetLegend, resolveLegend,
  setAllVisible, setLayout, setOverride,
  type ExtraItem, type Lang, type LegendDefault, type LegendMode, type LegendShape,
} from './legendModel';
import { useLegendState, type LegendStore } from './legendStore';

interface Props {
  store: LegendStore;
  presence?: Record<string, boolean>;
  extra?: ExtraItem[];
  defaults?: LegendDefault[];
  lang?: Lang;
  onDone?: () => void;
}

const MODES: LegendMode[] = ['inline', 'cols-1', 'cols-2', 'cols-3'];

const MODE_LABEL_MAP: Record<Lang, Record<LegendMode, string>> = {
  en: { inline: '1 line', 'cols-1': '1 column', 'cols-2': '2 columns', 'cols-3': '3 columns' },
  ar: { inline: 'سطر واحد', 'cols-1': 'عمود 1', 'cols-2': 'عمودان', 'cols-3': '3 أعمدة' },
};

const SHAPE_LABEL_MAP: Record<Lang, Record<LegendShape, string>> = {
  en: { circle: 'Circle', square: 'Square', triangle: 'Tent / Triangle', line: 'Line', dashed: 'Dashed line', dotted: 'Dotted line' },
  ar: { circle: 'دائرة', square: 'مربع', triangle: 'مثلث / خيمة', line: 'خط متصل', dashed: 'خط متقطع', dotted: 'خط منقط' },
};

export function LegendEditorPanel({ store, presence, extra, defaults, lang = 'en', onDone }: Props) {
  const isAr = lang === 'ar';
  const state = useLegendState(store);
  const { items, shown } = resolveLegend(state, { presence, extra, defaults, lang });
  const ids = items.map(i => i.id);
  const set = (fn: Parameters<LegendStore['set']>[0]) => store.set(fn);
  const pct = (n: number) => `${Math.round(n * 100)} %`;

  return (
    <div className="hbl-panel" data-testid="legend-editor" dir={isAr ? 'rtl' : 'ltr'}>
      <div className="hbl-head">
        <span data-testid="legend-count">{shown.length} / {items.length} {isAr ? 'معروض' : 'shown'}</span>
        <span>
          <button type="button" className="hbl-link" onClick={() => set(s => setAllVisible(s, ids, true))}>{isAr ? 'إظهار الكل' : 'Show all'}</button>
          <span aria-hidden="true"> | </span>
          <button type="button" className="hbl-link" onClick={() => set(s => setAllVisible(s, ids, false))}>{isAr ? 'إخفاء الكل' : 'Hide all'}</button>
        </span>
      </div>

      <section aria-label={isAr ? 'طريقة العرض' : 'Presentation'} className="hbl-section">
        <div className="hbl-title">{isAr ? 'طريقة العرض' : 'Presentation'}</div>
        <div className="hbt-seg" role="radiogroup" aria-label="Legend presentation">
          {MODES.map(m => (
            <button key={m} type="button" role="radio" aria-checked={state.layout.mode === m}
                    className={state.layout.mode === m ? 'on' : ''} onClick={() => set(s => setLayout(s, { mode: m }))}>
              {MODE_LABEL_MAP[lang]?.[m] || MODE_LABEL[m]}
            </button>
          ))}
        </div>
        <label className="hbt-slider">
          <span className="hbt-sliderhead"><span>{isAr ? 'حجم النص' : 'Text size'}</span><b data-testid="legend-font-pct">{pct(state.layout.fontScale)}</b></span>
          <input type="range" min={0.7} max={1.8} step={0.05} value={state.layout.fontScale} aria-label="Legend text size"
                 onChange={e => set(s => setLayout(s, { fontScale: Number(e.target.value) }))} />
        </label>
        <label className="hbt-slider">
          <span className="hbt-sliderhead"><span>{isAr ? 'حجم الأيقونة' : 'Icon size'}</span><b>{pct(state.layout.iconScale)}</b></span>
          <input type="range" min={0.6} max={2} step={0.05} value={state.layout.iconScale} aria-label="Legend icon size"
                 onChange={e => set(s => setLayout(s, { iconScale: Number(e.target.value) }))} />
        </label>
      </section>

      <button type="button" className="hbl-add" onClick={() => set(s => addCustom(s, { label: isAr ? 'عنصر جديد' : 'New item' }))}>
        {isAr ? '+ إضافة عنصر' : '+ Add item'}
      </button>

      <ul className="hbl-list">
        {items.map((it, idx) => (
          <li key={it.id} className={`hbl-row${it.visible ? '' : ' off'}`} data-testid={`legend-row-${it.id}`}>
            <span className="hbl-move">
              <button type="button" aria-label={`Move ${it.displayLabel} up`} disabled={idx === 0}
                      onClick={() => set(s => moveItem(s, ids, it.id, -1))}>↑</button>
              <button type="button" aria-label={`Move ${it.displayLabel} down`} disabled={idx === items.length - 1}
                      onClick={() => set(s => moveItem(s, ids, it.id, 1))}>↓</button>
            </span>
            <input type="checkbox" className="hbl-eye" checked={it.visible} aria-label={`Show ${it.displayLabel}`}
                   onChange={e => set(s => setOverride(s, it.id, { visible: e.target.checked }))} />
            <input type="color" value={it.color} aria-label={`${it.displayLabel} colour`}
                   onChange={e => set(s => setOverride(s, it.id, { color: e.target.value }))} />
            <select value={it.shape} aria-label={`${it.displayLabel} shape`}
                    onChange={e => set(s => setOverride(s, it.id, { shape: e.target.value as LegendShape }))}>
              {(Object.keys(SHAPE_LABEL) as LegendShape[]).map(sh => (
                <option key={sh} value={sh}>{SHAPE_LABEL_MAP[lang]?.[sh] || SHAPE_LABEL[sh]}</option>
              ))}
            </select>
            <input type="text" value={it.label} aria-label={`${it.defaultLabel} text`} placeholder={it.defaultLabel}
                   onChange={e => set(s => setOverride(s, it.id, { label: e.target.value }))} />
            {it.overridden && !it.custom && (
              <button type="button" className="hbl-icon" aria-label={`Reset ${it.defaultLabel}`} onClick={() => set(s => resetItem(s, it.id))}>↺</button>
            )}
            {it.custom && (
              <button type="button" className="hbl-icon" aria-label={`Delete ${it.displayLabel}`} onClick={() => set(s => removeCustom(s, it.id))}>✕</button>
            )}
            {!it.onMap && <span className="hbl-badge" title="This element is not on the current map">{isAr ? 'غير موجود' : 'not on map'}</span>}
          </li>
        ))}
      </ul>

      <div className="hbl-foot">
        <button type="button" className="hbl-link" onClick={() => set(resetLegend())}>{isAr ? 'استعادة الافتراضي' : 'Reset defaults'}</button>
        {onDone && <button type="button" className="hbt-btn primary" onClick={onDone}>{isAr ? 'تم' : 'Done'}</button>}
      </div>
    </div>
  );
}
