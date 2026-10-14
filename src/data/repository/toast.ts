import { create } from 'zustand';

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info' | 'saving';
  title?: string;
  message: string;
  code?: string;
  duration?: number;
}

interface ToastState {
  toasts: ToastMessage[];
  showToast: (toast: Omit<ToastMessage, 'id'>) => string;
  removeToast: (id: string) => void;
  updateToast: (id: string, updates: Partial<ToastMessage>) => void;
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  showToast: (toast) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    const newToast: ToastMessage = { ...toast, id };
    set((state) => ({ toasts: [...state.toasts, newToast] }));

    const duration = toast.duration ?? (toast.type === 'error' ? 6000 : 3500);
    if (duration > 0 && toast.type !== 'saving') {
      setTimeout(() => {
        set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
      }, duration);
    }
    return id;
  },
  removeToast: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
  updateToast: (id, updates) =>
    set((state) => ({
      toasts: state.toasts.map((t) => (t.id === id ? { ...t, ...updates } : t)),
    })),
}));

export const notifyError = (error: any, fallbackMessage = 'An unexpected error occurred') => {
  const code = error?.code || (error?.name !== 'Error' ? error?.name : undefined);
  const message = error?.message || String(error) || fallbackMessage;
  useToastStore.getState().showToast({
    type: 'error',
    title: code ? `Firebase Error [${code}]` : 'Error',
    message,
    code,
  });
};

export const notifySuccess = (message: string, title = 'Success') => {
  useToastStore.getState().showToast({
    type: 'success',
    title,
    message,
  });
};

export const notifySaving = (message = 'Saving changes to Firebase...') => {
  return useToastStore.getState().showToast({
    type: 'saving',
    title: 'Saving…',
    message,
    duration: 0, // Persistent until dismissed or updated
  });
};
