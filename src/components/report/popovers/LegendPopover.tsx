import React, { useState, useRef } from 'react';
import { Eye, EyeOff, Plus, Trash2, RotateCcw, ChevronDown, ChevronUp, GripVertical, ArrowUp, ArrowDown } from 'lucide-react';
import { Popover } from '../../ui/Popover';
import { ColorChip } from '../../ui/ColorChip';
import { ReportLegendItem, ReportLegendLayout, LegendShape } from '../../../types/report';

export interface LegendPopoverProps {
  anchorRef: React.RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;
  items: ReportLegendItem[];
  onChangeItems: (items: ReportLegendItem[]) => void;
  layout?: ReportLegendLayout;
  onChangeLayout?: (layout: ReportLegendLayout) => void;
  defaultItems?: ReportLegendItem[];
  language?: 'ar' | 'en';
}

const SHAPE_OPTIONS: { value: LegendShape; labelAr: string; labelEn: string }[] = [
  { value: 'circle', labelAr: 'دائرة', labelEn: 'Circle' },
  { value: 'square', labelAr: 'مربع', labelEn: 'Square' },
  { value: 'line', labelAr: 'خط متصل', labelEn: 'Line' },
  { value: 'dashed-line', labelAr: 'خط متقطع', labelEn: 'Dashed line' },
  { value: 'triangle', labelAr: 'مثلث (خيمة)', labelEn: 'Triangle' },
  { value: 'pin', labelAr: 'دبوس', labelEn: 'Pin' },
];

