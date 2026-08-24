import { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle } from 'lucide-react';

export type ToastKind = 'success' | 'error' | 'warning' | 'info';

interface ToastItem {
  id: number;
  message: string;
  kind: ToastKind;
}

interface ToastApi {
  success: (message: string) => void;
  error: (message: string) => void;
  warning: (message: string) => void;
  info: (message: string) => void;
}

interface ToastContextValue {
  showToast: (message: string, kind?: ToastKind) => void;
  toast: ToastApi;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let toastId = 0;

const TOAST_CLASS: Record<ToastKind, string> = {
  success: 'bg-emerald-600 shadow-emerald-900/30',
  error: 'bg-red-600 shadow-red-900/30',
  warning: 'bg-amber-500 shadow-amber-900/30',
  info: 'bg-slate-700 shadow-slate-900/30',
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const showToast = useCallback((message: string, kind: ToastKind = 'info') => {
    const id = ++toastId;
    setToasts((prev) => [...prev, { id, message, kind }]);
    const ttl = kind === 'error' || kind === 'warning' ? 3500 : 2500;
    setTimeout(() => {
      setToasts((prev) => prev.filter((item) => item.id !== id));
    }, ttl);
  }, []);

  const toast = useMemo<ToastApi>(
    () => ({
      success: (message) => showToast(message, 'success'),
      error: (message) => showToast(message, 'error'),
      warning: (message) => showToast(message, 'warning'),
      info: (message) => showToast(message, 'info'),
    }),
    [showToast],
  );

  return (
    <ToastContext.Provider value={{ showToast, toast }}>
      {children}
      <div className="fixed bottom-24 left-0 right-0 z-[200] flex flex-col items-center gap-2 pointer-events-none px-4">
        {toasts.map((item) => (
          <div
            key={item.id}
            className={`flex items-center gap-2 text-white text-sm font-semibold px-4 py-3 rounded-xl shadow-lg animate-slide-up max-w-sm ${TOAST_CLASS[item.kind]}`}
          >
            {item.kind === 'success' && <CheckCircle className="w-5 h-5 shrink-0" />}
            {item.kind === 'error' && <AlertCircle className="w-5 h-5 shrink-0" />}
            {(item.kind === 'warning' || item.kind === 'info') && <AlertTriangle className="w-5 h-5 shrink-0" />}
            <span>{item.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
