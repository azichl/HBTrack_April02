import React from 'react';
import { Popover } from '../../ui/Popover';
import { Switch } from '../../ui/Switch';
import { SectionId } from '../../../types/report';

export interface SectionsPopoverProps {
  anchorRef: React.RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;
  sections: Record<SectionId, boolean>;
  onChange: (sections: Record<SectionId, boolean>) => void;
  language?: 'ar' | 'en';
}

const SECTION_DEFS: { id: SectionId; ar: string; en: string }[] = [
  { id: 'header', ar: 'رأس الصفحة والشعارات', en: 'Header & Logos' },
  { id: 'regionInfo', ar: 'معلومات المنطقة والجهاز', en: 'Region & Device' },
  { id: 'birdTable', ar: 'جدول بيانات الطائر', en: 'Bird Data Table' },
  { id: 'coordsTable', ar: 'جدول الإحداثيات', en: 'Coordinates Table' },
  { id: 'kpis', ar: 'بطاقات المؤشرات (KPIs)', en: 'KPI Cards' },
  { id: 'tempCurve', ar: 'منحنى درجات الحرارة', en: 'Temperature Curve' },
  { id: 'legend', ar: 'مفتاح الخريطة (Legend)', en: 'Map Legend' },
  { id: 'scaleBar', ar: 'مقياس الرسم (Scale Bar)', en: 'Scale Bar' },
  { id: 'northArrow', ar: 'سهم الشمال (North Arrow)', en: 'North Arrow' },
  { id: 'footer', ar: 'تذييل التقرير (Footer)', en: 'Report Footer' },
];

export const SectionsPopover: React.FC<SectionsPopoverProps> = ({
  anchorRef,
  open,
  onClose,
  sections,
  onChange,
  language = 'ar'
}) => {
  const isAr = language === 'ar';
  const visibleCount = Object.values(sections).filter(Boolean).length;

  const handleToggleAll = (val: boolean) => {
    const next = {} as Record<SectionId, boolean>;
    for (const def of SECTION_DEFS) {
      next[def.id] = val;
    }
    onChange(next);
  };

  const handleToggle = (id: SectionId, val: boolean) => {
    onChange({ ...sections, [id]: val });
  };

  return (
    <Popover
      anchorRef={anchorRef}
      open={open}
      onClose={onClose}
      title={isAr ? 'أقسام التقرير' : 'Report Sections'}
      width={320}
      footer={
        <div className="flex items-center justify-end w-full">
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
      {/* Visibility counter & mass toggles */}
      <div className="flex items-center justify-between pb-1 border-b border-gray-100 dark:border-slate-800 text-[11px]">
        <span className="font-bold text-indigo-700 dark:text-indigo-400">
          {visibleCount} / 10 {isAr ? 'ظاهرة' : 'Visible'}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => handleToggleAll(true)}
            className="text-gray-500 hover:text-indigo-600 font-semibold"
          >
            {isAr ? 'إظهار الكل' : 'Show all'}
          </button>
          <span className="text-gray-300">|</span>
          <button
            type="button"
            onClick={() => handleToggleAll(false)}
            className="text-gray-500 hover:text-red-600 font-semibold"
          >
            {isAr ? 'إخفاء الكل' : 'Hide all'}
          </button>
        </div>
      </div>

      {/* 10 Compact Switch Rows */}
      <div className="grid grid-cols-1 gap-1.5">
        {SECTION_DEFS.map((def) => (
          <div
            key={def.id}
            className="flex items-center justify-between px-2 py-1.5 rounded-lg border border-gray-100 dark:border-slate-800 bg-gray-50/60 dark:bg-slate-800/40 hover:bg-gray-100/60 transition-colors"
          >
            <span className="text-[11px] font-medium text-gray-800 dark:text-gray-200">
              {isAr ? def.ar : def.en}
            </span>
            <Switch
              checked={Boolean(sections[def.id])}
              onChange={(val) => handleToggle(def.id, val)}
              size="sm"
            />
          </div>
        ))}
      </div>
    </Popover>
  );
};
