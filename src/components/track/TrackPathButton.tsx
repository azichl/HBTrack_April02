import React, { useRef, useState } from 'react';
import { SlidersHorizontal, ChevronDown } from 'lucide-react';
import { TrackPathSettings } from '../../types/track';
import { TrackPathPopover } from './TrackPathPopover';

export interface TrackPathButtonProps {
  settings: TrackPathSettings;
  onChange: (settings: TrackPathSettings) => void;
  onPreview?: (settings: TrackPathSettings) => void;
  displayedPointsCount: number;
  totalPointsCount: number;
  language?: 'ar' | 'en';
  className?: string;
}

export const TrackPathButton: React.FC<TrackPathButtonProps> = ({
  settings,
  onChange,
  onPreview,
  displayedPointsCount,
  totalPointsCount,
  language = 'ar',
  className = ''
}) => {
  const isAr = language === 'ar';
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Check if any non-default customization is active
  const hasCustomSettings =
    settings.type !== 'ALL' ||
    Boolean(settings.from) ||
    Boolean(settings.to) ||
    (settings.periodsEnabled && settings.periods.length > 0) ||
    settings.showPoints ||
    settings.width !== 3 ||
    settings.color !== '#6366f1';

  return (
    <>
      <div
        className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl border border-indigo-100 dark:border-slate-700/80 bg-white dark:bg-slate-800 shadow-2xs select-none ${className}`}
      >
        {/* 1. Show Track Instant Toggle */}
        <label className="flex items-center gap-1.5 cursor-pointer text-xs font-bold text-gray-800 dark:text-gray-200">
          <input
            type="checkbox"
            checked={settings.show}
            onChange={(e) => {
              const next = { ...settings, show: e.target.checked };
              onChange(next);
              onPreview?.(next);
            }}
            className="rounded text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5 cursor-pointer"
          />
          <span>{isAr ? 'إظهار المسار' : 'Show Track'}</span>
        </label>

        {/* 2. Points Badge: displayed / total wrapped in <bdi dir="ltr"> */}
        <span
          className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-mono font-bold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-800/60"
          title={isAr ? 'النقاط المعروضة / الإجمالي' : 'Displayed / Total Points'}
        >
          <bdi dir="ltr">
            {displayedPointsCount} / {totalPointsCount}
          </bdi>
        </span>

        {/* 3. Customize Button */}
        <button
          ref={buttonRef}
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          className={`relative inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold transition-all ${
            isOpen
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'bg-gray-100 hover:bg-gray-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-gray-700 dark:text-gray-200'
          }`}
          title={isAr ? 'خيارات وتخصيص المسار المتقدم' : 'Customize Flight Path'}
        >
          <SlidersHorizontal size={12} />
          <span>{isAr ? 'تخصيص' : 'Customize'}</span>
          <ChevronDown size={11} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />

          {/* Non-default indicator dot */}
          {hasCustomSettings && (
            <span
              className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-amber-500 ring-2 ring-white dark:ring-slate-800"
              title={isAr ? 'إعدادات مخصصة مفعلة' : 'Custom settings active'}
            />
          )}
        </button>
      </div>

      {/* Popover */}
      <TrackPathPopover
        anchorRef={buttonRef}
        open={isOpen}
        onClose={() => setIsOpen(false)}
        settings={settings}
        onApply={(next) => {
          onChange(next);
          onPreview?.(next);
        }}
        onPreview={onPreview}
        language={language}
      />
    </>
  );
};
