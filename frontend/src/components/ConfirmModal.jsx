import { AlertTriangle, X } from 'lucide-react';

export default function ConfirmModal({
  open,
  title = 'Confirm Action',
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = true,
  loading = false,
  onConfirm,
  onCancel,
}) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
    >
      <div className="w-full max-w-md rounded-2xl border border-kaafila-yellow/30 bg-kaafila-surface p-6 shadow-card">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className={`flex h-10 w-10 items-center justify-center rounded-xl border ${
                destructive
                  ? 'border-red-500/40 bg-red-500/10 text-red-400'
                  : 'border-kaafila-yellow/40 bg-kaafila-yellow/10 text-kaafila-yellow'
              }`}
            >
              <AlertTriangle className="h-5 w-5" />
            </div>
            <h3 id="confirm-modal-title" className="font-display text-xl font-bold text-kaafila-text">
              {title}
            </h3>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="rounded-lg p-1 text-kaafila-muted hover:text-kaafila-text"
            aria-label="Close confirmation modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="mt-4 text-sm leading-relaxed text-kaafila-muted">{message}</p>

        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="rounded-xl border border-white/15 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-kaafila-text hover:border-kaafila-yellow/40 transition disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={`rounded-xl px-4 py-2 text-xs font-bold uppercase tracking-wider transition disabled:opacity-50 ${
              destructive
                ? 'bg-red-600 text-white hover:bg-red-500'
                : 'bg-kaafila-yellow text-kaafila-bg hover:bg-kaafila-yellowHover'
            }`}
          >
            {loading ? 'Processing...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

