import React, { useState, useEffect } from 'react';
import { Popover } from '../ui/Popover';
import { Segmented } from '../ui/Segmented';
import { Switch } from '../ui/Switch';
import { PeriodsEditor } from './PeriodsEditor';
import {
  TrackPathSettings,
  DEFAULT_TRACK_SETTINGS,
  PointType
} from '../../types/track';
import { RotateCcw } from 'lucide-react';

export interface TrackPathPopoverProps {
  anchorRef: React.RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;
  settings: TrackPathSettings;
  onApply: (settings: TrackPathSettings) => void;
  onPreview?: (settings: TrackPathSettings) => void;
  language?: 'ar' | 'en';
}

export const TrackPathPopover: React.FC<TrackPathPopoverProps> = ({
  anchorRef,
  open,
  onClose,
  settings,
  onApply,
  onPreview,
  language = 'ar'
}) => {
  const isAr = language === 'ar';
  const [draft, setDraft] = useState<TrackPathSettings>(() => structuredClone(settings));

  // Reset draft whenever popover opens
  useEffect(() => {
    if (open) {
      const cloned = structuredClone(settings);
      setDraft(cloned);
      onPreview?.(cloned);
    }
  }, [open, settings]);

  const updateDraft = (patch: Partial<TrackPathSettings>) => {
    setDraft((prev) => {
      const next = { ...prev, ...patch };
      onPreview?.(next);
      return next;
    });
  };

  const handleApply = () => {
    onApply(draft);
    onClose();
  };

  const handleCancel = () => {
    onPreview?.(settings);
    onClose();
  };

  const handleResetToDefault = () => {
    const res = structuredClone(DEFAULT_TRACK_SETTINGS);
    setDraft(res);
    onPreview?.(res);
  };

  // Validation: Check if main date range is inverted or any period is inverted
  const isDateRangeInverted = Boolean(
    draft.from && draft.to && draft.from > draft.to
  );
  const hasInvertedPeriod = Boolean(
    draft.periodsEnabled &&
      draft.periods.some((p) => p.from && p.to && p.from > p.to)
  );
  const isValid = !isDateRangeInverted && !hasInvertedPeriod;

  const isDirty = JSON.stringify(draft) !== JSON.stringify(settings);

  return (
    <Popover
      anchorRef={anchorRef}
      open={open}
      onClose={handleCancel}
      title={isAr ? 'تخصيص مسار الطيران' : 'Flight Path Customizer'}
      width={360}
      dirty={isDirty}
      footer={
        <div className="flex items-center justify-between w-full">
          <button
            type="button"
            onClick={handleResetToDefault}
            className="flex items-center gap-1 text-[11px] font-bold text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
          >
            <RotateCcw size={12} />
            <span>{isAr ? 'الافتراضي' : 'Reset'}</span>
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCancel}
              className="px-3 py-1.5 text-xs font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
            >
              {isAr ? 'إلغاء' : 'Cancel'}
            </button>
            <button
              type="button"
              onClick={handleApply}
              disabled={!isValid}
              className="px-3.5 py-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:pointer-events-none rounded-lg shadow-xs transition-colors"
            >
              {isAr ? 'تطبيق (Apply)' : 'Apply'}
            </button>
          </div>
        </div>
      }
    >
      {/* 1. Point Type Selector (Equal-width, no clipping) */}
      <div className="space-y-1">
        <label className="block text-[11px] font-bold text-gray-700 dark:text-gray-300">
          {isAr ? 'نوع النقاط:' : 'Point Type:'}
        </label>
        <Segmented<PointType>
          value={draft.type}
          onChange={(type) => updateDraft({ type })}
          options={[
            { value: 'ALL', label: isAr ? 'الكل (All)' : 'All' },
            { value: 'GPS', label: 'GPS' },
            { value: 'DOPPLER', label: 'Doppler' }
          ]}
        />
      </div>

      <div className="border-t border-gray-100 dark:border-slate-800" />

      {/* 2. Global Date Range Filter */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-[11px] font-bold text-gray-700 dark:text-gray-300">
            {isAr ? 'الفترة الزمنية العامة:' : 'Date Range:'}
          </label>
          {(draft.from || draft.to) && (
            <button
              type="button"
              onClick={() => updateDraft({ from: '', to: '' })}
              className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
            >
              {isAr ? 'مسح الفلتر' : 'Clear'}
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <span className="block text-[10px] text-gray-500 mb-0.5">{isAr ? 'من تاريخ:' : 'From:'}</span>
            <input
              type="date"
              dir="ltr"
              value={draft.from || ''}
              onChange={(e) => updateDraft({ from: e.target.value })}
              className="w-full px-2 py-1 text-xs font-mono bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-center"
            />
          </div>
          <div>
            <span className="block text-[10px] text-gray-500 mb-0.5">{isAr ? 'إلى تاريخ:' : 'To:'}</span>
            <input
              type="date"
              dir="ltr"
              value={draft.to || ''}
              onChange={(e) => updateDraft({ to: e.target.value })}
              className="w-full px-2 py-1 text-xs font-mono bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-center"
            />
          </div>
        </div>
        {isDateRangeInverted && (
          <p className="text-[10px] font-bold text-red-500">
            {isAr ? 'تاريخ البداية يجب أن يكون قبل أو يساوي تاريخ النهاية' : 'Start date must precede end date'}
          </p>
        )}
      </div>

      <div className="border-t border-gray-100 dark:border-slate-800" />

      {/* 3. Line Style (Color Swatch, Width Slider 1..8, Points Toggle) */}
      <div className="space-y-2">
        <label className="block text-[11px] font-bold text-gray-700 dark:text-gray-300">
          {isAr ? 'مظهر وسمك خط المسار:' : 'Line Style:'}
        </label>
        <div className="grid grid-cols-3 gap-2 items-center bg-gray-50/70 dark:bg-slate-800/40 p-2 rounded-lg border border-gray-100 dark:border-slate-800">
          {/* Swatch */}
          <div className="flex items-center gap-1.5">
            <div
              className="relative rounded-md border border-black/15 shadow-2xs overflow-hidden shrink-0 cursor-pointer"
              style={{ width: 28, height: 26, backgroundColor: draft.color }}
              title="اللون الافتراضي"
            >
              <input
                type="color"
                value={draft.color}
                onChange={(e) => updateDraft({ color: e.target.value })}
                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
              />
            </div>
            <span className="text-[10.5px] font-mono text-gray-500 uppercase">{draft.color}</span>
          </div>

          {/* Width Slider */}
          <div className="space-y-0.5">
            <div className="flex justify-between text-[10px] text-gray-500 font-semibold">
              <span>{isAr ? 'السمك:' : 'Width:'}</span>
              <span className="font-mono">{draft.width}px</span>
            </div>
            <input
              type="range"
              min={1}
              max={8}
              step={0.5}
              value={draft.width}
              onChange={(e) => updateDraft({ width: parseFloat(e.target.value) })}
              className="w-full accent-indigo-600 h-1 cursor-pointer"
            />
          </div>

          {/* Show Points Switch */}
          <div className="flex justify-end">
            <Switch
              checked={draft.showPoints}
              onChange={(showPoints) => updateDraft({ showPoints })}
              label={isAr ? 'النقاط' : 'Points'}
              size="sm"
            />
          </div>
        </div>
      </div>

      <div className="border-t border-gray-100 dark:border-slate-800" />

      {/* 4. Multi-Period Coloring Master Switch & Editor */}
      <div className="space-y-2">
        <Switch
          checked={draft.periodsEnabled}
          onChange={(periodsEnabled) => updateDraft({ periodsEnabled })}
          label={isAr ? 'تلوين المسار حسب الفترات' : 'Color Path by Periods'}
          description={isAr ? 'تقسيم المسار إلى فترات زمنية ملونة' : 'Split track into seasonal segments'}
          size="sm"
        />

        {draft.periodsEnabled && (
          <PeriodsEditor
            periods={draft.periods}
            onChange={(periods) => updateDraft({ periods })}
            language={language}
          />
        )}
      </div>
    </Popover>
  );
};
