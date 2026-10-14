import React from 'react';
import { useToastStore } from '../data/repository/toast';
import { CheckCircle2, AlertTriangle, Info, Loader2, X } from 'lucide-react';

export const ToastContainer: React.FC = () => {
  const { toasts, removeToast } = useToastStore();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-5 right-5 z-[9999] flex flex-col gap-2 max-w-md w-full pointer-events-none px-4 sm:px-0">
      {toasts.map((toast) => {
        let borderClass = 'border-brand-500 bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100';
        let icon = <Info className="text-blue-500 shrink-0" size={20} />;

        if (toast.type === 'success') {
          borderClass = 'border-emerald-500 bg-emerald-50/95 dark:bg-emerald-950/90 text-emerald-900 dark:text-emerald-100';
          icon = <CheckCircle2 className="text-emerald-600 dark:text-emerald-400 shrink-0" size={20} />;
        } else if (toast.type === 'error') {
          borderClass = 'border-red-500 bg-red-50/95 dark:bg-red-950/90 text-red-900 dark:text-red-100';
          icon = <AlertTriangle className="text-red-600 dark:text-red-400 shrink-0" size={20} />;
        } else if (toast.type === 'saving') {
          borderClass = 'border-blue-500 bg-blue-50/95 dark:bg-blue-950/90 text-blue-900 dark:text-blue-100';
          icon = <Loader2 className="text-blue-600 dark:text-blue-400 animate-spin shrink-0" size={20} />;
        }

        return (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-start gap-3 p-4 rounded-xl border shadow-xl backdrop-blur transition-all duration-300 animate-in fade-in slide-in-from-bottom-2 ${borderClass}`}
          >
            {icon}
            <div className="flex-1 min-w-0">
              {toast.title && <div className="text-xs font-bold tracking-wider uppercase mb-0.5">{toast.title}</div>}
              <div className="text-sm font-medium leading-snug break-words">{toast.message}</div>
              {toast.code && (
                <div className="text-[11px] font-mono opacity-75 mt-1">Code: {toast.code}</div>
              )}
            </div>
            <button
              onClick={() => removeToast(toast.id)}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors p-1"
              aria-label="Close"
            >
              <X size={16} />
            </button>
          </div>
        );
      })}
    </div>
  );
};
