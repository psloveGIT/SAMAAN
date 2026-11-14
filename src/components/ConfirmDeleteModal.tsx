import React, { useEffect, useState } from 'react';
import { AlertTriangle, Trash2, X } from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';

interface ConfirmDeleteModalProps {
  open: boolean;
  title: string;
  itemLabel: string;
  linkedDetailedCount?: number;
  onConfirm: (cascadeDetailed: boolean) => Promise<void> | void;
  onCancel: () => void;
}

export const ConfirmDeleteModal: React.FC<ConfirmDeleteModalProps> = ({
  open,
  title,
  itemLabel,
  linkedDetailedCount = 0,
  onConfirm,
  onCancel,
}) => {
  const { prefs, t } = useApp();
  const isFa = prefs.language === 'fa';
  const [cascadeDetailed, setCascadeDetailed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setCascadeDetailed(false);
      setBusy(false);
    }
  }, [open]);

  if (!open) return null;

  const handleConfirm = async () => {
    setBusy(true);
    try {
      await onConfirm(cascadeDetailed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)] p-6 space-y-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[var(--status-danger-bg)] text-[var(--status-danger)] flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold">{title}</h3>
              <div className="text-xs text-[var(--text-muted)] mt-0.5 tabular-nums bidi-plaintext">
                {itemLabel}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="p-1.5 rounded-lg hover:bg-[var(--bg-subtle)] text-[var(--text-muted)]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
          {isFa
            ? 'آیا از حذف این ردیف اطمینان دارید؟ ردیف حذف‌شده به «سطل بازیافت» منتقل می‌شود و در صورت نیاز می‌توانید آن را بازیابی کنید. شماره‌گذاری ردیف‌ها به‌صورت خودکار اصلاح خواهد شد.'
            : 'Are you sure you want to delete this record? It will be moved to the Recycle Bin where it can be restored later, and row numbers will re-index automatically.'}
        </p>

        {linkedDetailedCount > 0 && (
          <div className="p-3.5 rounded-xl border border-[var(--status-warning)] bg-[var(--status-warning-bg)] space-y-2">
            <div className="text-xs font-semibold text-[var(--status-warning)] tabular-nums">
              {isFa
                ? `${linkedDetailedCount.toLocaleString('fa-IR')} ردیف جزئیات (دیتیل) مرتبط با این پکینگ/نگله وجود دارد.`
                : `${linkedDetailedCount} linked Detailed item(s) exist for this Packing / Package.`}
            </div>
            <label className="flex items-start gap-2 text-xs font-medium text-[var(--text-primary)] cursor-pointer">
              <input
                type="checkbox"
                checked={cascadeDetailed}
                onChange={(e) => setCascadeDetailed(e.target.checked)}
                className="mt-0.5 rounded border-[var(--border-strong)]"
              />
              <span>
                {isFa
                  ? 'اقلام جزئیات (دیتیل) مرتبط با این ردیف نیز هم‌زمان حذف شوند (انتقال به سطل بازیافت)'
                  : 'Also delete linked Detailed items (move them to Recycle Bin as well)'}
              </span>
            </label>
          </div>
        )}

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
            className="h-9 px-4 rounded-lg bg-[var(--status-danger)] text-white text-xs font-semibold flex items-center gap-1.5 hover:opacity-95 disabled:opacity-50"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>{t.controls.delete}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
