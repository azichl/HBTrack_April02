// src/features/report-track/PeriodsEditor.tsx
// Controlled editor for "Color Path by Periods". Drop it inside the Flight Path Customizer,
// rendered only while the "Color Path by Periods" switch is ON.
//
//   <PeriodsEditor periods={draft.periods} range={dataRange} onChange={periods => patch({ periods })} />
//
// Every control is a native element (button / input[type=color] / input[type=date]) so it is always clickable.

import type { TrackPeriod } from './trackRenderModel';
import { examplePeriods, newPeriod, periodIssues, type DataRange } from './periodsModel';

interface Props {
  periods: TrackPeriod[];
  onChange: (next: TrackPeriod[]) => void;
  range: DataRange | null;          // first/last fix day: used for sensible defaults
}

export function PeriodsEditor({ periods, onChange, range }: Props) {
  const issues = periodIssues(periods);
  const update = (id: string, patch: Partial<TrackPeriod>) =>
    onChange(periods.map(p => (p.id === id ? { ...p, ...patch } : p)));

  return (
    <div className="hbt-periods" data-testid="periods-editor">
      <div className="hbt-periodbar">
        <button type="button" className="hbt-btn primary sm" onClick={() => onChange([...periods, newPeriod(periods, range)])}>
          + Add period
        </button>
        <button type="button" className="hbt-btn sm" onClick={() => onChange(examplePeriods(range))}>Example</button>
        {periods.length > 0 && (
          <button type="button" className="hbt-btn sm" onClick={() => onChange([])}>Clear all</button>
        )}
      </div>

      {periods.length === 0 && (
        <p className="hbt-hint">No periods yet. Click “Add period”, choose From – To dates and a colour.</p>
      )}

      {periods.length > 0 && (
        <div className="hbt-periodhead" aria-hidden="true">
          <span />
          <span>From</span>
          <span />
          <span>To</span>
          <span />
        </div>
      )}

      {periods.map((p, i) => (
        <div key={p.id} className={`hbt-periodwrap${issues.errors[p.id] ? ' err' : ''}`} data-testid={`period-${i}`}>
          <div className="hbt-period">
            <input type="color" value={p.color} aria-label={`Period ${i + 1} colour`}
                   onChange={e => update(p.id, { color: e.target.value })} />
            <input type="date" value={p.from} aria-label={`Period ${i + 1} from`}
                   onChange={e => update(p.id, { from: e.target.value })} />
            <span aria-hidden="true">→</span>
            <input type="date" value={p.to} aria-label={`Period ${i + 1} to`}
                   onChange={e => update(p.id, { to: e.target.value })} />
            <button type="button" className="hbt-icon" aria-label={`Remove period ${i + 1}`}
                    onClick={() => onChange(periods.filter(x => x.id !== p.id))}>✕</button>
          </div>
          <input type="text" className="hbt-periodlabel" value={p.label ?? ''} placeholder="Label for the legend (optional)"
                 aria-label={`Period ${i + 1} label`} onChange={e => update(p.id, { label: e.target.value })} />
          {issues.errors[p.id] && <div className="hbt-msg error" role="alert">{issues.errors[p.id]}</div>}
          {!issues.errors[p.id] && issues.warnings[p.id] && <div className="hbt-msg warn">{issues.warnings[p.id]}</div>}
        </div>
      ))}
    </div>
  );
}
