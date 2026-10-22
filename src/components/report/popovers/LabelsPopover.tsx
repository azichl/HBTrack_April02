import React, { useState } from 'react';
import { Popover } from '../../ui/Popover';
import { MapLabel } from '../../../types/report';
import { Plus, Trash2, ArrowLeft, Edit2, Tag } from 'lucide-react';

export interface LabelsPopoverProps {
  anchorRef: React.RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;
  labels: MapLabel[];
  onChange: (labels: MapLabel[]) => void;
  language?: 'ar' | 'en';
}

export const LabelsPopover: React.FC<LabelsPopoverProps> = ({
  anchorRef,
  open,
  onClose,
  labels,
  onChange,
  language = 'ar'
}) => {
  const isAr = language === 'ar';
  const [editingLabelId, setEditingLabelId] = useState<string | null>(null);

  // Form State
  const [formText, setFormText] = useState<string>('');
  const [formShape, setFormShape] = useState<MapLabel['shape']>('pill');
  const [formBg, setFormBg] = useState<string>('#ffffff');
  const [formFg, setFormFg] = useState<string>('#1f2937');
  const [formBorder, setFormBorder] = useState<string>('#dc2626');
  const [formFontSize, setFormFontSize] = useState<number>(12);

  const startEdit = (label: MapLabel) => {
    setEditingLabelId(label.id);
    setFormText(label.text);
    setFormShape(label.shape);
    setFormBg(label.bg);
    setFormFg(label.fg);
    setFormBorder(label.border);
    setFormFontSize(label.fontSize);
  };

  const cancelEdit = () => {
    setEditingLabelId(null);
    setFormText('');
    setFormShape('pill');
    setFormBg('#ffffff');
    setFormFg('#1f2937');
    setFormBorder('#dc2626');
    setFormFontSize(12);
  };

  const handleSave = () => {
    if (!formText.trim()) return;

    if (editingLabelId) {
      onChange(
        labels.map((l) =>
          l.id === editingLabelId
            ? {
                ...l,
                text: formText.trim(),
                shape: formShape,
                bg: formBg,
                fg: formFg,
                border: formBorder,
                fontSize: formFontSize
              }
            : l
        )
      );
    } else {
      const newLabel: MapLabel = {
        id: `label-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        text: formText.trim(),
        shape: formShape,
        bg: formBg,
        fg: formFg,
        border: formBorder,
        fontSize: formFontSize,
        x: 50,
        y: 50
      };
      onChange([...labels, newLabel]);
    }

    cancelEdit();
  };

  const handleDelete = (id: string) => {
    onChange(labels.filter((l) => l.id !== id));
    if (editingLabelId === id) cancelEdit();
  };

  return (
    <Popover
      anchorRef={anchorRef}
      open={open}
      onClose={onClose}
      title={isAr ? 'تسميات وعلامات الخريطة' : 'Map Labels & Shapes'}
      width={380}
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
      {editingLabelId ? (
        /* Edit / Sub-view form */
        <div className="space-y-3">
          <div className="flex items-center justify-between pb-1 border-b border-gray-100 dark:border-slate-800">
            <button
              type="button"
              onClick={cancelEdit}
              className="flex items-center gap-1 text-[11px] font-bold text-gray-500 hover:text-gray-800 dark:hover:text-gray-200"
            >
              <ArrowLeft size={13} className="rtl:rotate-180" />
              <span>{isAr ? 'العودة للقائمة' : 'Back to List'}</span>
            </button>
            <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400">
              {isAr ? 'تعديل التسمية' : 'Edit Label'}
            </span>
          </div>

          <div>
            <label className="block text-[10.5px] font-bold text-gray-600 dark:text-gray-400 mb-1">
              {isAr ? 'نص التسمية:' : 'Label Text:'}
            </label>
            <input
              type="text"
              value={formText}
              onChange={(e) => setFormText(e.target.value)}
              className="w-full px-2.5 py-1.5 text-xs bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[10.5px] font-bold text-gray-600 dark:text-gray-400 mb-1">
                {isAr ? 'الشكل:' : 'Shape:'}
              </label>
              <select
                value={formShape}
                onChange={(e) => setFormShape(e.target.value as any)}
                className="w-full px-2 py-1.5 text-xs bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg"
              >
                <option value="pill">{isAr ? 'كبسولة (Pill)' : 'Pill'}</option>
                <option value="rect">{isAr ? 'مستطيل (Rect)' : 'Rect'}</option>
                <option value="circle">{isAr ? 'دائرة (Circle)' : 'Circle'}</option>
                <option value="arrow">{isAr ? 'سهم (Arrow)' : 'Arrow'}</option>
                <option value="flag">{isAr ? 'علم (Flag)' : 'Flag'}</option>
              </select>
            </div>

            <div>
              <label className="block text-[10.5px] font-bold text-gray-600 dark:text-gray-400 mb-1">
                {isAr ? 'حجم الخط:' : 'Font Size:'} {formFontSize}px
              </label>
              <input
                type="range"
                min={10}
                max={24}
                value={formFontSize}
                onChange={(e) => setFormFontSize(parseInt(e.target.value, 10))}
                className="w-full accent-indigo-600 mt-1 cursor-pointer"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block text-[10px] font-bold text-gray-500 mb-0.5">{isAr ? 'الخلفية:' : 'Bg:'}</label>
              <input
                type="color"
                value={formBg}
                onChange={(e) => setFormBg(e.target.value)}
                className="w-full h-7 rounded border border-gray-200 cursor-pointer"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-500 mb-0.5">{isAr ? 'لون النص:' : 'Text:'}</label>
              <input
                type="color"
                value={formFg}
                onChange={(e) => setFormFg(e.target.value)}
                className="w-full h-7 rounded border border-gray-200 cursor-pointer"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-500 mb-0.5">{isAr ? 'الإطار:' : 'Border:'}</label>
              <input
                type="color"
                value={formBorder}
                onChange={(e) => setFormBorder(e.target.value)}
                className="w-full h-7 rounded border border-gray-200 cursor-pointer"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={cancelEdit}
              className="px-3 py-1 text-xs text-gray-600 hover:bg-gray-100 rounded-lg"
            >
              {isAr ? 'إلغاء' : 'Cancel'}
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-3 py-1 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-xs"
            >
              {isAr ? 'حفظ التعديل' : 'Save'}
            </button>
          </div>
        </div>
      ) : (
        /* List View */
        <div className="space-y-3">
          {/* Quick Add Form */}
          <div className="p-2.5 rounded-lg border border-indigo-100 dark:border-slate-800 bg-indigo-50/40 dark:bg-slate-800/50 space-y-2">
            <span className="block text-[11px] font-bold text-indigo-900 dark:text-indigo-300">
              {isAr ? '+ إضافة علامة أو تسمية جديدة:' : '+ Add New Map Label:'}
            </span>
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                placeholder={isAr ? 'اكتب نص التسمية...' : 'Label text...'}
                value={formText}
                onChange={(e) => setFormText(e.target.value)}
                className="flex-1 px-2.5 py-1 text-xs bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg"
              />
              <button
                type="button"
                onClick={handleSave}
                disabled={!formText.trim()}
                className="px-3 py-1 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-lg flex items-center gap-1 shadow-2xs"
              >
                <Plus size={12} />
                <span>{isAr ? 'إضافة' : 'Add'}</span>
              </button>
            </div>
          </div>

          {/* Existing Labels List */}
          <div className="space-y-1.5 max-h-[220px] overflow-y-auto">
            {labels.length === 0 ? (
              <p className="text-xs text-gray-400 italic text-center py-4 bg-gray-50/50 dark:bg-slate-800/30 rounded-lg border border-dashed border-gray-200 dark:border-slate-700">
                {isAr ? 'لا توجد تسميات مضافة على الخريطة' : 'No labels added yet'}
              </p>
            ) : (
              labels.map((label) => (
                <div
                  key={label.id}
                  className="flex items-center justify-between p-2 rounded-lg border border-gray-100 dark:border-slate-800 bg-white dark:bg-slate-800/80 hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors shadow-2xs"
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1 cursor-pointer" onClick={() => startEdit(label)}>
                    <span
                      className="w-3.5 h-3.5 rounded-full border border-black/15 shrink-0"
                      style={{ backgroundColor: label.bg }}
                    />
                    <span className="text-xs font-bold text-gray-800 dark:text-gray-200 truncate">
                      {label.text}
                    </span>
                    <span className="text-[10px] text-gray-400 bg-gray-100 dark:bg-slate-700 px-1 rounded">
                      {label.shape}
                    </span>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => startEdit(label)}
                      className="p-1 text-gray-400 hover:text-indigo-600 rounded"
                      title={isAr ? 'تعديل' : 'Edit'}
                    >
                      <Edit2 size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(label.id)}
                      className="p-1 text-gray-400 hover:text-red-600 rounded"
                      title={isAr ? 'حذف' : 'Delete'}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </Popover>
  );
};
