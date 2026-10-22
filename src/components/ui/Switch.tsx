import React from 'react';

export interface SwitchProps {
  id?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: React.ReactNode;
  description?: string;
  disabled?: boolean;
  className?: string;
  size?: 'sm' | 'md';
}

export function Switch({
  id,
  checked,
  onChange,
  label,
  description,
  disabled = false,
  className = '',
  size = 'sm'
}: SwitchProps) {
  const switchId = id || (typeof label === 'string' ? `switch-${label.replace(/\s+/g, '-').toLowerCase()}` : undefined);

  return (
    <label
      htmlFor={switchId}
      className={`inline-flex items-center justify-between gap-2.5 cursor-pointer select-none ${
        disabled ? 'opacity-50 pointer-events-none' : ''
      } ${className}`}
    >
      {(label || description) && (
        <div className="flex-1 leading-tight">
          {label && <span className="block text-xs font-semibold text-gray-800 dark:text-gray-200">{label}</span>}
          {description && <span className="block text-[10px] text-gray-400">{description}</span>}
        </div>
      )}
      <button
        id={switchId}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex shrink-0 transition-colors duration-200 ease-in-out border-2 border-transparent rounded-full cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500/40 ${
          size === 'sm' ? 'h-4 w-7' : 'h-5 w-9'
        } ${checked ? 'bg-indigo-600' : 'bg-gray-300 dark:bg-slate-700'}`}
      >
        <span
          className={`inline-block rounded-full bg-white shadow-xs transform transition duration-200 ease-in-out ${
            size === 'sm'
              ? `h-3 w-3 ${checked ? 'translate-x-3 rtl:-translate-x-3' : 'translate-x-0'}`
              : `h-4 w-4 ${checked ? 'translate-x-4 rtl:-translate-x-4' : 'translate-x-0'}`
          }`}
        />
      </button>
    </label>
  );
}
