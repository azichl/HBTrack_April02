import React, { useState } from 'react';
import { Tag, Sliders, Type, RotateCcw, ExternalLink } from 'lucide-react';
import { Switch } from '../ui/Switch';
import {
  LabelScaleState,
  DEFAULT_LABEL_SCALE,
  LABEL_SCALE_IDS,
  LABEL_SCALE_NAMES,
  MIN_LABEL_SCALE,
  MAX_LABEL_SCALE,
  setLabelMaster,
  setLabelItem
} from '../../features/report-track/labelScale';
import { LabelsConfigState, DEFAULT_LABELS_CONFIG, ReportLanguage } from '../../types/report';

interface Props {
  scale: LabelScaleState;
  onChangeScale: (next: LabelScaleState) => void;
  labelsConfig?: LabelsConfigState;
  onChangeLabelsConfig: (next: LabelsConfigState) => void;
  language?: ReportLanguage;
  onOpenLabelsManager?: () => void;
}

export const LabelsEditSection: React.FC<Props> = ({
  scale,
  onChangeScale,
  labelsConfig = DEFAULT_LABELS_CONFIG,
  onChangeLabelsConfig,
  language = 'ar',
  onOpenLabelsManager
}) => {
  const isAr = language === 'ar';
  const [activeTab, setActiveTab] = useState<'sizes' | 'content'>('sizes');

  const pct = (n: number) => `${Math.round(n * 100)} %`;

  const updateConfig = (patch: Partial<LabelsConfigState>) => {
    onChangeLabelsConfig({
      ...labelsConfig,
      ...patch
    });
  };

  return (
    <div className="space-y-3" dir={isAr ? 'rtl' : 'ltr'}>
      {/* SECTION HEADER */}
      <div className="flex items-center justify-between border-b border-gray-200 dark:border-slate-700 pb-2">
        <span className="font-bold text-gray-900 dark:text-gray-100 flex items-center gap-1.5 text-xs">
          <Tag size={13} className="text-amber-500" />
          <span>{isAr ? 'تعديل التسميات والأحجام (Labels Edit)' : 'Labels Edit & Sizes'}</span>
        </span>

        {/* Tab switch */}
        <div className="flex rounded-lg bg-gray-200 dark:bg-slate-700 p-0.5 text-[10.5px] font-bold">
          <button
            type="button"
            onClick={() => setActiveTab('sizes')}
            className={`px-2 py-0.5 rounded-md transition-colors ${
              activeTab === 'sizes'
                ? 'bg-white dark:bg-slate-900 text-gray-900 dark:text-gray-100 shadow-2xs'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900'
            }`}
          >
            <span className="flex items-center gap-1">
              <Sliders size={11} />
              <span>{isAr ? 'الأحجام' : 'Sizes'}</span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('content')}
            className={`px-2 py-0.5 rounded-md transition-colors ${
              activeTab === 'content'
                ? 'bg-white dark:bg-slate-900 text-gray-900 dark:text-gray-100 shadow-2xs'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900'
            }`}
          >
            <span className="flex items-center gap-1">
              <Type size={11} />
              <span>{isAr ? 'النصوص' : 'Content'}</span>
            </span>
          </button>
        </div>
      </div>

      {/* TAB 1: SIZES (SLIDERS) */}
      {activeTab === 'sizes' && (
        <div className="space-y-2">
          {/* Master slider */}
          <label className="block text-[11px] font-semibold text-gray-700 dark:text-gray-300">
            <div className="flex justify-between items-center mb-1">
              <span className="font-bold text-gray-900 dark:text-gray-100">
                {isAr ? 'جميع التسميات (All labels)' : 'All labels'}
              </span>
              <span className="font-mono font-bold text-amber-600 dark:text-amber-400">
                {pct(scale.master ?? 1)}
              </span>
            </div>
            <input
              type="range"
              min={MIN_LABEL_SCALE}
              max={MAX_LABEL_SCALE}
              step={0.05}
              value={scale.master ?? 1}
              onChange={e => onChangeScale(setLabelMaster(scale, Number(e.target.value)))}
              className="w-full accent-amber-500 cursor-pointer h-1.5 bg-gray-200 dark:bg-slate-700 rounded-lg"
            />
          </label>

          {/* Individual label sliders */}
          <div className="pt-1.5 border-t border-gray-100 dark:border-slate-800 space-y-2">
            {LABEL_SCALE_IDS.map(id => {
              const currentVal = scale.items?.[id] ?? 1;
              const nameObj = LABEL_SCALE_NAMES[id];
              const name = isAr ? nameObj.ar : nameObj.en;
              return (
                <label key={id} className="block text-[10.5px] text-gray-600 dark:text-gray-400">
                  <div className="flex justify-between items-center mb-0.5">
                    <span>{name}</span>
                    <span className="font-mono font-bold text-gray-800 dark:text-gray-200">
                      {pct(currentVal)}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={MIN_LABEL_SCALE}
                    max={MAX_LABEL_SCALE}
                    step={0.05}
                    value={currentVal}
                    onChange={e => onChangeScale(setLabelItem(scale, id, Number(e.target.value)))}
                    className="w-full accent-amber-500 cursor-pointer h-1.5 bg-gray-200 dark:bg-slate-700 rounded-lg"
                  />
                </label>
              );
            })}
          </div>

          <div className="pt-1 flex justify-start">
            <button
              type="button"
              onClick={() => onChangeScale(DEFAULT_LABEL_SCALE)}
              className="text-[10.5px] text-amber-700 dark:text-amber-400 hover:underline flex items-center gap-1 font-bold"
            >
              <RotateCcw size={10} />
              <span>{isAr ? 'إعادة ضبط أحجام التسميات' : 'Reset label sizes'}</span>
            </button>
          </div>
        </div>
      )}

      {/* TAB 2: CONTENT & VISIBILITY */}
      {activeTab === 'content' && (
        <div className="space-y-3">
          {/* Latest location label */}
          <div className="p-2 rounded-lg bg-white dark:bg-slate-900/60 border border-gray-200 dark:border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-gray-800 dark:text-gray-200 text-[11px]">
                {isAr ? 'تسمية آخر موقع (Latest)' : 'Latest Location Label'}
              </span>
              <Switch
                checked={labelsConfig.showLatestLabel ?? true}
                onChange={v => updateConfig({ showLatestLabel: v })}
              />
            </div>
            {labelsConfig.showLatestLabel !== false && (
              <div className="space-y-1.5 pt-1 border-t border-gray-100 dark:border-slate-800">
                <input
                  type="text"
                  value={labelsConfig.latestTitle || ''}
                  placeholder={isAr ? 'آخر موقع (Latest Location)' : 'Latest Location'}
                  onChange={e => updateConfig({ latestTitle: e.target.value })}
                  className="w-full px-2 py-1 text-[11px] bg-gray-50 dark:bg-slate-800 border border-gray-300 dark:border-slate-700 rounded-md outline-none"
                />
                <div className="flex items-center justify-between text-[10.5px] text-gray-500">
                  <span>{isAr ? 'الموقع:' : 'Position:'}</span>
                  <div className="flex gap-1">
                    {(['top', 'right', 'bottom', 'left'] as const).map(pos => (
                      <button
                        key={pos}
                        type="button"
                        onClick={() => updateConfig({ latestPosition: pos })}
                        className={`px-1.5 py-0.5 rounded capitalize font-bold text-[10px] ${
                          (labelsConfig.latestPosition || 'top') === pos
                            ? 'bg-amber-600 text-white'
                            : 'bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-gray-300'
                        }`}
                      >
                        {pos}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Release location label */}
          <div className="p-2 rounded-lg bg-white dark:bg-slate-900/60 border border-gray-200 dark:border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-gray-800 dark:text-gray-200 text-[11px]">
                {isAr ? 'تسمية موقع الإطلاق (Release)' : 'Release Location Label'}
              </span>
              <Switch
                checked={labelsConfig.showReleaseLabel ?? true}
                onChange={v => updateConfig({ showReleaseLabel: v })}
              />
            </div>
            {labelsConfig.showReleaseLabel !== false && (
              <div className="space-y-1.5 pt-1 border-t border-gray-100 dark:border-slate-800">
                <input
                  type="text"
                  value={labelsConfig.releaseTitle || ''}
                  placeholder={isAr ? 'موقع التركيب (Release)' : 'Release'}
                  onChange={e => updateConfig({ releaseTitle: e.target.value })}
                  className="w-full px-2 py-1 text-[11px] bg-gray-50 dark:bg-slate-800 border border-gray-300 dark:border-slate-700 rounded-md outline-none"
                />
                <div className="flex items-center justify-between text-[10.5px] text-gray-500">
                  <span>{isAr ? 'الموقع:' : 'Position:'}</span>
                  <div className="flex gap-1">
                    {(['right', 'top', 'bottom', 'left'] as const).map(pos => (
                      <button
                        key={pos}
                        type="button"
                        onClick={() => updateConfig({ releasePosition: pos })}
                        className={`px-1.5 py-0.5 rounded capitalize font-bold text-[10px] ${
                          (labelsConfig.releasePosition || 'right') === pos
                            ? 'bg-amber-600 text-white'
                            : 'bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-gray-300'
                        }`}
                      >
                        {pos}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Camp names label visibility */}
          <div className="flex items-center justify-between p-2 rounded-lg bg-white dark:bg-slate-900/60 border border-gray-200 dark:border-slate-800">
            <span className="font-medium text-gray-800 dark:text-gray-200 text-[11px]">
              {isAr ? 'إظهار أسماء المخيمات على الخريطة' : 'Show Camp Names on Map'}
            </span>
            <Switch
              checked={labelsConfig.showCampLabels ?? true}
              onChange={v => updateConfig({ showCampLabels: v })}
            />
          </div>

          {/* Distance pills label visibility */}
          <div className="flex items-center justify-between p-2 rounded-lg bg-white dark:bg-slate-900/60 border border-gray-200 dark:border-slate-800">
            <span className="font-medium text-gray-800 dark:text-gray-200 text-[11px]">
              {isAr ? 'إظهار أرقام المسافات (Distance Pills)' : 'Show Distance Pills'}
            </span>
            <Switch
              checked={labelsConfig.showDistanceLabels ?? true}
              onChange={v => updateConfig({ showDistanceLabels: v })}
            />
          </div>

          {/* Manage Custom Map Labels Button */}
          {onOpenLabelsManager && (
            <div className="pt-1">
              <button
                type="button"
                onClick={onOpenLabelsManager}
                className="w-full py-1.5 px-2.5 rounded-lg bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800 text-[11px] font-bold flex items-center justify-center gap-1.5 transition-colors"
              >
                <ExternalLink size={12} />
                <span>{isAr ? 'فتح مدير التسميات المخصصة بالكامل' : 'Open Full Labels Manager'}</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
