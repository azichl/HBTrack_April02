import React, { useRef } from 'react';
import { RotateCcw } from 'lucide-react';

export interface ColorChipProps {
  label: string;
  value: string; // #rrggbb
  onChange: (hex: string) => void;
  defaultValue?: string;
  onReset?: () => void;
  className?: string;
  size?: 'sm' | 'md';
}

export const ColorChip: React.FC<ColorChipProps> = ({
  label,
  value,
  onChange,
  defaultValue,
  onReset,
  className = '',
  size = 'md'
}) => {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleHexChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.trim();
    if (/^#[0-9a-fA-F]{6}$/.test(raw)) {
      onChange(raw.toLowerCase());
    }
  };

  return (
    <div
      className={`flex items-center justify-between gap-2 p-1.5 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800/80 shadow-2xs ${className}`}
    >
      <div className="flex items-center gap-2 min-w-0 flex-1">
        {/* Color Swatch Trigger */}
        <button
          type="button"
          aria-label={`${label}: ${value}`}
          onClick={() => inputRef.current?.click()}
          className="relative shrink-0 rounded-md border border-black/15 dark:border-white/20 shadow-xs cursor-pointer hover:scale-105 active:scale-95 transition-transform overflow-hidden"
          style={{
            width: size === 'sm' ? 24 : 28,
            height: size === 'sm' ? 24 : 28,
            backgroundColor: value
          }}
          title="انقر لتغيير اللون"
        >
          <input
            ref={inputRef}
            type="color"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
            tabIndex={-1}
          />
        </button>

        {/* Label & Hex readout */}
        <div className="min-w-0 flex-1 leading-tight">
          <span className="block text-[11px] font-bold text-gray-800 dark:text-gray-200 truncate" title={label}>
            {label}
          </span>
          <span className="text-[10px] font-mono text-gray-400 dark:text-gray-400 uppercase">
            {value}
          </span>
        </div>
      </div>

      {/* Optional Reset */}
      {onReset && defaultValue && value.toLowerCase() !== defaultValue.toLowerCase() && (
        <button
          type="button"
          onClick={onReset}
          className="p-1 text-gray-400 hover:text-amber-600 dark:hover:text-amber-400 transition-colors"
          title={`استعادة الافتراضي (${defaultValue})`}
        >
          <RotateCcw size={12} />
        </button>
      )}
    </div>
  );
}
