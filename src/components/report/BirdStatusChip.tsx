import React, { useState } from 'react';
import { BirdStatus, STATUS_COLORS, STATUS_LABEL, normalizeStatus } from '../../constants/statusColors';
import { Lock, ChevronDown, Check } from 'lucide-react';

export interface BirdStatusChipProps {
  status?: BirdStatus;
  rawStatus?: string;
  isEditable?: boolean;
  onUpdateStatus?: (newStatus: BirdStatus) => void;
  isEditMode?: boolean;
  language?: 'ar' | 'en';
}

export const BirdStatusChip: React.FC<BirdStatusChipProps> = ({
  status,
  rawStatus,
  isEditable = false,
  onUpdateStatus,
  isEditMode = false,
  language = 'ar'
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const isAr = language === 'ar';

  const effectiveStatus: BirdStatus = status || normalizeStatus(rawStatus) || 'alive';
  const colors = STATUS_COLORS[effectiveStatus] || STATUS_COLORS.alive;
  const labelText = STATUS_LABEL[effectiveStatus]?.[isAr ? 'ar' : 'en'] || (isAr ? 'حي' : 'Alive');

  // 1. Not in Edit Mode: Clean Badge
  if (!isEditMode) {
    return (
      <span
        id="rpt-bird-status-badge"
        className="hb-chip inline-flex items-center gap-1 justify-center rounded-full font-bold select-none border transition-colors shadow-2xs"
        style={{
          backgroundColor: colors.bg,
          color: colors.color,
          borderColor: colors.border
        }}
      >
        <span>{labelText}</span>
        {!isEditable && (
          <span title={isAr ? 'الحالة مأخوذة من جهاز التتبع' : 'Status comes from the transmitter'}>
            <Lock className="hb-lock opacity-60" />
          </span>
        )}
      </span>
    );
  }

  // 2. In Edit Mode: Read-Only with Lock if from Transmitter
  if (!isEditable) {
    return (
      <span
        id="rpt-bird-status-badge"
        className="hb-chip inline-flex items-center gap-1.5 justify-center rounded-full font-bold select-none border transition-colors shadow-2xs cursor-not-allowed"
        style={{
          backgroundColor: colors.bg,
          color: colors.color,
          borderColor: colors.border
        }}
        title={isAr ? 'الحالة مأخوذة من جهاز التتبع (غير قابلة للتعديل اليدوي)' : 'Status comes from the transmitter (read-only)'}
      >
        <span>{labelText}</span>
        <Lock className="hb-lock opacity-75" />
      </span>
    );
  }

  // 3. In Edit Mode: Editable for birds without transmitter (Ring / Darvic only)
  return (
    <div className="relative inline-flex items-center gap-1.5" style={{ direction: isAr ? 'rtl' : 'ltr' }}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="hb-chip inline-flex items-center gap-1.5 rounded-full font-bold border transition-all cursor-pointer shadow-xs hover:ring-2 hover:ring-amber-400"
        style={{
          backgroundColor: colors.bg,
          color: colors.color,
          borderColor: colors.border
        }}
        title={isAr ? 'تغيير حالة الطائر في جدول الطيور' : 'Change status in Bird table'}
      >
        <span>{labelText}</span>
        <ChevronDown size={12} className="opacity-70" />
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setIsOpen(false)} />
          <div
            className="absolute top-full mt-1.5 w-52 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl shadow-2xl p-2 z-40 text-xs space-y-2 animate-in fade-in"
          >
            <div className="text-[10px] font-bold text-gray-400 px-1">
              {isAr ? 'حالة الطائر (تُحفظ في جدول الطيور):' : 'Bird Status (saves to Bird table):'}
            </div>

            <div className="space-y-1">
              {(['alive', 'dead', 'potential_mortality', 'inactive'] as BirdStatus[]).map(st => {
                const c = STATUS_COLORS[st];
                const active = effectiveStatus === st;
                return (
                  <button
                    key={st}
                    type="button"
                    onClick={() => {
                      onUpdateStatus?.(st);
                      setIsOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                      active ? 'ring-1 ring-amber-400' : 'hover:bg-gray-100 dark:hover:bg-slate-800'
                    }`}
                    style={{ backgroundColor: c.bg, color: c.color }}
                  >
                    <span>{STATUS_LABEL[st]?.[isAr ? 'ar' : 'en']}</span>
                    {active && <Check size={13} />}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
