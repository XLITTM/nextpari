import { AlertTriangle, ChevronRight } from 'lucide-react';

interface RestrictionModalProps {
  open: boolean;
  message: string;
  buttonText: string;
  onAction: () => void;
  onClose: () => void;
}

export function RestrictionModal({ open, message, buttonText, onAction, onClose }: RestrictionModalProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[120] bg-black flex items-end sm:items-center justify-center animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-white dark:bg-gray-800 rounded-t-3xl sm:rounded-3xl p-6 animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col items-center text-center gap-4">
          <div className="w-16 h-16 rounded-full bg-amber-100 dark:bg-amber-500/20 flex items-center justify-center">
            <AlertTriangle className="w-8 h-8 text-amber-500" />
          </div>
          <p className="text-base font-bold text-gray-900 dark:text-white leading-snug">
            {message}
          </p>
          <button
            onClick={onAction}
            className="w-full bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-bold py-3.5 rounded-xl transition-all active:scale-[0.98] flex items-center justify-center gap-2"
          >
            {buttonText}
            <ChevronRight className="w-5 h-5" />
          </button>
          <button
            onClick={onClose}
            className="w-full text-gray-500 dark:text-gray-300 font-semibold py-2 text-sm"
          >
            Позже
          </button>
        </div>
      </div>
    </div>
  );
}
