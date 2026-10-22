import React, { useEffect, useLayoutEffect, useRef, useState, ReactNode, useId } from 'react';
import { createPortal } from 'react-dom';

export interface PopoverProps {
  anchorRef: React.RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;
  title: string;
  width?: number; // default 360
  children: ReactNode;
  footer?: ReactNode;
  dirty?: boolean; // triggers discard confirm on outside click/esc
}

export function Popover({
  anchorRef,
  open,
  onClose,
  title,
  width = 360,
  children,
  footer,
  dirty
}: PopoverProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; insetInlineStart: number } | null>(null);
  const titleId = useId();

  const requestClose = () => {
    if (dirty && !window.confirm('Discard changes? / هل تريد تجاهل التغييرات غير المحفوظة؟')) return;
    onClose();
  };

  // Position under the anchor, flip up if no room, clamp to viewport, RTL-aware
  useLayoutEffect(() => {
    if (!open || !anchorRef.current) return;
    const place = () => {
      const a = anchorRef.current!.getBoundingClientRect();
      const p = panelRef.current?.getBoundingClientRect();
      const h = p?.height ?? 300;
      const isRtl = document.documentElement.dir === 'rtl' || document.body.dir === 'rtl';
      let x = isRtl ? a.right - width : a.left;
      x = Math.max(8, Math.min(x, window.innerWidth - width - 8));
      let y = a.bottom + 8;
      if (y + h > window.innerHeight - 8) {
        y = Math.max(8, a.top - h - 8);
      }
      setPos({ top: y, insetInlineStart: x });
    };

    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, anchorRef, width]);

  // Outside click + Esc + focus trapping + focus return
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;

    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || anchorRef.current?.contains(t)) return;
      requestClose();
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        requestClose();
      }
      if (e.key === 'Tab' && panelRef.current) {
        const focusable = panelRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey, true);

    const raf = requestAnimationFrame(() => {
      panelRef.current?.querySelector<HTMLElement>('input, button:not([aria-label="Close"])')?.focus();
    });

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey, true);
      prev?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, dirty]);

  if (!open) return null;

  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      className="hb-popover fixed z-[9999] flex flex-col bg-white dark:bg-slate-900 border border-black/10 dark:border-white/10 rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 text-gray-900 dark:text-gray-100"
      style={{
        top: pos?.top ?? 100,
        left: pos?.insetInlineStart ?? 16,
        width,
        maxWidth: 'calc(100vw - 16px)',
        maxHeight: 'min(82vh, 640px)',
      }}
    >
      <header className="hb-popover__head flex items-center justify-between px-3.5 py-2.5 border-b border-black/6 dark:border-white/10 bg-gray-50/80 dark:bg-slate-800/80">
        <h3 id={titleId} className="text-xs font-bold tracking-tight text-gray-800 dark:text-white">
          {title}
        </h3>
        <button
          type="button"
          aria-label="Close"
          onClick={requestClose}
          className="w-6 h-6 flex items-center justify-center rounded-md text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-black/5 dark:hover:bg-white/10 transition-colors text-xs font-bold"
        >
          ✕
        </button>
      </header>

      <div className="hb-popover__body p-3.5 overflow-y-auto space-y-3 text-xs">
        {children}
      </div>

      {footer && (
        <footer className="hb-popover__foot flex items-center justify-end gap-2 px-3 py-2 border-t border-black/6 dark:border-white/10 bg-gray-50 dark:bg-slate-800/60 shrink-0">
          {footer}
        </footer>
      )}
    </div>,
    document.body
  );
}
