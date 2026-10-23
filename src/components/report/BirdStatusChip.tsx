import React, { useState } from 'react';
import { BirdStatus, STATUS_STYLE, normalizeBirdStatus, ReportLanguage } from '../../types/report';
import { RotateCcw, ChevronDown, Check } from 'lucide-react';

interface BirdStatusChipProps {
  tableStatus?: string;
  overrideStatus?: BirdStatus;
  onOverrideStatus?: (status?: BirdStatus, writeToBirdTable?: boolean) => void;
  isEditMode?: boolean;
  language?: ReportLanguage;
}

export const BirdStatusChip: React.FC<BirdStatusChipProps> = ({
  tableStatus,
  overrideStatus,
  onOverrideStatus,
  isEditMode = false,
  language = 'ar'
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [updateDb, setUpdateDb] = useState(false);

  // Normalize source status from bird table
  const resolvedTableStatus: BirdStatus = normalizeBirdStatus(tableStatus) || 'alive';
  const effectiveStatus: BirdStatus = overrideStatus || resolvedTableStatus;
  const isOverridden = Boolean(overrideStatus && overrideStatus !== resolvedTableStatus);

  const style = STATUS_STYLE[effectiveStatus] || STATUS_STYLE.alive;
  const isAr = language === 'ar';
  const labelText = isAr ? style.ar : style.en;

  if (!isEditMode) {
    return (
      <span
        id="rpt-bird-status-badge"
        className="inline-flex items-center justify-center px-2 py-0.5 rounded-full font-bold text-xs select-none border transition-colors shadow-2xs"
        style={{
          backgroundColor: style.bg,
          color: style.fg,
          borderColor: style.border
        }}
      >
        {labelText}
      </span>
    );
  }

  return (
    <div className="relative inline-flex items-center gap-1.5" style={{ direction: isAr ? 'rtl' : 'ltr' }}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full font-bold text-xs border transition-all cursor-pointer shadow-xs hover:ring-2 hover:ring-amber-400"
        style={{
          backgroundColor: style.bg,
          color: style.fg,
          borderColor: style.border
        }}
        title="تغيير حالة الطائر في التقرير"
      >
        <span>{labelText}</span>
        <ChevronDown size={12} className="opacity-70" />
      </button>

      {/* Amber dot indicating manual override with quick revert */}
      {isOverridden && (
        <button
          type="button"
          onClick={() => onOverrideStatus?.(undefined)}
          className="flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] bg-amber-100 hover:bg-amber-200 text-amber-800 rounded-full font-bold transition-colors"
          title="استعادة الحالة الأصلية من قاعدة البيانات"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
          <RotateCcw size={10} />
        </button>
      )}

      {isOpen && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setIsOpen(false)} />
          <div
            className="absolute top-full mt-1.5 w-52 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl shadow-2xl p-2 z-40 text-xs space-y-2 animate-in fade-in"
          >
            <div className="text-[10px] font-bold text-gray-400 px-1">
              {isAr ? 'حالة الطائر:' : 'Bird Status:'}
            </div>

            <div className="space-y-1">
              {(['alive', 'potential_mortality', 'dead'] as BirdStatus[]).map(st => {
                const s = STATUS_STYLE[st];
                const active = effectiveStatus === st;
                return (
                  <button
                    key={st}
                    type="button"
                    onClick={() => {
                      onOverrideStatus?.(st, updateDb);
                      setIsOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                      active ? 'ring-1 ring-amber-400' : 'hover:bg-gray-100 dark:hover:bg-slate-800'
                    }`}
                    style={{ backgroundColor: s.bg, color: s.fg }}
                  >
                    <span>{isAr ? s.ar : s.en}</span>
                    {active && <Check size={13} />}
                  </button>
                );
              })}
            </div>

            {/* Revert option */}
            {isOverridden && (
              <button
                type="button"
                onClick={() => {
                  onOverrideStatus?.(undefined);
                  setIsOpen(false);
                }}
                className="w-full text-center py-1 text-[11px] font-bold text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white rounded hover:bg-gray-100 dark:hover:bg-slate-800"
              >
                {isAr ? 'استعادة قيمة جدول الطيور' : 'Use bird table value'}
              </button>
            )}

            {/* Checkbox: also update bird table record */}
            <div className="pt-1.5 border-t border-gray-200 dark:border-slate-800">
              <label className="flex items-center gap-1.5 text-[10.5px] text-gray-600 dark:text-gray-400 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={updateDb}
                  onChange={e => setUpdateDb(e.target.checked)}
                  className="rounded text-brand-600 w-3 h-3 cursor-pointer"
                />
                <span>{isAr ? 'تحديث السجل في قاعدة البيانات أيضاً' : 'Also update bird record'}</span>
              </label>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
