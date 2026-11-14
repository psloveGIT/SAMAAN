import React, { useEffect, useState } from 'react';
import { AlertTriangle, Trash2, X } from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';

interface ConfirmActionModalProps {
  open: boolean;
  title: string;
  itemLabel?: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => Promise<void> | void;
  onCancel: () => void;
}

export const ConfirmActionModal: React.FC<ConfirmActionModalProps> = ({
  open,
  title,
  itemLabel,
  message,
  confirmLabel,
  danger = true,
  onConfirm,
  onCancel,
}) => {
  const { t } = useApp();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setBusy(false);
  }, [open]);

  if (!open) return null;

  const handleConfirm = async () => {
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      onClick={() => !busy && onCancel()}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)] p-6 space-y-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                danger
                  ? 'bg-[var(--status-danger-bg)] text-[var(--status-danger)]'
                  : 'bg-[var(--status-warning-bg)] text-[var(--status-warning)]'
              }`}
            >
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold">{title}</h3>
              {itemLabel ? (
                <div className="text-xs text-[var(--text-muted)] mt-0.5 tabular-nums bidi-plaintext">
                  {itemLabel}
                </div>
              ) : null}
            </div>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="p-1.5 rounded-lg hover:bg-[var(--bg-subtle)] text-[var(--text-muted)]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs text-[var(--text-secondary)] leading-relaxed">{message}</p>

        <div className="pt-2 flex items-center justify-end gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="h-9 px-4 rounded-lg border border-[var(--border-subtle)] text-xs font-medium hover:bg-[var(--bg-subtle)]"
          >
            {t.controls.cancel}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={handleConfirm}
            className={`h-9 px-4 rounded-lg text-white text-xs font-semibold flex items-center gap-1.5 hover:opacity-95 disabled:opacity-50 ${
              danger ? 'bg-[var(--status-danger)]' : 'bg-[var(--accent-primary)]'
            }`}
          >
            {danger ? <Trash2 className="w-3.5 h-3.5" /> : null}
            <span>{confirmLabel || t.controls.delete}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
