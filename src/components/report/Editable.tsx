import React, { useRef, useEffect } from 'react';

export interface EditableProps {
  value: string;
  onCommit: (v: string) => void;
  as?: React.ElementType;
  multiline?: boolean;
  placeholder?: string;
  className?: string;
  style?: React.CSSProperties;
  title?: string;
}

export function Editable({
  value,
  onCommit,
  as: Component = 'span',
  multiline = false,
  placeholder = '',
  className = '',
  style,
  title
}: EditableProps) {
  const ref = useRef<HTMLElement>(null);

  // Sync external value changes into the DOM if not currently focused
  useEffect(() => {
    if (ref.current && document.activeElement !== ref.current) {
      ref.current.innerText = value ?? '';
    }
  }, [value]);

  return (
    <Component
      ref={ref as any}
      className={`hb-editable outline-none rounded transition-colors cursor-text hover:bg-indigo-500/10 focus:bg-indigo-500/15 focus:ring-1 focus:ring-indigo-500 ${className}`}
      style={style}
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      data-placeholder={placeholder}
      title={title || 'انقر للتحرير مباشرة (Click to edit)'}
      onKeyDown={(e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !multiline) {
          e.preventDefault();
          (e.target as HTMLElement).blur();
        }
        if (e.key === 'Escape') {
          (e.target as HTMLElement).innerText = value ?? '';
          (e.target as HTMLElement).blur();
        }
      }}
      onPaste={(e: React.ClipboardEvent) => {
        e.preventDefault();
        const text = e.clipboardData.getData('text/plain');
        document.execCommand('insertText', false, text);
      }}
      onBlur={(e: React.FocusEvent) => {
        const v = (e.target as HTMLElement).innerText.trim();
        if (v !== value) {
          onCommit(v);
        }
      }}
    >
      {value}
    </Component>
  );
}
