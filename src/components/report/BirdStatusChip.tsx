import React, { useState, useRef, useEffect } from 'react';
import { BirdStatus, STATUS_COLORS, STATUS_LABEL, normalizeStatus } from '../../constants/statusColors';
import { Lock, ChevronDown, Check, ExternalLink, RefreshCw, AlertCircle } from 'lucide-react';

export interface BirdStatusChipProps {
  status?: BirdStatus;
  rawStatus?: string;
  isEditable?: boolean;
  onUpdateStatus?: (newStatus: BirdStatus) => Promise<void> | void;
  isEditMode?: boolean;
  language?: 'ar' | 'en';
  transmitterId?: string;
  onOpenTransmitter?: (txId: string) => void;
  reportOverrideStatus?: BirdStatus | null;
  onSetReportOverrideStatus?: (status: BirdStatus | null) => void;
}

export const BirdStatusChip: React.FC<BirdStatusChipProps> = ({
  status,
  rawStatus,
  isEditable = false,
  onUpdateStatus,
  isEditMode = false,
  language = 'ar',
  transmitterId,
  onOpenTransmitter,
  reportOverrideStatus,
  onSetReportOverrideStatus
}) => {
  const isAr = language === 'ar';
  const [isOpen, setIsOpen] = useState(false);
  const [isLockPopoverOpen, setIsLockPopoverOpen] = useState(false);
  const [isOverriding, setIsOverriding] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState<number>(0);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listboxRef = useRef<HTMLDivElement>(null);

  const statuses: BirdStatus[] = ['alive', 'dead', 'potential_mortality', 'inactive'];

  const authoritativeStatus: BirdStatus = status || normalizeStatus(rawStatus) || 'alive';
  const effectiveStatus: BirdStatus = reportOverrideStatus || authoritativeStatus;
  const isOverridden = Boolean(reportOverrideStatus && reportOverrideStatus !== authoritativeStatus);

  const colors = STATUS_COLORS[effectiveStatus] || STATUS_COLORS.alive;
  const labelText = STATUS_LABEL[effectiveStatus]?.[isAr ? 'ar' : 'en'] || (isAr ? 'حي' : 'Alive');

  // Handle keyboard navigation for accessible listbox
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault();
        setIsOpen(true);
        setActiveIndex(statuses.indexOf(effectiveStatus));
      }
      return;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
      triggerRef.current?.focus();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((prev) => (prev + 1) % statuses.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((prev) => (prev - 1 + statuses.length) % statuses.length);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleSelectStatus(statuses[activeIndex]);
    }
  };

  const handleSelectStatus = async (newStatus: BirdStatus) => {
    setIsOpen(false);
    triggerRef.current?.focus();
    if (!onUpdateStatus || newStatus === authoritativeStatus) return;

    try {
      setSaveFeedback(isAr ? 'تم الحفظ ✓' : 'Saved ✓');
      await onUpdateStatus(newStatus);
      setTimeout(() => setSaveFeedback(null), 2500);
    } catch (err) {
      setSaveFeedback(isAr ? 'خطأ في الحفظ' : 'Save failed');
      setTimeout(() => setSaveFeedback(null), 3000);
    }
  };

  // ─── 1. TRANSMITTER BIRD (isEditable === false): Authoritative with Lock Popover
  if (!isEditable) {
    const txLabel = STATUS_LABEL[authoritativeStatus]?.[isAr ? 'ar' : 'en'];
    return (
      <div className="relative inline-flex items-center gap-1.5" style={{ direction: isAr ? 'rtl' : 'ltr' }}>
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setIsLockPopoverOpen((p) => !p)}
          id="rpt-bird-status-badge"
          className="inline-flex items-center gap-1.5 justify-center px-2.5 py-0.5 rounded-full font-bold text-xs select-none border transition-all shadow-2xs hover:ring-2 hover:ring-amber-400 cursor-pointer"
          style={{
            backgroundColor: colors.bg,
            color: colors.color,
            borderColor: colors.border
          }}
          title={isAr ? 'حالة مأخوذة من جهاز التتبع (انقر للمزيد)' : 'Status from transmitter (click for details)'}
        >
          {isOverridden && (
            <span
              className="w-2 h-2 rounded-full bg-amber-500 animate-pulse inline-block"
              title={isAr ? 'تم تعديل الحالة في هذا التقرير فقط' : 'Overridden in this report only'}
            />
          )}
          <span>{labelText}</span>
          <Lock size={10} className="opacity-70" />
        </button>

        {isOverridden && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSetReportOverrideStatus?.(null);
            }}
            className="text-[10px] text-amber-700 hover:text-amber-900 underline font-bold"
            title={isAr ? 'استعادة الحالة الأصلية من جهاز التتبع' : 'Revert to transmitter status'}
          >
            {isAr ? 'استعادة' : 'Revert'}
          </button>
        )}

        {/* Lock Popover: Explanation + Open transmitter + Override in this report only */}
        {isLockPopoverOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setIsLockPopoverOpen(false)} />
            <div
              className="absolute top-full mt-1.5 w-64 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl shadow-2xl p-3 z-50 text-xs space-y-2.5 animate-in fade-in"
              style={{ direction: isAr ? 'rtl' : 'ltr' }}
            >
              <div className="text-[11px] font-bold text-gray-700 dark:text-gray-200 flex items-center gap-1.5">
                <Lock size={12} className="text-amber-500 shrink-0" />
                <span>
                  {isAr
                    ? `الحالة مأخوذة من جهاز التتبع ${transmitterId || ''} (${txLabel})`
                    : `Status comes from transmitter ${transmitterId || ''} (${txLabel})`}
                </span>
              </div>

              <p className="text-[10px] text-gray-500 dark:text-gray-400 leading-relaxed">
                {isAr
                  ? 'بيانات الجهاز معتمدة وتُحدّث آلياً. يمكنك فتح صفحة الجهاز أو تعديل الحالة داخل هذا التقرير فقط.'
                  : 'Transmitter data is authoritative. You may open device details or override in this report only.'}
              </p>

              {!isOverriding ? (
                <div className="flex flex-col gap-1.5 pt-1 border-t border-gray-100 dark:border-slate-800">
                  {transmitterId && (
                    <button
                      type="button"
                      onClick={() => {
                        setIsLockPopoverOpen(false);
                        onOpenTransmitter?.(transmitterId);
                      }}
                      className="w-full flex items-center justify-center gap-1.5 px-2.5 py-1.5 bg-gray-100 hover:bg-gray-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-lg text-xs font-bold text-gray-800 dark:text-gray-200 transition-colors"
                    >
                      <ExternalLink size={12} />
                      <span>{isAr ? 'فتح جهاز التتبع' : 'Open transmitter'}</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => setIsOverriding(true)}
                    className="w-full flex items-center justify-center gap-1.5 px-2.5 py-1.5 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/40 dark:hover:bg-amber-950/60 border border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-200 rounded-lg text-xs font-bold transition-colors"
                  >
                    <RefreshCw size={12} />
                    <span>{isAr ? 'تعديل في هذا التقرير فقط' : 'Override in this report only'}</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-1.5 pt-1 border-t border-gray-100 dark:border-slate-800">
                  <span className="block text-[10px] font-bold text-amber-700 dark:text-amber-300">
                    {isAr ? 'اختر الحالة للتقرير (تظهر بالـ PDF):' : 'Choose report-only status (exported):'}
                  </span>
                  <div className="space-y-1">
                    {statuses.map((st) => {
                      const c = STATUS_COLORS[st];
                      return (
                        <button
                          key={st}
                          type="button"
                          onClick={() => {
                            onSetReportOverrideStatus?.(st);
                            setIsOverriding(false);
                            setIsLockPopoverOpen(false);
                          }}
                          className="w-full flex items-center justify-between px-2 py-1 rounded text-[11px] font-bold transition-colors"
                          style={{ backgroundColor: c.bg, color: c.color }}
                        >
                          <span>{STATUS_LABEL[st]?.[isAr ? 'ar' : 'en']}</span>
                          {effectiveStatus === st && <Check size={12} />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    );
  }

  // ─── 2. RING-ONLY / DARVIC-ONLY BIRD (isEditable === true): Editable and saves to Bird table
  return (
    <div className="relative inline-flex items-center gap-1.5" style={{ direction: isAr ? 'rtl' : 'ltr' }}>
      <button
        ref={triggerRef}
        type="button"
        id="rpt-bird-status-badge"
        onClick={() => {
          if (isEditMode) {
            setIsOpen((p) => !p);
            setActiveIndex(statuses.indexOf(effectiveStatus));
          }
        }}
        onKeyDown={handleKeyDown}
        className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full font-bold text-xs border transition-all shadow-xs ${
          isEditMode
            ? 'cursor-pointer hover:ring-2 hover:ring-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-400'
            : 'select-none'
        }`}
        style={{
          backgroundColor: colors.bg,
          color: colors.color,
          borderColor: colors.border
        }}
        title={isEditMode ? (isAr ? 'انقر لتغيير حالة الطائر في قاعدة البيانات' : 'Click to change status in Bird table') : undefined}
      >
        <span>{labelText}</span>
        {isEditMode && <ChevronDown size={11} className="opacity-70" />}
      </button>

      {saveFeedback && (
        <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 animate-in fade-in">
          {saveFeedback}
        </span>
      )}

      {isOpen && isEditMode && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div
            ref={listboxRef}
            role="listbox"
            tabIndex={-1}
            onKeyDown={handleKeyDown}
            className="absolute top-full mt-1.5 w-52 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl shadow-2xl p-2 z-50 text-xs space-y-2 animate-in fade-in"
          >
            <div className="text-[10px] font-bold text-gray-400 px-1">
              {isAr ? 'حالة الطائر (تُحفظ في جدول الطيور):' : 'Bird Status (saves to Bird table):'}
            </div>

            <div className="space-y-1">
              {statuses.map((st, idx) => {
                const c = STATUS_COLORS[st];
                const active = effectiveStatus === st;
                const isFocused = activeIndex === idx;

                return (
                  <button
                    key={st}
                    role="option"
                    aria-selected={active}
                    type="button"
                    onClick={() => handleSelectStatus(st)}
                    onMouseEnter={() => setActiveIndex(idx)}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      isFocused ? 'ring-2 ring-indigo-500 scale-[1.01]' : ''
                    } ${active ? 'border border-amber-400' : 'hover:bg-gray-100 dark:hover:bg-slate-800'}`}
                    style={{ backgroundColor: c.bg, color: c.color }}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: c.color }} />
                      <span>{STATUS_LABEL[st]?.[isAr ? 'ar' : 'en']}</span>
                    </div>
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
