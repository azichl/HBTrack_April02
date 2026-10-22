import React from 'react';
import { Popover } from '../../ui/Popover';

export interface ReportTexts {
  reportTitle: string;
  subtitle: string;
  orgNameEn: string;
  orgNameAr: string;
  footerText: string;
  notes: string;
  preparedBy: string;
  issueDate: string;
}

export interface TextPopoverProps {
  anchorRef: React.RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;
  texts: ReportTexts;
  onChange: (texts: ReportTexts) => void;
  language?: 'ar' | 'en';
}

export const TextPopover: React.FC<TextPopoverProps> = ({
  anchorRef,
  open,
  onClose,
  texts,
  onChange,
  language = 'ar'
}) => {
  const isAr = language === 'ar';

  const update = (patch: Partial<ReportTexts>) => {
    onChange({ ...texts, ...patch });
  };

  return (
    <Popover
      anchorRef={anchorRef}
      open={open}
      onClose={onClose}
      title={isAr ? 'نصوص وعناوين التقرير' : 'Report Texts & Headings'}
      width={360}
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
      <div className="space-y-2.5">
        <div>
          <label className="block text-[11px] font-bold text-gray-700 dark:text-gray-300 mb-1">
            {isAr ? 'عنوان التقرير الرئيسي:' : 'Report Title:'}
          </label>
          <input
            type="text"
            value={texts.reportTitle}
            onChange={(e) => update({ reportTitle: e.target.value })}
            className="w-full px-2.5 py-1 text-xs bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg"
          />
        </div>

        <div>
          <label className="block text-[11px] font-bold text-gray-700 dark:text-gray-300 mb-1">
            {isAr ? 'العنوان الفرعي:' : 'Subtitle:'}
          </label>
          <input
            type="text"
            value={texts.subtitle}
            onChange={(e) => update({ subtitle: e.target.value })}
            className="w-full px-2.5 py-1 text-xs bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg"
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-[11px] font-bold text-gray-700 dark:text-gray-300 mb-1">
              {isAr ? 'المؤسسة (بالعربية):' : 'Organization (AR):'}
            </label>
            <input
              type="text"
              value={texts.orgNameAr}
              onChange={(e) => update({ orgNameAr: e.target.value })}
              className="w-full px-2 py-1 text-xs bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-right"
              dir="rtl"
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-gray-700 dark:text-gray-300 mb-1">
              {isAr ? 'المؤسسة (بالإنجليزية):' : 'Organization (EN):'}
            </label>
            <input
              type="text"
              value={texts.orgNameEn}
              onChange={(e) => update({ orgNameEn: e.target.value })}
              className="w-full px-2 py-1 text-xs bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-left"
              dir="ltr"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-[11px] font-bold text-gray-700 dark:text-gray-300 mb-1">
              {isAr ? 'تاريخ الإصدار:' : 'Issue Date:'}
            </label>
            <input
              type="text"
              value={texts.issueDate}
              onChange={(e) => update({ issueDate: e.target.value })}
              className="w-full px-2 py-1 text-xs bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-gray-700 dark:text-gray-300 mb-1">
              {isAr ? 'إعداد بواسطة:' : 'Prepared By:'}
            </label>
            <input
              type="text"
              value={texts.preparedBy}
              onChange={(e) => update({ preparedBy: e.target.value })}
              className="w-full px-2 py-1 text-xs bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg"
            />
          </div>
        </div>

        <div>
          <label className="block text-[11px] font-bold text-gray-700 dark:text-gray-300 mb-1">
            {isAr ? 'نص تذييل الصفحة (Footer):' : 'Footer Text:'}
          </label>
          <input
            type="text"
            value={texts.footerText}
            onChange={(e) => update({ footerText: e.target.value })}
            className="w-full px-2.5 py-1 text-xs bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg"
          />
        </div>

        <div>
          <label className="block text-[11px] font-bold text-gray-700 dark:text-gray-300 mb-1">
            {isAr ? 'الملاحظات الإضافية:' : 'Notes / Remarks:'}
          </label>
          <textarea
            rows={2}
            value={texts.notes}
            onChange={(e) => update({ notes: e.target.value })}
            className="w-full px-2.5 py-1 text-xs bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg resize-none"
          />
        </div>
      </div>
    </Popover>
  );
};
