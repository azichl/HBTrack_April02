import React, { useState, useRef, useEffect } from 'react';
import { TextStyle, ReportLanguage } from '../../types/report';
import { Bold, Italic, AlignLeft, AlignCenter, AlignRight, Type, Check, X, ChevronDown } from 'lucide-react';

interface ReportTextProps {
  id: string;
  value: string;
  defaultValue?: string;
  onChange?: (val: string) => void;
  style?: TextStyle;
  onChangeStyle?: (style: TextStyle) => void;
  isEditMode?: boolean;
  className?: string;
  as?: 'h1' | 'h2' | 'h3' | 'span' | 'div' | 'p';
  placeholder?: string;
  blockScale?: number;
  reportScale?: number;
  language?: ReportLanguage;
}

export const ReportText: React.FC<ReportTextProps> = ({
  id,
  value,
  defaultValue = '',
  onChange,
  style = {} as TextStyle,
  onChangeStyle,
  isEditMode = false,
  className = '',
  as: Component = 'span',
  placeholder,
  blockScale = 1.0,
  reportScale = 1.0,
  language = 'ar'
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [isSelected, setIsSelected] = useState(false);
  const [localVal, setLocalVal] = useState(value || defaultValue);
  const containerRef = useRef<HTMLElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLocalVal(value || defaultValue);
  }, [value, defaultValue]);

  // Handle outside click to deselect
  useEffect(() => {
    if (!isSelected) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current && !containerRef.current.contains(e.target as Node) &&
        toolbarRef.current && !toolbarRef.current.contains(e.target as Node)
      ) {
        setIsSelected(false);
        setIsEditing(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isSelected]);

  const displayVal = localVal || placeholder || '';
  const fontSizePt = style.fontSize || 10;
  const computedFontSize = `calc(${fontSizePt}pt * ${reportScale} * ${blockScale})`;

  const elementStyle: React.CSSProperties = {
    fontSize: computedFontSize,
    fontWeight: style.bold ? 'bold' : undefined,
    fontStyle: style.italic ? 'italic' : undefined,
    color: style.color || undefined,
    textAlign: style.align || undefined,
    fontFamily: style.fontFamily || undefined
  };

  const handleCommit = () => {
    setIsEditing(false);
    if (onChange && localVal !== value) {
      onChange(localVal);
    }
  };

  if (!isEditMode) {
    return (
      <Component
        id={`rpt-${id}`}
        className={`rpt-text ${className}`}
        style={elementStyle}
      >
        {displayVal}
      </Component>
    );
  }

  return (
    <span className="relative inline-block" ref={containerRef as any}>
      {/* Floating Text Formatting Toolbar when selected */}
      {isSelected && (
        <div
          ref={toolbarRef}
          className="absolute -top-11 left-1/2 -translate-x-1/2 z-[2500] flex items-center gap-1 bg-slate-900/95 backdrop-blur-md text-white px-2 py-1 rounded-xl shadow-2xl border border-slate-700 text-xs select-none animate-in fade-in zoom-in-95"
          style={{ direction: 'ltr' }}
          onClick={e => e.stopPropagation()}
        >
          {/* Font Size Steppers */}
          <button
            type="button"
            onClick={() => onChangeStyle?.({ ...style, fontSize: Math.max(8, fontSizePt - 1) })}
            className="p-1 hover:bg-slate-800 rounded font-bold text-[10px] text-gray-300 hover:text-white"
            title="Decrease Font Size"
          >
            A−
          </button>
          <span className="font-mono text-[11px] font-bold px-1 text-amber-400">
            {fontSizePt}pt
          </span>
          <button
            type="button"
            onClick={() => onChangeStyle?.({ ...style, fontSize: Math.min(48, fontSizePt + 1) })}
            className="p-1 hover:bg-slate-800 rounded font-bold text-[10px] text-gray-300 hover:text-white"
            title="Increase Font Size"
          >
            A+
          </button>

          <div className="h-3 w-px bg-slate-700 mx-0.5" />

          {/* Bold */}
          <button
            type="button"
            onClick={() => onChangeStyle?.({ ...style, bold: !style.bold })}
            className={`p-1 rounded ${style.bold ? 'bg-amber-600 text-white' : 'text-gray-300 hover:bg-slate-800'}`}
            title="Bold"
          >
            <Bold size={12} />
          </button>

          {/* Italic */}
          <button
            type="button"
            onClick={() => onChangeStyle?.({ ...style, italic: !style.italic })}
            className={`p-1 rounded ${style.italic ? 'bg-amber-600 text-white' : 'text-gray-300 hover:bg-slate-800'}`}
            title="Italic"
          >
            <Italic size={12} />
          </button>

          <div className="h-3 w-px bg-slate-700 mx-0.5" />

          {/* Alignment */}
          <button
            type="button"
            onClick={() => onChangeStyle?.({ ...style, align: 'start' })}
            className={`p-1 rounded ${style.align === 'start' ? 'bg-amber-600 text-white' : 'text-gray-300 hover:bg-slate-800'}`}
            title="Align Left / Start"
          >
            <AlignLeft size={12} />
          </button>
          <button
            type="button"
            onClick={() => onChangeStyle?.({ ...style, align: 'center' })}
            className={`p-1 rounded ${style.align === 'center' ? 'bg-amber-600 text-white' : 'text-gray-300 hover:bg-slate-800'}`}
            title="Align Center"
          >
            <AlignCenter size={12} />
          </button>
          <button
            type="button"
            onClick={() => onChangeStyle?.({ ...style, align: 'end' })}
            className={`p-1 rounded ${style.align === 'end' ? 'bg-amber-600 text-white' : 'text-gray-300 hover:bg-slate-800'}`}
            title="Align Right / End"
          >
            <AlignRight size={12} />
          </button>

          <div className="h-3 w-px bg-slate-700 mx-0.5" />

          {/* Color Picker */}
          <input
            type="color"
            value={style.color || '#1e293b'}
            onChange={e => onChangeStyle?.({ ...style, color: e.target.value })}
            className="w-4 h-4 rounded cursor-pointer border border-slate-600 bg-transparent p-0"
            title="Text Color"
          />

          {/* Reset formatting */}
          <button
            type="button"
            onClick={() => onChangeStyle?.({})}
            className="text-[9px] text-gray-400 hover:text-white px-1 py-0.5 rounded hover:bg-slate-800"
            title="Reset text styling"
          >
            Reset
          </button>
        </div>
      )}

      {isEditing ? (
        <span className="inline-flex items-center gap-1">
          <input
            type="text"
            autoFocus
            value={localVal}
            onChange={e => setLocalVal(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') handleCommit();
              if (e.key === 'Escape') {
                setLocalVal(value || defaultValue);
                setIsEditing(false);
              }
            }}
            onBlur={handleCommit}
            className="px-1.5 py-0.5 bg-amber-50 border border-amber-400 rounded outline-none font-bold text-gray-900 shadow-sm"
            style={elementStyle}
          />
          <button
            type="button"
            onMouseDown={handleCommit}
            className="p-0.5 bg-emerald-600 text-white rounded hover:bg-emerald-700"
          >
            <Check size={11} />
          </button>
        </span>
      ) : (
        <Component
          id={`rpt-${id}`}
          onClick={() => {
            setIsSelected(true);
          }}
          onDoubleClick={() => {
            setIsSelected(true);
            setIsEditing(true);
          }}
          className={`rpt-text cursor-pointer transition-all ${
            isSelected
              ? 'ring-2 ring-amber-400 bg-amber-50/70 rounded px-0.5'
              : 'hover:outline-dashed hover:outline-1 hover:outline-amber-400/80 rounded px-0.5'
          } ${className}`}
          style={elementStyle}
          title={isEditMode ? 'انقر للتحديد وتغيير الحجم والخط، أو انقر مرتين للتعديل السريع' : undefined}
        >
          {displayVal}
        </Component>
      )}
    </span>
  );
};
