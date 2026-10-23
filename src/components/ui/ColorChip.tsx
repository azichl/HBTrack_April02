import React, { useRef } from 'react';
import { RotateCcw } from 'lucide-react';

export interface ColorChipProps {
  label?: string;
  value?: string;
  color?: string; // fallback alias for value
  onChange: (hex: string) => void;
  defaultValue?: string;
  onReset?: () => void;
  className?: string;
  size?: 'sm' | 'md';
}

export const ColorChip: React.FC<ColorChipProps> = ({
  label,
  value,
  color,
  onChange,
  defaultValue,
  onReset,
  className = '',
  size = 'md'
}) => {
  const effectiveValue = (value || color || '#000000').toLowerCase();
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div
      className={`inline-flex items-center gap-2 p-1.5 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800/80 shadow-2xs ${className}`}
    >
      <div className="flex items-center gap-1.5 min-w-0">
        {/* Color Swatch Trigger */}
        <button
          type="button"
          aria-label={label ? `${label}: ${effectiveValue}` : effectiveValue}
          onClick={() => inputRef.current?.click()}
          className="relative shrink-0 rounded-md border border-black/20 dark:border-white/20 shadow-xs cursor-pointer hover:scale-105 active:scale-95 transition-transform overflow-hidden"
          style={{
            width: size === 'sm' ? 22 : 26,
            height: size === 'sm' ? 22 : 26,
            backgroundColor: effectiveValue
          }}
          title="انقر لتغيير اللون"
        >
          <input
            ref={inputRef}
            type="color"
            value={effectiveValue}
            onChange={(e) => onChange(e.target.value)}
            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
            tabIndex={-1}
          />
        </button>

        {/* Label & Hex readout */}
        {label ? (
          <div className="min-w-0 leading-tight">
            <span className="block text-[11px] font-bold text-gray-800 dark:text-gray-200 truncate" title={label}>
              {label}
            </span>
            <span className="text-[10px] font-mono text-gray-400 dark:text-gray-400 uppercase">
              {effectiveValue}
            </span>
          </div>
        ) : (
          <span className="text-[10px] font-mono font-bold text-gray-500 uppercase">
            {effectiveValue}
          </span>
        )}
      </div>

      {/* Optional Reset */}
      {onReset && defaultValue && effectiveValue !== defaultValue.toLowerCase() && (
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
};
