import React from 'react';
import { MousePointer, Move, Ruler, Plus, Undo2, Redo2, Pin, Trash2, X } from 'lucide-react';

export type EditTool = 'select' | 'move' | 'measure';

interface EditToolsPaletteProps {
  activeTool: EditTool;
  onSelectTool: (tool: EditTool) => void;
  onAddLabel: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  // Measure info
  measurePointsCount?: number;
  totalMeasureKm?: string;
  onPinMeasure?: () => void;
  onClearMeasure?: () => void;
  language?: 'ar' | 'en' | 'ar+en';
}

export const EditToolsPalette: React.FC<EditToolsPaletteProps> = ({
  activeTool,
  onSelectTool,
  onAddLabel,
  onUndo,
  onRedo,
  canUndo = false,
  canRedo = false,
  measurePointsCount = 0,
  totalMeasureKm = '0.0',
  onPinMeasure,
  onClearMeasure,
  language = 'ar'
}) => {
  const isAr = language === 'ar';

  return (
    <div
      className="fixed top-20 left-1/2 -translate-x-1/2 z-[1500] flex items-center gap-1.5 bg-slate-900/95 backdrop-blur-md text-white px-3 py-1.5 rounded-full shadow-2xl border border-slate-700/80 text-xs select-none animate-in fade-in slide-in-from-top-2"
      style={{ direction: 'ltr' }}
    >
      {/* 1. Select Tool */}
      <button
        type="button"
        onClick={() => onSelectTool('select')}
        className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold transition-all ${
          activeTool === 'select'
            ? 'bg-amber-500 text-slate-950 shadow-sm'
            : 'text-gray-300 hover:text-white hover:bg-slate-800'
        }`}
        title={isAr ? 'أداة التحديد وتعديل النصوص (Select)' : 'Select & Format'}
      >
        <MousePointer size={13} />
        <span>{isAr ? 'تحديد' : 'Select'}</span>
      </button>

      {/* 2. Move Tool */}
      <button
        type="button"
        onClick={() => onSelectTool('move')}
        className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold transition-all ${
          activeTool === 'move'
            ? 'bg-amber-500 text-slate-950 shadow-sm'
            : 'text-gray-300 hover:text-white hover:bg-slate-800'
        }`}
        title={isAr ? 'أداة التحريك وسحب عناصر الخريطة (Move)' : 'Pan & Move'}
      >
        <Move size={13} />
        <span>{isAr ? 'تحريك' : 'Move'}</span>
      </button>

      {/* 3. Measure Tool */}
      <button
        type="button"
        onClick={() => onSelectTool('measure')}
        className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold transition-all ${
          activeTool === 'measure'
            ? 'bg-amber-500 text-slate-950 shadow-sm'
            : 'text-gray-300 hover:text-white hover:bg-slate-800'
        }`}
        title={isAr ? 'أداة قياس المسافات على الخريطة (Measure)' : 'Measure'}
      >
        <Ruler size={13} />
        <span>{isAr ? 'قياس' : 'Measure'}</span>
        {measurePointsCount > 0 && (
          <span className="font-mono text-[10px] bg-amber-600 text-white px-1.5 py-0.2 rounded-full font-bold ml-0.5">
            {totalMeasureKm} km
          </span>
        )}
      </button>

      {/* Measure Sub-actions when measuring */}
      {activeTool === 'measure' && measurePointsCount > 0 && (
        <div className="flex items-center gap-1 pl-1 border-l border-slate-700">
          <button
            type="button"
            onClick={onPinMeasure}
            className="p-1 hover:bg-emerald-800/80 text-emerald-400 rounded-full"
            title={isAr ? 'تثبيت القياس كعلامة مطبوعة على الخريطة' : 'Pin measurement'}
          >
            <Pin size={12} />
          </button>
          <button
            type="button"
            onClick={onClearMeasure}
            className="p-1 hover:bg-red-800/80 text-red-400 rounded-full"
            title={isAr ? 'مسح نقاط القياس' : 'Clear points'}
          >
            <Trash2 size={12} />
          </button>
        </div>
      )}

      <div className="h-4 w-px bg-slate-700 mx-0.5" />

      {/* 4. Drop Label */}
      <button
        type="button"
        onClick={onAddLabel}
        className="flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold text-gray-300 hover:text-white hover:bg-slate-800 transition-colors"
        title={isAr ? 'إضافة علامة نصية جديدة على الخريطة' : 'Add Map Label'}
      >
        <Plus size={13} className="text-emerald-400" />
        <span>{isAr ? 'علامة' : 'Label'}</span>
      </button>

      <div className="h-4 w-px bg-slate-700 mx-0.5" />

      {/* 5. Undo / Redo */}
      <button
        type="button"
        disabled={!canUndo}
        onClick={onUndo}
        className="p-1 text-gray-400 hover:text-white disabled:opacity-30 rounded-full hover:bg-slate-800"
        title="Undo (Ctrl+Z)"
      >
        <Undo2 size={13} />
      </button>
      <button
        type="button"
        disabled={!canRedo}
        onClick={onRedo}
        className="p-1 text-gray-400 hover:text-white disabled:opacity-30 rounded-full hover:bg-slate-800"
        title="Redo (Ctrl+Y)"
      >
        <Redo2 size={13} />
      </button>
    </div>
  );
};
