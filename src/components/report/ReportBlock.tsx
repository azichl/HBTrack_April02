import React, { useState, useRef } from 'react';
import { BlockId, ZoneId } from '../../types/report';
import { GripVertical, ArrowUp, ArrowDown, MoreVertical, EyeOff, RotateCcw, Sliders } from 'lucide-react';

interface ReportBlockProps {
  id: BlockId;
  title: string;
  zoneId: ZoneId;
  isEditMode?: boolean;
  scale?: number;
  onScaleChange?: (scale: number) => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onMoveToZone?: (targetZone: ZoneId) => void;
  onHide?: () => void;
  onDragStart?: (e: React.DragEvent, id: BlockId) => void;
  onDragOver?: (e: React.DragEvent, id: BlockId) => void;
  onDrop?: (e: React.DragEvent, id: BlockId) => void;
  children: React.ReactNode;
  className?: string;
}

export const ReportBlock: React.FC<ReportBlockProps> = ({
  id,
  title,
  zoneId,
  isEditMode = false,
  scale = 1.0,
  onScaleChange,
  onMoveUp,
  onMoveDown,
  onMoveToZone,
  onHide,
  onDragStart,
  onDragOver,
  onDrop,
  children,
  className = ''
}) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  if (!isEditMode) {
    return (
      <div
        id={`block-${id}`}
        className={`rpt-block relative transition-all ${className}`}
        style={{
          ['--blk-scale' as any]: scale,
          breakInside: 'avoid'
        }}
      >
        {children}
      </div>
    );
  }

  return (
    <div
      id={`block-${id}`}
      draggable={isEditMode}
      onDragStart={e => onDragStart?.(e, id)}
      onDragOver={e => {
        e.preventDefault();
        setIsDragOver(true);
        onDragOver?.(e, id);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={e => {
        setIsDragOver(false);
        onDrop?.(e, id);
      }}
      className={`rpt-block group relative transition-all rounded-lg ${
        isDragOver ? 'ring-2 ring-brand-500 bg-brand-50/20' : 'hover:ring-1 hover:ring-amber-400/80'
      } ${className}`}
      style={{
        ['--blk-scale' as any]: scale,
        breakInside: 'avoid'
      }}
    >
      {/* Edit Mode Handle Bar (visible on hover) */}
      <div className="no-print no-export absolute -top-3 left-3 z-[1100] opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 bg-slate-900/90 text-white px-2 py-0.5 rounded-md shadow-md text-[11px] select-none">
        <div className="cursor-grab active:cursor-grabbing flex items-center gap-1">
          <GripVertical size={12} className="text-gray-400" />
          <span className="font-bold text-gray-200">{title}</span>
        </div>

        <div className="h-3 w-px bg-slate-700 mx-1" />

        {/* Up / Down */}
        <button
          type="button"
          onClick={onMoveUp}
          className="p-0.5 hover:bg-slate-800 rounded text-gray-300 hover:text-white"
          title="Move Up"
        >
          <ArrowUp size={11} />
        </button>
        <button
          type="button"
          onClick={onMoveDown}
          className="p-0.5 hover:bg-slate-800 rounded text-gray-300 hover:text-white"
          title="Move Down"
        >
          <ArrowDown size={11} />
        </button>

        {/* More Options Menu */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="p-0.5 hover:bg-slate-800 rounded text-gray-300 hover:text-white"
          >
            <MoreVertical size={11} />
          </button>

          {isMenuOpen && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setIsMenuOpen(false)} />
              <div
                className="absolute left-0 mt-1.5 w-48 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl p-2 text-xs space-y-2 z-40"
                style={{ direction: 'rtl' }}
              >
                <div className="text-[10px] font-bold text-gray-400 px-1">
                  نقل القسم إلى:
                </div>
                <div className="grid grid-cols-2 gap-1 text-[11px]">
                  {(['left', 'right', 'full-top', 'full-bottom'] as ZoneId[]).map(z => (
                    <button
                      key={z}
                      type="button"
                      disabled={zoneId === z}
                      onClick={() => {
                        onMoveToZone?.(z);
                        setIsMenuOpen(false);
                      }}
                      className={`px-2 py-1 rounded text-right transition-colors ${
                        zoneId === z
                          ? 'bg-amber-600/30 text-amber-400 font-bold'
                          : 'hover:bg-slate-800 text-gray-300'
                      }`}
                    >
                      {z === 'left' ? 'العمود الأيمن' : z === 'right' ? 'العمود الأيسر' : z === 'full-top' ? 'العرض الكامل (أعلى)' : 'العرض الكامل (أسفل)'}
                    </button>
                  ))}
                </div>

                <div className="pt-1 border-t border-slate-700 space-y-1">
                  <div className="flex items-center justify-between text-[11px] text-gray-300">
                    <span className="flex items-center gap-1">
                      <Sliders size={11} className="text-amber-400" />
                      <span>حجم الخط:</span>
                    </span>
                    <span className="font-mono text-amber-400 font-bold">
                      {Math.round(scale * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0.7"
                    max="1.5"
                    step="0.05"
                    value={scale}
                    onChange={e => onScaleChange?.(parseFloat(e.target.value))}
                    className="w-full accent-amber-500 cursor-pointer h-1.5 bg-slate-800 rounded"
                  />
                </div>

                <div className="pt-1 border-t border-slate-700 flex justify-between">
                  <button
                    type="button"
                    onClick={() => {
                      onScaleChange?.(1.0);
                      setIsMenuOpen(false);
                    }}
                    className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-white"
                  >
                    <RotateCcw size={10} />
                    <span>إعادة الضبط</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onHide?.();
                      setIsMenuOpen(false);
                    }}
                    className="flex items-center gap-1 text-[10px] text-red-400 hover:text-red-300"
                  >
                    <EyeOff size={10} />
                    <span>إخفاء القسم</span>
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {children}
    </div>
  );
};
