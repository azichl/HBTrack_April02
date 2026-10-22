import React from 'react';
import { Plus, Trash2, Sparkles, AlertTriangle } from 'lucide-react';
import { TrackPeriod } from '../../types/track';

export const TRACK_PALETTE = [
  '#6366f1', // Indigo
  '#f59e0b', // Amber
  '#10b981', // Emerald
  '#ef4444', // Red
  '#0ea5e9', // Sky
  '#a855f7', // Purple
  '#84cc16', // Lime
  '#f97316', // Orange
];

export interface PeriodsEditorProps {
  periods: TrackPeriod[];
  onChange: (periods: TrackPeriod[]) => void;
  language?: 'ar' | 'en';
}

export const PeriodsEditor: React.FC<PeriodsEditorProps> = ({
  periods,
  onChange,
  language = 'ar'
}) => {
  const isAr = language === 'ar';

  const handleAdd = () => {
    const nextColor = TRACK_PALETTE[periods.length % TRACK_PALETTE.length];
    const last = periods[periods.length - 1];
    const currentYear = new Date().getFullYear();

    let defaultFrom = `${currentYear}-01-01`;
    let defaultTo = `${currentYear}-04-30`;

    if (last && last.to) {
      const d = new Date(`${last.to}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() + 1);
      defaultFrom = d.toISOString().slice(0, 10);
      defaultTo = new Date().toISOString().slice(0, 10);
    }

    const newPeriod: TrackPeriod = {
      id: `period-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      from: defaultFrom,
      to: defaultTo,
      color: nextColor,
      label: `${defaultFrom} → ${defaultTo}`
    };

    onChange([...periods, newPeriod]);
  };

  const handleExample = () => {
    const year = new Date().getFullYear();
    const p1: TrackPeriod = {
      id: `p1-${Date.now()}`,
      from: `${year}-01-01`,
      to: `${year}-04-30`,
      color: '#2563eb',
      label: isAr ? 'الربيع / التشتية' : 'Spring / Winter'
    };
    const p2: TrackPeriod = {
      id: `p2-${Date.now() + 1}`,
      from: `${year}-05-01`,
      to: `${year}-10-22`,
      color: '#f97316',
      label: isAr ? 'التكاثر / الصيف' : 'Breeding / Summer'
    };
    onChange([p1, p2]);
  };

  const handleUpdate = (id: string, patch: Partial<TrackPeriod>) => {
    const next = periods.map((p) => {
      if (p.id !== id) return p;
      const updated = { ...p, ...patch };
      if (!updated.label || updated.label.includes('→')) {
        updated.label = `${updated.from} → ${updated.to}`;
      }
      return updated;
    });
    onChange(next);
  };

  const handleRemove = (id: string) => {
    onChange(periods.filter((p) => p.id !== id));
  };

  return (
    <div className="space-y-2 pt-1 text-xs">
      {/* Top action row */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-bold text-gray-700 dark:text-gray-300">
          {isAr ? 'فترات المسار اللونية' : 'Colored Track Periods'} ({periods.length})
        </span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleExample}
            className="px-2 py-1 text-[10.5px] font-bold text-amber-700 dark:text-amber-300 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded flex items-center gap-1 transition-colors"
            title={isAr ? 'تطبيق مثال جاهز (فترتين)' : 'Load sample 2 periods'}
          >
            <Sparkles size={11} />
            <span>{isAr ? 'مثال' : 'Example'}</span>
          </button>
          <button
            type="button"
            onClick={handleAdd}
            className="px-2.5 py-1 text-[10.5px] font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded flex items-center gap-1 transition-colors shadow-2xs"
          >
            <Plus size={11} />
            <span>{isAr ? '+ فترة' : '+ Add'}</span>
          </button>
        </div>
      </div>

      {/* Period rows */}
      {periods.length === 0 ? (
        <p className="text-[11px] text-gray-400 italic text-center py-2 bg-gray-50 dark:bg-slate-800/40 rounded-lg border border-dashed border-gray-200 dark:border-slate-700">
          {isAr ? 'لا توجد فترات لونية مضافة. اضغط + فترة أو مثال.' : 'No periods added yet.'}
        </p>
      ) : (
        <div className="space-y-1.5 max-h-[190px] overflow-y-auto pr-0.5">
          {/* Header row labels */}
          <div
            className="grid text-[10px] font-bold text-gray-400 uppercase px-1 select-none"
            style={{
              gridTemplateColumns: '28px minmax(0, 1fr) 14px minmax(0, 1fr) 28px',
              gap: 6
            }}
          >
            <span className="text-center">#</span>
            <span>{isAr ? 'من' : 'From'}</span>
            <span />
            <span>{isAr ? 'إلى' : 'To'}</span>
            <span />
          </div>

          {periods.map((period, idx) => {
            const isInverted = period.from && period.to && period.from > period.to;

            return (
              <div
                key={period.id}
                className={`grid items-center p-1 rounded-lg border transition-colors ${
                  isInverted
                    ? 'border-red-300 bg-red-50/70 dark:bg-red-950/30'
                    : 'border-gray-200 dark:border-slate-700 bg-gray-50/70 dark:bg-slate-800/60'
                }`}
                style={{
                  gridTemplateColumns: '28px minmax(0, 1fr) 14px minmax(0, 1fr) 28px',
                  gap: 6
                }}
              >
                {/* 1. Color Swatch */}
                <div
                  className="relative rounded-md border border-black/15 shadow-2xs overflow-hidden shrink-0 cursor-pointer"
                  style={{ width: 28, height: 26, backgroundColor: period.color }}
                  title="تغيير اللون"
                >
                  <input
                    type="color"
                    value={period.color}
                    onChange={(e) => handleUpdate(period.id, { color: e.target.value })}
                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                  />
                </div>

                {/* 2. From date */}
                <input
                  type="date"
                  dir="ltr"
                  aria-label={`Period ${idx + 1} From Date`}
                  value={period.from}
                  onChange={(e) => handleUpdate(period.id, { from: e.target.value })}
                  className="min-w-0 w-full px-1.5 py-1 text-[11px] font-mono bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-600 rounded text-center leading-none"
                />

                {/* Arrow */}
                <span className="text-gray-400 text-center text-xs select-none leading-none">→</span>

                {/* 3. To date */}
                <input
                  type="date"
                  dir="ltr"
                  aria-label={`Period ${idx + 1} To Date`}
                  value={period.to}
                  onChange={(e) => handleUpdate(period.id, { to: e.target.value })}
                  className="min-w-0 w-full px-1.5 py-1 text-[11px] font-mono bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-600 rounded text-center leading-none"
                />

                {/* 4. Delete button / warn */}
                <div className="flex items-center justify-center">
                  {isInverted ? (
                    <span title="تاريخ البداية أكبر من النهاية!" className="text-red-500">
                      <AlertTriangle size={14} />
                    </span>
                  ) : (
                    <button
                      type="button"
                      aria-label="Delete period"
                      onClick={() => handleRemove(period.id)}
                      className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 rounded transition-colors"
                      title={isAr ? 'حذف الفترة' : 'Delete'}
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
