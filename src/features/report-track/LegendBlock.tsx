// src/features/report-track/LegendBlock.tsx
// The legend PRINTED on the report. It reads the shared legend store, so it always matches the editor.

import type React from 'react';
import { legendContainerStyle, resolveLegend, type ExtraItem, type Lang, type LegendDefault, type LegendShape } from './legendModel';
import { useLegendState, type LegendStore } from './legendStore';

export function LegendGlyph({ shape, color }: { shape: LegendShape; color: string }) {
  const common = { className: 'hb-legend__glyph', viewBox: '0 0 18 12', 'aria-hidden': true as const };
  switch (shape) {
    case 'circle':   return <svg {...common}><circle cx="9" cy="6" r="4.5" fill={color} /></svg>;
    case 'square':   return <svg {...common}><rect x="4.5" y="1.5" width="9" height="9" rx="1.5" fill={color} /></svg>;
    case 'triangle': return <svg {...common}><path d="M9 1 L16 11 H2 Z" fill="#fff" stroke={color} strokeWidth="1.6" strokeLinejoin="round" /></svg>;
    case 'dashed':   return <svg {...common}><path d="M0 6 H18" stroke={color} strokeWidth="2.2" strokeDasharray="3 2" fill="none" /></svg>;
    case 'dotted':   return <svg {...common}><path d="M1 6 H17" stroke={color} strokeWidth="2.4" strokeDasharray="0.1 4" strokeLinecap="round" fill="none" /></svg>;
    default:         return <svg {...common}><path d="M0 6 H18" stroke={color} strokeWidth="2.6" strokeLinecap="round" fill="none" /></svg>;
  }
}

interface Props {
  store: LegendStore;
  presence?: Record<string, boolean>;    // which elements really exist on THIS map (camp distance line, track, …)
  extra?: ExtraItem[];                   // data-driven items (one per track period)
  defaults?: LegendDefault[];
  lang?: Lang;
  className?: string;
  onEdit?: () => void;                   // pencil (Edit mode only) → opens the legend editor popover
}

export function LegendBlock({ store, presence, extra, defaults, lang = 'en', className = '', onEdit }: Props) {
  const state = useLegendState(store);
  const { shown } = resolveLegend(state, { presence, extra, defaults, lang });
  if (!shown.length) return null;
  return (
    <div className={`hb-legend ${className}`} data-testid="map-legend" data-mode={state.layout.mode}
         style={legendContainerStyle(state.layout, shown.length) as React.CSSProperties}>
      {shown.map(i => (
        <span key={i.id} className="hb-legend__item" data-id={i.id}>
          <LegendGlyph shape={i.shape} color={i.color} />
          <span className="hb-legend__text">{i.displayLabel}</span>
        </span>
      ))}
      {onEdit && (
        <button type="button" className="hb-legend__edit" aria-label="Edit legend" onClick={onEdit} data-export-hide="true">✎</button>
      )}
    </div>
  );
}