export const LegendPopover: React.FC<LegendPopoverProps> = ({
  anchorRef,
  open,
  onClose,
  items,
  onChangeItems,
  layout = { position: 'below', columns: 'auto', fontSize: 'm', background: 'none' },
  onChangeLayout,
  defaultItems = [],
  language = 'ar'
}) => {
  const isAr = language === 'ar';
  const [showLayout, setShowLayout] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const newItemInputRef = useRef<HTMLInputElement>(null);

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDragIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    if (dragIndex === null || dragIndex === targetIndex) return;
    const reordered = [...items];
    const [moved] = reordered.splice(dragIndex, 1);
    reordered.splice(targetIndex, 0, moved);
    setDragIndex(targetIndex);
    onChangeItems(reordered);
  };

  const handleDragEnd = () => {
    setDragIndex(null);
  };

  const handleMoveUp = (index: number) => {
    if (index <= 0) return;
    const reordered = [...items];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(index - 1, 0, moved);
    onChangeItems(reordered);
  };

  const handleMoveDown = (index: number) => {
    if (index >= items.length - 1) return;
    const reordered = [...items];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(index + 1, 0, moved);
    onChangeItems(reordered);
  };

  const visibleCount = items.filter(i => i.visible).length;

  const handleToggle = (id: string) => {
    onChangeItems(items.map(i => i.id === id ? { ...i, visible: !i.visible } : i));
  };

  const handleUpdate = (id: string, patch: Partial<ReportLegendItem>) => {
    onChangeItems(items.map(i => i.id === id ? { ...i, ...patch } : i));
  };

  const handleDelete = (id: string) => {
    onChangeItems(items.filter(i => i.id !== id));
  };

  const handleResetRow = (item: ReportLegendItem) => {
    const original = defaultItems.find(d => d.id === item.id);
    if (original) {
      onChangeItems(items.map(i => i.id === item.id ? { ...original } : i));
    }
  };

  const handleAddItem = () => {
    const newId = `custom-legend-${Date.now()}`;
    const newItem: ReportLegendItem = {
      id: newId,
      label: isAr ? 'عنصر جديد' : 'New Legend Item',
      color: '#3b82f6',
      shape: 'circle',
      visible: true,
      custom: true
    };
    onChangeItems([...items, newItem]);
    setTimeout(() => {
      newItemInputRef.current?.focus();
    }, 50);
  };

  const handleShowAll = () => onChangeItems(items.map(i => ({ ...i, visible: true })));
  const handleHideAll = () => onChangeItems(items.map(i => ({ ...i, visible: false })));

  const handleResetDefaults = () => {
    if (defaultItems.length > 0) {
      onChangeItems(defaultItems);
    }
  };

  return (
    <Popover
      anchorRef={anchorRef}
      open={open}
      onClose={onClose}
      title={isAr ? 'مفتاح الخريطة (Legend)' : 'Map Legend'}
      width={440}
      footer={
        <div className="flex items-center justify-between w-full">
          <button
            type="button"
            onClick={handleResetDefaults}
            className="flex items-center gap-1 text-[11px] font-bold text-gray-500 hover:text-gray-800 dark:hover:text-gray-200"
          >
            <RotateCcw size={12} />
            <span>{isAr ? 'استعادة الافتراضي' : 'Reset defaults'}</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1 bg-brand-600 hover:bg-brand-700 text-white rounded-md text-xs font-bold"
          >
            {isAr ? 'تم' : 'Done'}
          </button>
        </div>
      }
    >
      <div className="space-y-3" style={{ maxHeight: 'min(70vh, 560px)' }}>
        {/* Subhead with Counters and Actions */}
        <div className="flex items-center justify-between text-xs pb-1 border-b border-gray-100 dark:border-slate-800">
          <span className="font-semibold text-gray-600 dark:text-gray-300">
            {isAr
              ? `العناصر الظاهرة: ${visibleCount} من ${items.length}`
              : `${visibleCount} / ${items.length} visible`}
          </span>
          <div className="flex items-center gap-2 text-[11px]">
            <button
              type="button"
              onClick={handleShowAll}
              className="text-brand-600 dark:text-brand-400 font-bold hover:underline"
            >
              {isAr ? 'إظهار الكل' : 'Show all'}
            </button>
            <span className="text-gray-300 dark:text-gray-600">|</span>
            <button
              type="button"
              onClick={handleHideAll}
              className="text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 font-bold hover:underline"
            >
              {isAr ? 'إخفاء الكل' : 'Hide all'}
            </button>
          </div>
        </div>

        {/* Add Item Button */}
        <button
          type="button"
          onClick={handleAddItem}
          className="flex items-center justify-center gap-1.5 w-full py-1.5 px-3 bg-gray-50 hover:bg-gray-100 dark:bg-slate-800 dark:hover:bg-slate-700/80 border border-dashed border-gray-300 dark:border-slate-700 rounded-lg text-xs font-bold text-brand-600 dark:text-brand-400 transition-colors"
        >
          <Plus size={13} />
          <span>{isAr ? '+ إضافة عنصر جديد للمفتاح' : '+ Add item'}</span>
        </button>

        {/* Items List (CSS Grid: [drag] [eye] [color] [shape] [text] [↑ ↓] [trash/reset]) */}
        <div className="space-y-1.5 overflow-y-auto pr-1" style={{ maxHeight: 'min(50vh, 360px)' }}>
          {items.map((item, idx) => {
            const original = defaultItems.find(d => d.id === item.id);
            const isOverridden = original && (
              original.label !== item.label ||
              original.color !== item.color ||
              original.shape !== item.shape ||
              original.visible !== item.visible
            );

            return (
              <div
                key={item.id}
                draggable
                onDragStart={(e) => handleDragStart(e, idx)}
                onDragOver={(e) => handleDragOver(e, idx)}
                onDragEnd={handleDragEnd}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '16px 26px 26px 88px minmax(0, 1fr) 48px 26px',
                  gap: '6px',
                  alignItems: 'center'
                }}
                className={`p-1 rounded-lg border transition-all ${
                  dragIndex === idx ? 'opacity-50 ring-2 ring-brand-400 bg-brand-50/50' : ''
                } ${
                  item.visible
                    ? 'bg-white dark:bg-slate-800/80 border-gray-200 dark:border-slate-700'
                    : 'bg-gray-100/60 dark:bg-slate-800/30 border-gray-200/50 dark:border-slate-800 opacity-60'
                }`}
              >
                {/* 0. Drag Handle */}
                <div
                  className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 flex items-center justify-center"
                  style={{ touchAction: 'none' }}
                  title={isAr ? 'اسحب لإعادة الترتيب' : 'Drag to reorder'}
                >
                  <GripVertical size={13} />
                </div>

                {/* 1. Eye Toggle */}
                <button
                  type="button"
                  onClick={() => handleToggle(item.id)}
                  className={`w-6 h-6 flex items-center justify-center rounded transition-colors ${
                    item.visible
                      ? 'text-brand-600 dark:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-950/40'
                      : 'text-gray-400 hover:text-gray-600'
                  }`}
                  title={item.visible ? (isAr ? 'إخفاء' : 'Hide') : (isAr ? 'إظهار' : 'Show')}
                >
                  {item.visible ? <Eye size={13} /> : <EyeOff size={13} />}
                </button>

                {/* 2. Color Swatch */}
                <div className="flex items-center justify-center">
                  <ColorChip
                    label=""
                    color={item.color}
                    onChange={(c) => handleUpdate(item.id, { color: c })}
                  />
                </div>

                {/* 3. Shape Select */}
                <select
                  value={item.shape}
                  onChange={(e) => handleUpdate(item.id, { shape: e.target.value as LegendShape })}
                  className="w-full text-[10.5px] px-1 py-1 rounded border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-800 dark:text-gray-200 outline-none cursor-pointer"
                >
                  {SHAPE_OPTIONS.map(s => (
                    <option key={s.value} value={s.value}>
                      {isAr ? s.labelAr : s.labelEn}
                    </option>
                  ))}
                </select>

                {/* 4. Text Input */}
                <input
                  ref={idx === items.length - 1 && item.custom ? newItemInputRef : undefined}
                  type="text"
                  value={item.label}
                  onChange={(e) => handleUpdate(item.id, { label: e.target.value })}
                  placeholder={isAr ? 'اسم العنصر...' : 'Item label...'}
                  className="w-full min-w-0 text-xs px-2 py-0.5 rounded border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-white outline-none focus:border-brand-500 font-medium"
                />

                {/* 5. ↑ / ↓ Reorder Buttons */}
                <div className="flex items-center justify-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => handleMoveUp(idx)}
                    disabled={idx === 0}
                    className="w-5 h-5 flex items-center justify-center text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-20 disabled:pointer-events-none rounded hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
                    title={isAr ? 'تحريك لأعلى' : 'Move up'}
                  >
                    <ArrowUp size={12} />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleMoveDown(idx)}
                    disabled={idx === items.length - 1}
                    className="w-5 h-5 flex items-center justify-center text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-20 disabled:pointer-events-none rounded hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
                    title={isAr ? 'تحريك لأسفل' : 'Move down'}
                  >
                    <ArrowDown size={12} />
                  </button>
                </div>

                {/* 6. Delete (Custom) or Reset (Built-in) */}
                <div className="flex items-center justify-center">
                  {item.custom ? (
                    <button
                      type="button"
                      onClick={() => handleDelete(item.id)}
                      className="w-5 h-5 flex items-center justify-center text-gray-400 hover:text-red-500 rounded transition-colors"
                      title={isAr ? 'حذف' : 'Delete'}
                    >
                      <Trash2 size={12} />
                    </button>
                  ) : isOverridden ? (
                    <button
                      type="button"
                      onClick={() => handleResetRow(item)}
                      className="w-5 h-5 flex items-center justify-center text-amber-500 hover:text-amber-700 rounded transition-colors"
                      title={isAr ? 'استعادة الإعداد الأصلي' : 'Reset to default'}
                    >
                      <RotateCcw size={11} />
                    </button>
                  ) : (
                    <span className="w-5" />
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Collapsible Layout Options */}
        {onChangeLayout && (
          <div className="pt-2 border-t border-gray-100 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setShowLayout(!showLayout)}
              className="flex items-center justify-between w-full text-xs font-bold text-gray-700 dark:text-gray-300 py-1"
            >
              <span>{isAr ? 'خيارات تخطيط وموضع المفتاح' : 'Layout options'}</span>
              {showLayout ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>

            {showLayout && (
              <div className="grid grid-cols-2 gap-2 pt-2 text-[11px] animate-in fade-in">
                <div>
                  <label className="block text-gray-500 mb-0.5">{isAr ? 'الموقع:' : 'Position:'}</label>
                  <select
                    value={layout.position}
                    onChange={(e) => onChangeLayout({ ...layout, position: e.target.value as any })}
                    className="w-full p-1 rounded border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                  >
                    <option value="below">{isAr ? 'أسفل الخريطة' : 'Below map'}</option>
                    <option value="overlay-bottom">{isAr ? 'عائم أسفل الخريطة' : 'Overlay bottom'}</option>
                    <option value="overlay-top">{isAr ? 'عائم أعلى الخريطة' : 'Overlay top'}</option>
                  </select>
                </div>

                <div>
                  <label className="block text-gray-500 mb-0.5">{isAr ? 'الأعمدة:' : 'Columns:'}</label>
                  <select
                    value={String(layout.columns)}
                    onChange={(e) => onChangeLayout({ ...layout, columns: e.target.value === 'auto' ? 'auto' : Number(e.target.value) as any })}
                    className="w-full p-1 rounded border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                  >
                    <option value="auto">{isAr ? 'تلقائي (سطور مرنة)' : 'Auto wrap'}</option>
                    <option value="1">1</option>
                    <option value="2">2</option>
                    <option value="3">3</option>
                  </select>
                </div>

                <div>
                  <label className="block text-gray-500 mb-0.5">{isAr ? 'حجم الخط:' : 'Font size:'}</label>
                  <select
                    value={layout.fontSize}
                    onChange={(e) => onChangeLayout({ ...layout, fontSize: e.target.value as any })}
                    className="w-full p-1 rounded border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                  >
                    <option value="s">{isAr ? 'صغير (S)' : 'Small'}</option>
                    <option value="m">{isAr ? 'متوسط (M)' : 'Medium'}</option>
                    <option value="l">{isAr ? 'كبير (L)' : 'Large'}</option>
                  </select>
                </div>

                <div>
                  <label className="block text-gray-500 mb-0.5">{isAr ? 'الخلفية:' : 'Background:'}</label>
                  <select
                    value={layout.background}
                    onChange={(e) => onChangeLayout({ ...layout, background: e.target.value as any })}
                    className="w-full p-1 rounded border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                  >
                    <option value="none">{isAr ? 'بدون خلفية' : 'None'}</option>
                    <option value="white-90">{isAr ? 'أبيض نصف شفاف' : 'White 90%'}</option>
                    <option value="dark">{isAr ? 'داكن' : 'Dark'}</option>
                  </select>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </Popover>
  );
};
