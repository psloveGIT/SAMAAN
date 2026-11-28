import React, { useEffect, useRef, useState } from 'react';
import {
  Download,
  ImageOff,
  Loader2,
  Trash2,
  UploadCloud,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { apiRequest, ApiError } from '../lib/api.ts';
import { useAuthenticatedMediaUrl } from '../lib/authMedia.ts';
import {
  processEquipmentImageFile,
  validateEquipmentImageFile,
} from '../lib/imageUtils.ts';
import type { DetailedComputed } from '../shared/types.ts';

interface ItemImageLightboxProps {
  item: DetailedComputed | null;
  isFa: boolean;
  canEdit: boolean;
  onClose: () => void;
  onImageUpdated: (
    itemId: string,
    result: { hasImage: boolean; itemImageThumb: string },
  ) => void;
  onNotify: (type: 'success' | 'error' | 'warning' | 'info', msg: string) => void;
}

export const ItemImageLightbox: React.FC<ItemImageLightboxProps> = ({
  item,
  isFa,
  canEdit,
  onClose,
  onImageUpdated,
  onNotify,
}) => {
  const [fullImage, setFullImage] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [zoom, setZoom] = useState<number>(1);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { url: resolvedImageUrl, loading: loadingBlob } = useAuthenticatedMediaUrl(fullImage);

  useEffect(() => {
    if (!item) {
      setFullImage('');
      setZoom(1);
      return;
    }
    setZoom(1);
    setFullImage(item.itemImageThumb || '');

    if (!item.hasImage) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    apiRequest<{ id: string; hasImage: boolean; itemImage: string; itemImageThumb: string }>(
      `/api/detailed/${item.id}/image`,
    )
      .then((res) => {
        if (!cancelled) {
          setFullImage(res.itemImage || res.itemImageThumb || '');
        }
      })
      .catch(() => {
        // Keep thumbnail fallback if full load fails
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [item]);

  useEffect(() => {
    if (!item) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [item, onClose]);

  if (!item) return null;

  const uploadNewFile = async (file: File | null | undefined) => {
    if (!file || !canEdit) return;
    const err = validateEquipmentImageFile(file, isFa);
    if (err) {
      onNotify('error', err);
      return;
    }
    setSaving(true);
    try {
      const processed = await processEquipmentImageFile(file);
      const res = await apiRequest<{
        ok: boolean;
        hasImage: boolean;
        itemImage: string;
        itemImageThumb: string;
      }>(`/api/detailed/${item.id}/image`, {
        method: 'PUT',
        body: JSON.stringify({
          itemImage: processed.itemImage,
          itemImageThumb: processed.itemImageThumb,
        }),
      });
      setFullImage(res.itemImage);
      onImageUpdated(item.id, {
        hasImage: res.hasImage,
        itemImageThumb: res.itemImageThumb,
      });
      onNotify(
        'success',
        isFa ? 'تصویر تجهیز با موفقیت ذخیره شد.' : 'Equipment photo saved successfully.',
      );
    } catch (e) {
      onNotify(
        'error',
        e instanceof ApiError
          ? e.message
          : isFa
            ? 'خطا در ذخیره‌سازی تصویر'
            : 'Failed to save equipment photo',
      );
    } finally {
      setSaving(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemoveImage = async () => {
    if (!canEdit) return;
    setSaving(true);
    try {
      await apiRequest(`/api/detailed/${item.id}/image`, {
        method: 'PUT',
        body: JSON.stringify({ itemImage: '', itemImageThumb: '' }),
      });
      setFullImage('');
      onImageUpdated(item.id, { hasImage: false, itemImageThumb: '' });
      onNotify('success', isFa ? 'تصویر این آیتم حذف شد.' : 'Item photo removed.');
    } catch (e) {
      if (e instanceof ApiError) onNotify('error', e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDownload = () => {
    const downloadHref = resolvedImageUrl || fullImage;
    if (!downloadHref) return;
    const a = document.createElement('a');
    a.href = downloadHref;
    const safeCode = (item.itemCode || item.itemNo || item.rowNo || 'item').replace(/[^a-zA-Z0-9_-]+/g, '_');
    const lowerRaw = fullImage.toLowerCase();
    const ext =
      lowerRaw.startsWith('data:image/webp') || lowerRaw.endsWith('.webp')
        ? 'webp'
        : lowerRaw.startsWith('data:image/png') || lowerRaw.endsWith('.png')
          ? 'png'
          : 'jpg';
    a.download = `SAMAAN_${safeCode}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div
      data-testid="item-image-lightbox"
      className="fixed inset-0 z-[75] bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 print:hidden"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl max-h-[92vh] rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        onDragEnter={(e) => {
          if (!canEdit) return;
          e.preventDefault();
          setDragging(true);
        }}
        onDragOver={(e) => {
          if (!canEdit) return;
          e.preventDefault();
          if (!dragging) setDragging(true);
        }}
        onDragLeave={(e) => {
          if (!canEdit) return;
          if (e.currentTarget.contains(e.relatedTarget as Node)) return;
          setDragging(false);
        }}
        onDrop={(e) => {
          if (!canEdit) return;
          e.preventDefault();
          setDragging(false);
          const f = e.dataTransfer?.files?.[0];
          if (f) void uploadNewFile(f);
        }}
      >
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-[var(--border-subtle)] flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-[var(--text-primary)] truncate bidi-plaintext">
              {item.description || item.generalDescription || (isFa ? 'تصویر تجهیز' : 'Equipment Photo')}
            </h3>
            <div className="text-[11px] text-[var(--text-muted)] mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 tabular-nums">
              <span>
                {isFa ? 'محموله:' : 'Shipment:'} <strong dir="ltr">{item.shipmentNo}</strong>
              </span>
              {item.packageNo && (
                <span>
                  {isFa ? 'نگله:' : 'Pkg:'} <strong dir="ltr">{item.packageNo}</strong>
                </span>
              )}
              {item.itemNo && (
                <span>
                  {isFa ? 'آیتم:' : 'Item:'} <strong dir="ltr">#{item.itemNo}</strong>
                </span>
              )}
              {item.itemCode && (
                <span>
                  {isFa ? 'کد کالا:' : 'Code:'} <strong dir="ltr">{item.itemCode}</strong>
                </span>
              )}
            </div>
          </div>

          <button
            type="button"
            data-testid="lightbox-close-btn"
            onClick={onClose}
            className="p-1.5 rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)] shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Hidden file input for quick upload/replace */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          data-testid="lightbox-file-input"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void uploadNewFile(f);
          }}
        />

        {/* Image Stage */}
        <div
          className={`relative flex-1 min-h-[280px] max-h-[65vh] overflow-auto flex items-center justify-center p-4 transition-colors ${
            dragging
              ? 'bg-[var(--accent-soft)] ring-2 ring-inset ring-[var(--accent-primary)]'
              : 'bg-[var(--bg-canvas)]'
          }`}
        >
          {saving ? (
            <div className="flex flex-col items-center gap-2 text-xs text-[var(--text-muted)]">
              <Loader2 className="w-6 h-6 animate-spin text-[var(--accent-primary)]" />
              <span>{isFa ? 'در حال ذخیره‌سازی تصویر...' : 'Saving photo...'}</span>
            </div>
          ) : fullImage ? (
            <div className="relative flex items-center justify-center">
              {resolvedImageUrl ? (
                <img
                  src={resolvedImageUrl}
                  alt={item.description || 'Equipment photo'}
                  referrerPolicy="no-referrer"
                  data-testid="lightbox-full-image"
                  style={{
                    transform: `scale(${zoom})`,
                    transformOrigin: 'center center',
                  }}
                  className="max-h-[58vh] max-w-full rounded-xl object-contain shadow-md transition-transform duration-150"
                />
              ) : (
                <div className="flex flex-col items-center gap-2 text-xs text-[var(--text-muted)] py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-[var(--accent-primary)]" />
                  <span>{isFa ? 'در حال بارگذاری تصویر...' : 'Loading image...'}</span>
                </div>
              )}
              {(loading || loadingBlob) && resolvedImageUrl && (
                <div className="absolute bottom-2 end-2 px-2.5 py-1 rounded-lg bg-black/65 text-white text-[10px] flex items-center gap-1.5">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span>{isFa ? 'در حال بارگذاری کیفیت اصلی...' : 'Loading full resolution...'}</span>
                </div>
              )}
            </div>
          ) : (
            <div className="py-10 text-center space-y-3 max-w-sm">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-[var(--bg-subtle)] text-[var(--text-muted)] flex items-center justify-center">
                <ImageOff className="w-7 h-7" />
              </div>
              <div className="text-sm font-bold text-[var(--text-primary)]">
                {isFa ? 'هنوز تصویری برای این تجهیز ثبت نشده است' : 'No photo attached to this item yet'}
              </div>
              {canEdit && (
                <>
                  <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                    {isFa
                      ? 'می‌توانید تصویر تجهیز را مستقیماً به همین پنجره بکشید و رها کنید (Drag & Drop) یا از سیستم انتخاب نمایید.'
                      : 'Drag & drop an image right into this window, or choose a file from your device.'}
                  </p>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="h-9 px-4 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-[var(--accent-contrast)] text-xs font-semibold inline-flex items-center gap-1.5"
                  >
                    <UploadCloud className="w-4 h-4" />
                    <span>{isFa ? 'انتخاب تصویر از سیستم' : 'Choose Image'}</span>
                  </button>
                </>
              )}
            </div>
          )}

          {dragging && canEdit && (
            <div className="absolute inset-0 bg-[var(--accent-soft)]/90 flex flex-col items-center justify-center gap-2 text-[var(--accent-primary)] font-bold text-sm pointer-events-none">
              <UploadCloud className="w-8 h-8" />
              <span>{isFa ? 'تصویر را اینجا رها کنید تا ذخیره شود' : 'Drop image here to attach'}</span>
            </div>
          )}
        </div>

        {/* Footer Controls */}
        <div className="px-5 py-3 border-t border-[var(--border-subtle)] bg-[var(--bg-surface)] flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            {fullImage && (
              <>
                <button
                  type="button"
                  onClick={() => setZoom((z) => Math.max(1, Number((z - 0.25).toFixed(2))))}
                  disabled={zoom <= 1}
                  title={isFa ? 'کوچک‌نمایی' : 'Zoom out'}
                  className="h-8 px-2.5 rounded-lg border border-[var(--border-subtle)] hover:bg-[var(--bg-subtle)] disabled:opacity-40 flex items-center gap-1 text-xs"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <span dir="ltr" className="text-xs font-mono text-[var(--text-muted)] px-1 tabular-nums">
                  {Math.round(zoom * 100)}%
                </span>
                <button
                  type="button"
                  onClick={() => setZoom((z) => Math.min(2.5, Number((z + 0.25).toFixed(2))))}
                  disabled={zoom >= 2.5}
                  title={isFa ? 'بزرگ‌نمایی' : 'Zoom in'}
                  className="h-8 px-2.5 rounded-lg border border-[var(--border-subtle)] hover:bg-[var(--bg-subtle)] disabled:opacity-40 flex items-center gap-1 text-xs"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={handleDownload}
                  className="h-8 px-3 rounded-lg border border-[var(--border-subtle)] hover:bg-[var(--bg-subtle)] text-xs font-medium flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                  <span>{isFa ? 'دانلود' : 'Download'}</span>
                </button>
              </>
            )}
          </div>

          <div className="flex items-center gap-2">
            {canEdit && (
              <>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => fileInputRef.current?.click()}
                  className="h-8 px-3 rounded-lg border border-[var(--border-subtle)] hover:bg-[var(--bg-subtle)] text-xs font-medium flex items-center gap-1.5"
                >
                  <UploadCloud className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                  <span>
                    {fullImage
                      ? isFa
                        ? 'تغییر تصویر'
                        : 'Replace'
                      : isFa
                        ? 'افزودن تصویر'
                        : 'Add Photo'}
                  </span>
                </button>
                {fullImage && (
                  <button
                    type="button"
                    data-testid="lightbox-remove-btn"
                    disabled={saving}
                    onClick={() => void handleRemoveImage()}
                    className="h-8 px-3 rounded-lg border border-[var(--status-danger)]/35 bg-[var(--status-danger-bg)] text-[var(--status-danger)] text-xs font-medium flex items-center gap-1.5 hover:opacity-90"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>{isFa ? 'حذف' : 'Remove'}</span>
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
