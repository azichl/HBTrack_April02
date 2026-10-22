import React from 'react';

export interface SegmentedOption<T extends string> {
  value: T;
  label: React.ReactNode;
  ariaLabel?: string;
}

export interface SegmentedProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: SegmentedOption<T>[];
  name?: string;
  className?: string;
  size?: 'sm' | 'md';
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  name,
  className = '',
  size = 'sm'
}: SegmentedProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={name}
      className={`grid grid-flow-col auto-cols-fr gap-1 bg-gray-100 dark:bg-slate-800 p-1 rounded-lg border border-gray-200 dark:border-slate-700 select-none ${className}`}
    >
      {options.map((opt) => {
        const selected = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={opt.ariaLabel || (typeof opt.label === 'string' ? opt.label : undefined)}
            onClick={() => onChange(opt.value)}
            className={`flex items-center justify-center text-center font-bold transition-all rounded-md whitespace-nowrap overflow-hidden text-ellipsis ${
              size === 'sm' ? 'py-1 px-2 text-[11px]' : 'py-1.5 px-3 text-xs'
            } ${
              selected
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-white/50 dark:hover:bg-slate-700/50'
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
