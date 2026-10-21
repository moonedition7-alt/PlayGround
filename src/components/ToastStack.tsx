import { AlertTriangle, Check, Info, X } from 'lucide-react';
import { cn } from '../lib/utils';

export type ToastTone = 'success' | 'error' | 'info';

export interface ToastItem {
  id: string;
  message: string;
  tone: ToastTone;
}

export function ToastStack({
  toasts,
  onDismiss,
}: {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}) {
  return (
    <div className="pointer-events-none fixed inset-x-4 bottom-20 z-50 flex flex-col items-end gap-2 sm:inset-x-auto sm:bottom-6 sm:right-6">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={cn(
            'pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl border px-4 py-3 text-sm shadow-2xl backdrop-blur-xl animate-fade-up',
            toast.tone === 'success' && 'border-emerald-400/25 bg-emerald-500/[0.12] text-emerald-50',
            toast.tone === 'error' && 'border-rose-400/25 bg-rose-500/[0.12] text-rose-50',
            toast.tone === 'info' && 'border-white/10 bg-ink-850/95 text-white/85',
          )}
        >
          <span
            className={cn(
              'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full',
              toast.tone === 'success' && 'bg-emerald-400/20 text-emerald-300',
              toast.tone === 'error' && 'bg-rose-400/20 text-rose-300',
              toast.tone === 'info' && 'bg-white/10 text-white/70',
            )}
          >
            {toast.tone === 'success' ? (
              <Check className="h-3 w-3" strokeWidth={3} />
            ) : toast.tone === 'error' ? (
              <AlertTriangle className="h-3 w-3" />
            ) : (
              <Info className="h-3 w-3" />
            )}
          </span>
          <p className="flex-1 leading-snug">{toast.message}</p>
          <button
            type="button"
            onClick={() => onDismiss(toast.id)}
            className="rounded-md p-0.5 text-white/40 transition hover:text-white"
            aria-label="Dismiss notification"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
