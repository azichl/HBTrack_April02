import React from 'react';
import { Popover } from '../../ui/Popover';
import { ColorChip } from '../../ui/ColorChip';
import { DEFAULT_REPORT_COLORS } from '../../../types/report';
import { RotateCcw } from 'lucide-react';

export interface ReportColors {
  primary: string;
  green: string;
  lastLocation: string;
  releaseDots: string;
  stopoverDots: string;
  trackLine: string;
  releaseDistance: string;
  stopoverDistance: string;
}

export interface ColorsPopoverProps {
  anchorRef: React.RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;
  colors: ReportColors;
  onChange: (colors: ReportColors) => void;
  language?: 'ar' | 'en';
}

interface ColorDef {
  key: keyof ReportColors;
  ar: string;
  en: string;
}

const COLOR_DEFS: ColorDef[] = [
  { key: 'primary', ar: 'العنابي الأساسي', en: 'Primary Maroon' },
  { key: 'green', ar: 'الأخضر الأساسي', en: 'Accent Green' },
  { key: 'lastLocation', ar: 'دبوس آخر موقع', en: 'Latest Pin' },
  { key: 'releaseDots', ar: 'دبوس الإطلاق', en: 'Release Pin' },
  { key: 'stopoverDots', ar: 'دبوس المخيم', en: 'Camp Pin' },
  { key: 'trackLine', ar: 'خط المسار', en: 'Track Line' },
  { key: 'releaseDistance', ar: 'مسافة الإطلاق', en: 'Release Dist.' },
  { key: 'stopoverDistance', ar: 'مسافة المخيم', en: 'Camp Dist.' },
];

export const ColorsPopover: React.FC<ColorsPopoverProps> = ({
  anchorRef,
  open,
  onClose,
  colors,
  onChange,
  language = 'ar'
}) => {
  const isAr = language === 'ar';

  const handleUpdate = (key: keyof ReportColors, val: string) => {
    onChange({ ...colors, [key]: val });
  };

  const handleResetAll = () => {
    onChange(structuredClone(DEFAULT_REPORT_COLORS));
  };

  return (
    <Popover
      anchorRef={anchorRef}
      open={open}
      onClose={onClose}
      title={isAr ? 'ألوان عناصر التقرير والخريطة' : 'Report & Map Theme Colors'}
      width={360}
      footer={
        <div className="flex items-center justify-between w-full">
          <button
            type="button"
            onClick={handleResetAll}
            className="flex items-center gap-1 text-[11px] font-bold text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
          >
            <RotateCcw size={12} />
            <span>{isAr ? 'استعادة الافتراضي' : 'Reset All'}</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-xs transition-colors"
          >
            {isAr ? 'تم (Done)' : 'Done'}
          </button>
        </div>
      }
    >
      <div className="grid grid-cols-2 gap-2">
        {COLOR_DEFS.map((def) => (
          <ColorChip
            key={def.key}
            label={isAr ? def.ar : def.en}
            value={colors[def.key] || DEFAULT_REPORT_COLORS[def.key]}
            defaultValue={DEFAULT_REPORT_COLORS[def.key]}
            onChange={(val) => handleUpdate(def.key, val)}
            onReset={() => handleUpdate(def.key, DEFAULT_REPORT_COLORS[def.key])}
            size="md"
          />
        ))}
      </div>
    </Popover>
  );
};
