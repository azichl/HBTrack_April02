import React, { useState, useEffect } from 'react';
import { Popover } from '../ui/Popover';
import { Segmented } from '../ui/Segmented';
import { Switch } from '../ui/Switch';
import { PeriodsEditor } from './PeriodsEditor';
import {
  TrackPathSettings,
  DEFAULT_TRACK_SETTINGS,
  PointType,
  DashStyle,
  PointColorMode,
  CoordFormat
} from '../../types/track';
import { RotateCcw, RefreshCw } from 'lucide-react';

export interface TrackPathPopoverProps {
  anchorRef: React.RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;
  settings: TrackPathSettings;
  onApply: (settings: TrackPathSettings) => void;
  onPreview?: (settings: TrackPathSettings) => void;
  onReset?: () => void;
  onImportFromLive?: () => void;
  language?: 'ar' | 'en';
  dataDateRange?: { from: string; to: string };
  counts?: { gps: number; doppler: number; total: number; shown: number };
}

export const TrackPathPopover: React.FC<TrackPathPopoverProps> = ({
  anchorRef,
  open,
  onClose,
  settings,
  onApply,
  onPreview,
  onReset,
  onImportFromLive,
  language = 'ar',
  dataDateRange,
  counts
}) => {
  const isAr = language === 'ar';
  const [draft, setDraft] = useState<TrackPathSettings>(() => structuredClone(settings));
  const prevOpenRef = React.useRef(open);

  // Reset draft whenever popover opens (only on opening transition)
  useEffect(() => {
    if (open && !prevOpenRef.current) {
      const cloned = structuredClone(settings);
      setDraft(cloned);
      onPreview?.(cloned);
    }
    prevOpenRef.current = open;
  }, [open, settings, onPreview]);

  const updateDraft = (patch: Partial<TrackPathSettings>) => {
    setDraft((prev) => {
      const next = { ...prev, ...patch };
      // Auto-enable points if coordinate labels are turned on
      if (patch.showCoordinateLabels === true) {
        next.showPoints = true;
      }
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
    onReset?.();
  };

  const handleImportLive = () => {
    if (onImportFromLive) {
      onImportFromLive();
    } else {
      const res = structuredClone(DEFAULT_TRACK_SETTINGS);
      setDraft(res);
      onPreview?.(res);
    }
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
      title={
        <div className="flex items-center justify-between w-full pr-2">
          <span>{isAr ? 'تخصيص مسار الطيران' : 'Flight Path Customizer'}</span>
          <button
            type="button"
            onClick={handleImportLive}
            className="flex items-center gap-1 text-[10.5px] font-bold text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 hover:underline cursor-pointer"
            title={isAr ? 'استيراد خيارات التتبع الحالية من الخريطة المباشرة' : 'Import current history options from live map'}
          >
            <RefreshCw size={11} />
            <span>{isAr ? 'استيراد من المباشر' : 'Import live'}</span>
          </button>
        </div>
      }
      width={380}
      dirty={isDirty}
      footer={
        <div className="flex items-center justify-between w-full">
          <button
            type="button"
            onClick={handleResetToDefault}
            className="flex items-center gap-1 text-[11px] font-bold text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 transition-colors cursor-pointer"
          >
            <RotateCcw size={12} />
            <span>{isAr ? 'الافتراضي' : 'Reset'}</span>
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCancel}
              className="px-3 py-1.5 text-xs font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors cursor-pointer"
            >
              {isAr ? 'إلغاء' : 'Cancel'}
            </button>
            <button
              type="button"
              onClick={handleApply}
              disabled={!isValid}
              className="px-3.5 py-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:pointer-events-none rounded-lg shadow-xs transition-colors cursor-pointer"
            >
              {isAr ? 'تطبيق (Apply)' : 'Apply'}
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-3 max-h-[min(70vh,560px)] overflow-y-auto px-0.5">
        {/* 1. Point Type Selector with Live Counters */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <label className="block text-[11px] font-bold text-gray-700 dark:text-gray-300">
              {isAr ? 'نوع النقاط:' : 'Point Type:'}
            </label>
            {counts && (
              <span className="text-[10px] font-mono text-gray-500">
                {isAr ? 'المعروض:' : 'Shown:'} {counts.shown} / {counts.total}
              </span>
            )}
          </div>
          <Segmented<PointType>
            value={draft.type}
            onChange={(type) => updateDraft({ type })}
            options={[
              { value: 'ALL', label: isAr ? 'الكل (All)' : 'All' },
              { value: 'GPS', label: 'GPS' },
              { value: 'DOPPLER', label: 'Doppler' }
            ]}
          />
          {counts && (
            <div className="flex items-center justify-between text-[10px] font-mono text-gray-500 px-1 pt-0.5">
              <span>GPS: <strong className="text-emerald-600 dark:text-emerald-400">{counts.gps}</strong></span>
              <span>Doppler: <strong className="text-amber-600 dark:text-amber-400">{counts.doppler}</strong></span>
            </div>
          )}
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
                className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
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

        {/* 3. Line Style (Color, Width, Opacity, Dash Style) */}
        <div className="space-y-2">
          <label className="block text-[11px] font-bold text-gray-700 dark:text-gray-300">
            {isAr ? 'مظهر وسمك خط المسار:' : 'Line Style:'}
          </label>
          <div className="bg-gray-50/80 dark:bg-slate-800/50 p-2.5 rounded-lg border border-gray-200 dark:border-slate-700 space-y-2.5">
            {/* Color Swatch & Style */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <div
                  className="relative rounded-md border border-black/15 shadow-2xs overflow-hidden shrink-0 cursor-pointer"
                  style={{ width: 28, height: 26, backgroundColor: draft.color }}
                  title="لون خط المسار"
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

              {/* Dash Style */}
              <div className="w-44">
                <Segmented<DashStyle>
                  value={draft.dash || 'solid'}
                  onChange={(dash) => updateDraft({ dash })}
                  options={[
                    { value: 'solid', label: isAr ? 'متصل' : 'Solid' },
                    { value: 'dashed', label: isAr ? 'متقطع' : 'Dashed' },
                    { value: 'dotted', label: isAr ? 'منقط' : 'Dotted' }
                  ]}
                />
              </div>
            </div>

            {/* Width Slider (1..8 px) */}
            <div className="space-y-1">
              <div className="flex justify-between text-[10px] text-gray-500 font-semibold">
                <span>{isAr ? 'السمك:' : 'Width:'}</span>
                <span className="font-mono">{draft.width} px</span>
              </div>
              <input
                type="range"
                min={1}
                max={8}
                step={0.5}
                value={draft.width}
                onChange={(e) => updateDraft({ width: parseFloat(e.target.value) })}
                className="w-full accent-indigo-600 h-1.5 cursor-pointer"
              />
            </div>

            {/* Line Opacity Slider (20..100 %) */}
            <div className="space-y-1">
              <div className="flex justify-between text-[10px] text-gray-500 font-semibold">
                <span>{isAr ? 'شفافية الخط:' : 'Line Opacity:'}</span>
                <span className="font-mono">{Math.round((draft.opacity ?? 1) * 100)} %</span>
              </div>
              <input
                type="range"
                min={0.2}
                max={1.0}
                step={0.05}
                value={draft.opacity ?? 1}
                onChange={(e) => updateDraft({ opacity: parseFloat(e.target.value) })}
                className="w-full accent-indigo-600 h-1.5 cursor-pointer"
              />
            </div>
          </div>
        </div>

        <div className="border-t border-gray-100 dark:border-slate-800" />

        {/* 4. Points Markers Settings */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Switch
              checked={draft.showPoints}
              onChange={(showPoints) => updateDraft({ showPoints })}
              label={isAr ? 'عرض نقاط المواقع (Fix Dots)' : 'Show Point Markers'}
              size="sm"
            />
          </div>

          {draft.showPoints && (
            <div className="bg-gray-50/80 dark:bg-slate-800/50 p-2.5 rounded-lg border border-gray-200 dark:border-slate-700 space-y-2.5">
              {/* Point Size Slider (2..16 px) */}
              <div className="space-y-1">
                <div className="flex justify-between text-[10px] text-gray-500 font-semibold">
                  <span>{isAr ? 'قطر النقطة:' : 'Point Size:'}</span>
                  <span className="font-mono">{draft.pointSize ?? 6} px</span>
                </div>
                <input
                  type="range"
                  min={2}
                  max={16}
                  step={1}
                  value={draft.pointSize ?? 6}
                  onChange={(e) => updateDraft({ pointSize: parseInt(e.target.value, 10) })}
                  className="w-full accent-indigo-600 h-1.5 cursor-pointer"
                />
              </div>

              {/* Point Opacity Slider (20..100 %) */}
              <div className="space-y-1">
                <div className="flex justify-between text-[10px] text-gray-500 font-semibold">
                  <span>{isAr ? 'شفافية النقاط:' : 'Point Opacity:'}</span>
                  <span className="font-mono">{Math.round((draft.pointOpacity ?? 1) * 100)} %</span>
                </div>
                <input
                  type="range"
                  min={0.2}
                  max={1.0}
                  step={0.05}
                  value={draft.pointOpacity ?? 1}
                  onChange={(e) => updateDraft({ pointOpacity: parseFloat(e.target.value) })}
                  className="w-full accent-indigo-600 h-1.5 cursor-pointer"
                />
              </div>

              {/* Point Color Mode */}
              <div className="space-y-1">
                <span className="block text-[10px] text-gray-500 font-semibold">
                  {isAr ? 'نمط ألوان النقاط:' : 'Point Color Mode:'}
                </span>
                <Segmented<PointColorMode>
                  value={draft.pointColorMode || 'track'}
                  onChange={(pointColorMode) => updateDraft({ pointColorMode })}
                  options={[
                    { value: 'track', label: isAr ? 'كالمسار' : 'Track' },
                    { value: 'type', label: isAr ? 'GPS/Doppler' : 'By Type' },
                    { value: 'period', label: isAr ? 'بالفترة' : 'By Period' }
                  ]}
                />
              </div>

              {/* If color by type, show swatches for GPS & Doppler */}
              {draft.pointColorMode === 'type' && (
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div className="flex items-center gap-1.5">
                    <div
                      className="relative rounded-md border border-black/15 shadow-2xs overflow-hidden shrink-0 cursor-pointer"
                      style={{ width: 22, height: 22, backgroundColor: draft.gpsColor || '#16a34a' }}
                    >
                      <input
                        type="color"
                        value={draft.gpsColor || '#16a34a'}
                        onChange={(e) => updateDraft({ gpsColor: e.target.value })}
                        className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                      />
                    </div>
                    <span className="text-[10px] font-mono">GPS</span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <div
                      className="relative rounded-md border border-black/15 shadow-2xs overflow-hidden shrink-0 cursor-pointer"
                      style={{ width: 22, height: 22, backgroundColor: draft.dopplerColor || '#f59e0b' }}
                    >
                      <input
                        type="color"
                        value={draft.dopplerColor || '#f59e0b'}
                        onChange={(e) => updateDraft({ dopplerColor: e.target.value })}
                        className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                      />
                    </div>
                    <span className="text-[10px] font-mono">Doppler</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="border-t border-gray-100 dark:border-slate-800" />

        {/* 5. Coordinate Labels on Map */}
        <div className="space-y-2">
          <Switch
            checked={Boolean(draft.showCoordinateLabels)}
            onChange={(showCoordinateLabels) => updateDraft({ showCoordinateLabels })}
            label={isAr ? 'عرض الإحداثيات كنصوص على الخريطة' : 'Show Coordinate Labels'}
            description={isAr ? 'إظهار قيم الإحداثيات بجوار النقاط مع منع التداخل' : 'Print lat/lon text near fixes'}
            size="sm"
          />

          {draft.showCoordinateLabels && (
            <div className="bg-gray-50/80 dark:bg-slate-800/50 p-2.5 rounded-lg border border-gray-200 dark:border-slate-700 space-y-2.5">
              {/* Format DD / DMM / DMS */}
              <div className="space-y-1">
                <span className="block text-[10px] text-gray-500 font-semibold">
                  {isAr ? 'صيغة الإحداثيات:' : 'Coordinate Format:'}
                </span>
                <Segmented<CoordFormat>
                  value={draft.coordFormat || 'DMM'}
                  onChange={(coordFormat) => updateDraft({ coordFormat })}
                  options={[
                    { value: 'DMM', label: 'DMM' },
                    { value: 'DD', label: 'DD' },
                    { value: 'DMS', label: 'DMS' }
                  ]}
                />
              </div>

              {/* Font Size Slider (8..16 px) */}
              <div className="space-y-1">
                <div className="flex justify-between text-[10px] text-gray-500 font-semibold">
                  <span>{isAr ? 'حجم خط النص:' : 'Label Font Size:'}</span>
                  <span className="font-mono">{draft.labelFontSize ?? 10} px</span>
                </div>
                <input
                  type="range"
                  min={8}
                  max={16}
                  step={1}
                  value={draft.labelFontSize ?? 10}
                  onChange={(e) => updateDraft({ labelFontSize: parseInt(e.target.value, 10) })}
                  className="w-full accent-indigo-600 h-1.5 cursor-pointer"
                />
              </div>

              {/* Min Spacing Slider (40..160 px) */}
              <div className="space-y-1">
                <div className="flex justify-between text-[10px] text-gray-500 font-semibold">
                  <span>{isAr ? 'التباعد الأدنى (منع التداخل):' : 'Min Spacing (Thinning):'}</span>
                  <span className="font-mono">{draft.labelMinSpacingPx ?? 70} px</span>
                </div>
                <input
                  type="range"
                  min={40}
                  max={160}
                  step={5}
                  value={draft.labelMinSpacingPx ?? 70}
                  onChange={(e) => updateDraft({ labelMinSpacingPx: parseInt(e.target.value, 10) })}
                  className="w-full accent-indigo-600 h-1.5 cursor-pointer"
                />
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-gray-100 dark:border-slate-800" />

        {/* 6. Multi-Period Coloring Master Switch & Editor */}
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
