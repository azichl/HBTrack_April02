import React, { useState, useEffect, useMemo } from 'react';
import { Popover } from '../ui/Popover';
import { Segmented } from '../ui/Segmented';
import { Switch } from '../ui/Switch';
import { PeriodsEditor } from './PeriodsEditor';
import {
  TrackSettings,
  DEFAULT_TRACK_SETTINGS,
  PointType,
  DashStyle,
  PointColorMode,
  CoordFormat,
  Fix,
  buildTrackRenderModel
} from '../../features/track/trackRenderModel';
import { RotateCcw } from 'lucide-react';

export interface TrackPathPopoverProps {
  anchorRef: React.RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;
  settings: TrackSettings;
  onApply: (settings: TrackSettings) => void;
  onPreview?: (settings: TrackSettings) => void;
  language?: 'ar' | 'en';
  dataDateRange?: { from: string; to: string };
  rawFixes?: Fix[];
  totalCounts?: { gps: number; doppler: number; total: number };
}

export const TrackPathPopover: React.FC<TrackPathPopoverProps> = ({
  anchorRef,
  open,
  onClose,
  settings,
  onApply,
  onPreview,
  language = 'ar',
  dataDateRange,
  rawFixes = [],
  totalCounts
}) => {
  const isAr = language === 'ar';
  const [draft, setDraft] = useState<TrackSettings>(() => ({
    ...DEFAULT_TRACK_SETTINGS,
    ...settings
  }));

  // Reset draft whenever popover opens
  useEffect(() => {
    if (open) {
      const cloned = { ...DEFAULT_TRACK_SETTINGS, ...structuredClone(settings) };
      setDraft(cloned);
      onPreview?.(cloned);
    }
  }, [open, settings]);

  const updateDraft = (patch: Partial<TrackSettings>) => {
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

  // Live count computations
  const counts = useMemo(() => {
    if (totalCounts) return totalCounts;
    let gps = 0;
    let doppler = 0;
    for (const f of rawFixes) {
      if (f.kind === 'GPS') gps++;
      else if (f.kind === 'DOPPLER') doppler++;
    }
    return { gps, doppler, total: rawFixes.length };
  }, [rawFixes, totalCounts]);

  const liveModel = useMemo(() => {
    if (!rawFixes.length) return null;
    return buildTrackRenderModel(rawFixes, draft);
  }, [rawFixes, draft]);

  const shownCount = liveModel ? liveModel.shown : (
    draft.type === 'GPS' ? counts.gps : draft.type === 'DOPPLER' ? counts.doppler : counts.total
  );

  // Validation: Check if main date range is inverted or any period is inverted
  const isDateRangeInverted = Boolean(
    draft.from && draft.to && draft.from > draft.to
  );
  const hasInvertedPeriod = Boolean(
    draft.periodsEnabled &&
      draft.periods.some((p) => p.from && p.to && p.from > p.to)
  );
  const isValid = !isDateRangeInverted && !hasInvertedPeriod;

  const isDirty = JSON.stringify(draft) !== JSON.stringify({ ...DEFAULT_TRACK_SETTINGS, ...settings });

  return (
    <Popover
      anchorRef={anchorRef}
      open={open}
      onClose={handleCancel}
      title={isAr ? 'تخصيص مسار الطيران' : 'Flight Path Customizer'}
      width={400}
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
      <div className="space-y-3 max-h-[min(70vh,540px)] overflow-y-auto pr-1">
        {/* 1. Point Type Selector with Live GPS / Doppler Counts */}
        <div className="space-y-1.5">
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
          <div className="text-[10px] font-mono text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-slate-800/60 p-1.5 rounded-md border border-gray-100 dark:border-slate-800 text-center select-none">
            GPS <span className="font-bold text-emerald-600 dark:text-emerald-400">{counts.gps}</span>
            {' · '}
            Doppler <span className="font-bold text-amber-600 dark:text-amber-400">{counts.doppler}</span>
            {' · '}
            {isAr ? 'المعروض' : 'shown'} <span className="font-bold text-indigo-600 dark:text-indigo-400">{shownCount}</span> / {counts.total}
          </div>
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

        {/* 3. Line Style (Color, Width, Opacity, Style Solid/Dashed/Dotted) */}
        <div className="space-y-2">
          <label className="block text-[11px] font-bold text-gray-700 dark:text-gray-300">
            {isAr ? 'مظهر وسمك خط المسار:' : 'Line Style:'}
          </label>
          <div className="bg-gray-50/70 dark:bg-slate-800/40 p-2.5 rounded-lg border border-gray-100 dark:border-slate-800 space-y-2">
            <div className="flex items-center justify-between gap-2">
              {/* Color Swatch */}
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

              {/* Style: Solid | Dashed | Dotted */}
              <div className="w-48">
                <Segmented<DashStyle>
                  value={draft.dash || 'solid'}
                  onChange={(dash) => updateDraft({ dash })}
                  options={[
                    { value: 'solid', label: isAr ? 'متصل' : 'Solid' },
                    { value: 'dashed', label: isAr ? 'متقطع' : 'Dashed' },
                    { value: 'dotted', label: isAr ? 'منقّط' : 'Dotted' }
                  ]}
                />
              </div>
            </div>

            {/* Width and Opacity Sliders */}
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div>
                <div className="flex justify-between text-[10px] text-gray-500 font-semibold mb-0.5">
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
              <div>
                <div className="flex justify-between text-[10px] text-gray-500 font-semibold mb-0.5">
                  <span>{isAr ? 'الشفافية:' : 'Opacity:'}</span>
                  <span className="font-mono">{Math.round((draft.opacity ?? 1) * 100)}%</span>
                </div>
                <input
                  type="range"
                  min={0.2}
                  max={1}
                  step={0.05}
                  value={draft.opacity ?? 1}
                  onChange={(e) => updateDraft({ opacity: parseFloat(e.target.value) })}
                  className="w-full accent-indigo-600 h-1 cursor-pointer"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-gray-100 dark:border-slate-800" />

        {/* 4. Points (Switch + Point Size Slider 2-16px + Opacity + Color Mode) */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Switch
              checked={Boolean(draft.showPoints)}
              onChange={(showPoints) => updateDraft({ showPoints })}
              label={isAr ? 'إظهار نقاط المسار (Points)' : 'Show track points'}
              size="sm"
            />
          </div>

          {draft.showPoints && (
            <div className="bg-gray-50/70 dark:bg-slate-800/40 p-2.5 rounded-lg border border-gray-100 dark:border-slate-800 space-y-2 animate-in fade-in">
              <div className="grid grid-cols-2 gap-3">
                {/* Point Size (2-16px) */}
                <div>
                  <div className="flex justify-between text-[10px] text-gray-500 font-semibold mb-0.5">
                    <span>{isAr ? 'حجم النقطة:' : 'Point Size:'}</span>
                    <span className="font-mono font-bold text-indigo-600">{draft.pointSize || 6}px</span>
                  </div>
                  <input
                    type="range"
                    min={2}
                    max={16}
                    step={1}
                    value={draft.pointSize || 6}
                    onChange={(e) => updateDraft({ pointSize: parseInt(e.target.value, 10) })}
                    className="w-full accent-indigo-600 h-1 cursor-pointer"
                  />
                </div>

                {/* Point Opacity (20-100%) */}
                <div>
                  <div className="flex justify-between text-[10px] text-gray-500 font-semibold mb-0.5">
                    <span>{isAr ? 'الشفافية:' : 'Point Opacity:'}</span>
                    <span className="font-mono">{Math.round((draft.pointOpacity ?? 1) * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min={0.2}
                    max={1}
                    step={0.05}
                    value={draft.pointOpacity ?? 1}
                    onChange={(e) => updateDraft({ pointOpacity: parseFloat(e.target.value) })}
                    className="w-full accent-indigo-600 h-1 cursor-pointer"
                  />
                </div>
              </div>

              {/* Point Color Mode: Same as track | By type | By period */}
              <div className="space-y-1 pt-1">
                <span className="block text-[10px] text-gray-500 font-semibold">
                  {isAr ? 'تلوين النقاط:' : 'Point Color Mode:'}
                </span>
                <Segmented<PointColorMode>
                  value={draft.pointColorMode || 'track'}
                  onChange={(pointColorMode) => updateDraft({ pointColorMode })}
                  options={[
                    { value: 'track', label: isAr ? 'نفس المسار' : 'Track' },
                    { value: 'type', label: isAr ? 'حسب النوع' : 'By Type' },
                    { value: 'period', label: isAr ? 'حسب الفترة' : 'By Period' }
                  ]}
                />
              </div>

              {/* By Type swatches: GPS vs Doppler */}
              {draft.pointColorMode === 'type' && (
                <div className="flex items-center justify-around gap-2 pt-1 border-t border-gray-200/50 dark:border-slate-700/50">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-bold text-gray-600 dark:text-gray-300">GPS:</span>
                    <div
                      className="relative rounded border border-black/15 shadow-2xs overflow-hidden w-6 h-5 cursor-pointer"
                      style={{ backgroundColor: draft.gpsColor || '#16a34a' }}
                    >
                      <input
                        type="color"
                        value={draft.gpsColor || '#16a34a'}
                        onChange={(e) => updateDraft({ gpsColor: e.target.value })}
                        className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-bold text-gray-600 dark:text-gray-300">Doppler:</span>
                    <div
                      className="relative rounded border border-black/15 shadow-2xs overflow-hidden w-6 h-5 cursor-pointer"
                      style={{ backgroundColor: draft.dopplerColor || '#f59e0b' }}
                    >
                      <input
                        type="color"
                        value={draft.dopplerColor || '#f59e0b'}
                        onChange={(e) => updateDraft({ dopplerColor: e.target.value })}
                        className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="border-t border-gray-100 dark:border-slate-800" />

        {/* 5. Show Coordinates on Map Switch (Auto-enables Points) */}
        <div className="space-y-2">
          <Switch
            checked={Boolean(draft.showCoordinateLabels)}
            onChange={(showCoordinateLabels) => {
              if (showCoordinateLabels) {
                updateDraft({ showCoordinateLabels: true, showPoints: true });
              } else {
                updateDraft({ showCoordinateLabels: false });
              }
            }}
            label={isAr ? 'عرض الإحداثيات كنصوص على الخريطة' : 'Show coordinates on map'}
            description={isAr ? 'تثبيت ملصقات الإحداثيات مع منع التداخل' : 'Auto-spaced coordinate labels'}
            size="sm"
          />

          {draft.showCoordinateLabels && (
            <div className="bg-gray-50/70 dark:bg-slate-800/40 p-2.5 rounded-lg border border-gray-100 dark:border-slate-800 space-y-2 animate-in fade-in">
              <div className="grid grid-cols-2 gap-3">
                {/* Font Size (8-16px) */}
                <div>
                  <div className="flex justify-between text-[10px] text-gray-500 font-semibold mb-0.5">
                    <span>{isAr ? 'حجم الخط:' : 'Font Size:'}</span>
                    <span className="font-mono">{draft.labelFontSize || 10}px</span>
                  </div>
                  <input
                    type="range"
                    min={8}
                    max={16}
                    step={1}
                    value={draft.labelFontSize || 10}
                    onChange={(e) => updateDraft({ labelFontSize: parseInt(e.target.value, 10) })}
                    className="w-full accent-indigo-600 h-1 cursor-pointer"
                  />
                </div>

                {/* Spacing (40-160px) */}
                <div>
                  <div className="flex justify-between text-[10px] text-gray-500 font-semibold mb-0.5">
                    <span>{isAr ? 'التباعد الأدنى:' : 'Min Spacing:'}</span>
                    <span className="font-mono">{draft.labelMinSpacingPx || 70}px</span>
                  </div>
                  <input
                    type="range"
                    min={40}
                    max={160}
                    step={10}
                    value={draft.labelMinSpacingPx || 70}
                    onChange={(e) => updateDraft({ labelMinSpacingPx: parseInt(e.target.value, 10) })}
                    className="w-full accent-indigo-600 h-1 cursor-pointer"
                  />
                </div>
              </div>

              {/* Coord Format (DD | DMM | DMS) */}
              <div className="space-y-1 pt-1">
                <span className="block text-[10px] text-gray-500 font-semibold">
                  {isAr ? 'صيغة الإحداثيات:' : 'Coordinate Format:'}
                </span>
                <Segmented<CoordFormat>
                  value={draft.coordFormat || 'DMM'}
                  onChange={(coordFormat) => updateDraft({ coordFormat })}
                  options={[
                    { value: 'DMM', label: 'DMM (النموذج)' },
                    { value: 'DD', label: 'DD' },
                    { value: 'DMS', label: 'DMS' }
                  ]}
                />
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-gray-100 dark:border-slate-800" />

        {/* 6. Color Path by Periods Master Switch & Editor */}
        <div className="space-y-2">
          <Switch
            checked={draft.periodsEnabled}
            onChange={(periodsEnabled) => {
              if (periodsEnabled && (!draft.periods || draft.periods.length === 0)) {
                const currentYear = new Date().getFullYear();
                let fromDate = dataDateRange?.from || `${currentYear}-01-01`;
                let toDate = dataDateRange?.to || `${currentYear}-10-22`;
                let midDate = `${currentYear}-04-30`;
                if (dataDateRange?.from && dataDateRange?.to) {
                  const s = new Date(`${fromDate}T00:00:00Z`).getTime();
                  const e = new Date(`${toDate}T00:00:00Z`).getTime();
                  if (e > s) {
                    midDate = new Date(s + (e - s) / 2).toISOString().slice(0, 10);
                  }
                }
                const defaultPeriods = [
                  { id: `p1-${Date.now()}`, from: fromDate, to: midDate, color: '#2563eb', label: `${fromDate} → ${midDate}` },
                  { id: `p2-${Date.now() + 1}`, from: midDate, to: toDate, color: '#f97316', label: `${midDate} → ${toDate}` }
                ];
                updateDraft({ periodsEnabled, periods: defaultPeriods });
              } else {
                updateDraft({ periodsEnabled });
              }
            }}
            label={isAr ? 'تلوين المسار حسب الفترات' : 'Color Path by Periods'}
            description={isAr ? 'تقسيم المسار إلى فترات زمنية ملونة' : 'Split track into seasonal segments'}
            size="sm"
          />

          {draft.periodsEnabled && (
            <PeriodsEditor
              periods={draft.periods}
              onChange={(periods) => updateDraft({ periods })}
              language={language}
              dataDateRange={dataDateRange}
            />
          )}
        </div>
      </div>
    </Popover>
  );
};
