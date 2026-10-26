// src/features/report-track/IconSizeSection.tsx
// "Icon size" section for the Map Elements & Overlays popover.
//   <IconSizeSection value={mapElements.iconScale} onChange={v => update({ iconScale: v })} />

import { DEFAULT_ICON_SCALE, ICON_IDS, ICON_LABEL, MAX_SCALE, MIN_SCALE, setItem, setMaster, type IconScaleState } from './iconScale';

interface Props { value: IconScaleState; onChange: (next: IconScaleState) => void }

export function IconSizeSection({ value, onChange }: Props) {
  const pct = (n: number) => `${Math.round(n * 100)} %`;
  return (
    <section className="hbt-section" data-testid="icon-size">
      <div className="hbl-title">Icon size (points &amp; locations)</div>
      <label className="hbt-slider">
        <span className="hbt-sliderhead"><span>All icons</span><b data-testid="icon-master-pct">{pct(value.master)}</b></span>
        <input type="range" min={MIN_SCALE} max={MAX_SCALE} step={0.05} value={value.master} aria-label="All icons size"
               onChange={e => onChange(setMaster(value, Number(e.target.value)))} />
      </label>
      {ICON_IDS.map(id => (
        <label className="hbt-slider" key={id}>
          <span className="hbt-sliderhead"><span>{ICON_LABEL[id]}</span><b>{pct(value.items[id])}</b></span>
          <input type="range" min={MIN_SCALE} max={MAX_SCALE} step={0.05} value={value.items[id]} aria-label={`${ICON_LABEL[id]} icon size`}
                 onChange={e => onChange(setItem(value, id, Number(e.target.value)))} />
        </label>
      ))}
      <button type="button" className="hbl-link" onClick={() => onChange(DEFAULT_ICON_SCALE)}>Reset icon sizes</button>
    </section>
  );
}
