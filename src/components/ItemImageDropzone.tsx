import React, { useRef, useState } from 'react';
import { ImagePlus, Loader2, Trash2, UploadCloud } from 'lucide-react';
import {
  processEquipmentImageFile,
  validateEquipmentImageFile,
} from '../lib/imageUtils.ts';

interface ItemImageDropzoneProps {
  imageDataUrl?: string;
  thumbDataUrl?: string;
  loadingExisting?: boolean;
  isFa: boolean;
  compact?: boolean;
  onChange: (next: { itemImage: string; itemImageThumb: string }) => void;
  onError?: (msg: string) => void;
}

export const ItemImageDropzone: React.FC<ItemImageDropzoneProps> = ({
  imageDataUrl = '',
  thumbDataUrl = '',
  loadingExisting = false,
  isFa,
  compact = false,
  onChange,
  onError,
}) => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [localError, setLocalError] = useState('');
  const [metaText, setMetaText] = useState('');

  const previewSrc = imageDataUrl || thumbDataUrl || '';

  const handleFile = async (file: File | null | undefined) => {
    if (!file) return;
    setLocalError('');
    const err = validateEquipmentImageFile(file, isFa);
    if (err) {
      setLocalError(err);
      onError?.(err);
      return;
    }
    setProcessing(true);
    try {
      const processed = await processEquipmentImageFile(file);
      setMetaText(`${processed.width}×${processed.height} · ~${processed.sizeKb} KB`);
      onChange({
        itemImage: processed.itemImage,
        itemImageThumb: processed.itemImageThumb,
      });
    } catch {
      const msg = isFa
        ? 'خواندن یا پردازش فایل تصویر با خطا مواجه شد.'
        : 'Could not read or process the selected image file.';
      setLocalError(msg);
      onError?.(msg);
    } finally {
      setProcessing(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) {
      void handleFile(file);
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it.type.startsWith('image/')) {
        const file = it.getAsFile();
        if (file) {
          e.preventDefault();
          void handleFile(file);
          return;
        }
      }
    }
  };

  return (
    <div className="space-y-2" onPaste={handlePaste}>
      <div className="flex items-center justify-between gap-2">
        <label className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-1.5">
          <ImagePlus className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
          <span>{isFa ? 'تصویر تجهیز (اختیاری)' : 'Equipment Photo (Optional)'}</span>
        </label>
        {metaText && previewSrc && (
          <span dir="ltr" className="text-[10px] text-[var(--text-muted)] tabular-nums">
            {metaText}
          </span>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        data-testid="item-image-file-input"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
        }}
      />

      <div
        data-testid="item-image-dropzone"
        tabIndex={0}
        onDragEnter={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDragging(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!dragging) setDragging(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (e.currentTarget.contains(e.relatedTarget as Node)) return;
          setDragging(false);
        }}
        onDrop={handleDrop}
        className={`rounded-xl border-2 border-dashed transition-colors ${
          dragging
            ? 'border-[var(--accent-primary)] bg-[var(--accent-soft)]/70'
            : 'border-[var(--border-subtle)] bg-[var(--bg-canvas)] hover:border-[var(--accent-primary)]/50'
        } ${compact ? 'p-3' : 'p-4'}`}
      >
        {processing || loadingExisting ? (
          <div className="py-5 flex items-center justify-center gap-2 text-xs text-[var(--text-muted)]">
            <Loader2 className="w-4 h-4 animate-spin text-[var(--accent-primary)]" />
            <span>
              {loadingExisting
                ? isFa
                  ? 'در حال بارگذاری تصویر ثبت‌شده...'
                  : 'Loading existing photo...'
                : isFa
                  ? 'در حال بهینه‌سازی تصویر...'
                  : 'Optimizing image...'}
            </span>
          </div>
        ) : previewSrc ? (
          <div className="flex flex-wrap sm:flex-nowrap items-center gap-4">
            <div className="w-24 h-24 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] overflow-hidden shrink-0 flex items-center justify-center">
              <img
                src={previewSrc}
                alt={isFa ? 'پیش‌نمایش تصویر تجهیز' : 'Equipment preview'}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="flex-1 min-w-0 space-y-2">
              <div className="text-xs font-semibold text-[var(--text-primary)]">
                {isFa ? 'تصویر به این آیتم متصل شده است' : 'Photo attached to this item'}
              </div>
              <p className="text-[11px] text-[var(--text-muted)]">
                {isFa
                  ? 'برای جایگزینی، تصویر جدیدی را همینجا بکشید و رها کنید یا از دکمه زیر انتخاب نمایید.'
                  : 'Drag & drop a new image here to replace it, or use the buttons below.'}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  className="h-8 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)] text-xs font-medium flex items-center gap-1.5"
                >
                  <UploadCloud className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                  <span>{isFa ? 'تغییر تصویر' : 'Replace Photo'}</span>
                </button>
                <button
                  type="button"
                  data-testid="item-image-remove-btn"
                  onClick={() => {
                    setMetaText('');
                    setLocalError('');
                    onChange({ itemImage: '', itemImageThumb: '' });
                  }}
                  className="h-8 px-3 rounded-lg border border-[var(--status-danger)]/35 bg-[var(--status-danger-bg)] text-[var(--status-danger)] text-xs font-medium flex items-center gap-1.5 hover:opacity-90"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{isFa ? 'حذف تصویر' : 'Remove Photo'}</span>
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div
            onClick={() => inputRef.current?.click()}
            className="cursor-pointer py-3 flex flex-col sm:flex-row items-center justify-center gap-3 text-center sm:text-start"
          >
            <div className="w-11 h-11 rounded-xl bg-[var(--accent-soft)] text-[var(--accent-primary)] flex items-center justify-center shrink-0">
              <UploadCloud className="w-5 h-5" />
            </div>
            <div className="space-y-0.5">
              <div className="text-xs font-semibold text-[var(--text-primary)]">
                {dragging
                  ? isFa
                    ? 'تصویر را اینجا رها کنید...'
                    : 'Drop image here...'
                  : isFa
                    ? 'تصویر تجهیز را بکشید و اینجا رها کنید یا کلیک کنید'
                    : 'Drag & drop an equipment photo here, or click to browse'}
              </div>
              <div className="text-[11px] text-[var(--text-muted)]">
                {isFa
                  ? 'پشتیبانی از JPG، PNG، WebP (و چسباندن با Ctrl+V) — فشرده‌سازی خودکار جهت سرعت بالا'
                  : 'Supports JPG, PNG, WebP (or Ctrl+V paste) — automatically optimized'}
              </div>
            </div>
          </div>
        )}
      </div>

      {localError && (
        <div className="text-[11px] text-[var(--status-danger)] font-medium">{localError}</div>
      )}
    </div>
  );
};
