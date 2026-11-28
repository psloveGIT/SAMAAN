import React, { useEffect, useRef, useState } from 'react';
import {
  Camera,
  CheckCircle2,
  Download,
  Eye,
  FileCheck2,
  FileText,
  Loader2,
  ScanLine,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import { apiRequest, ApiError } from '../lib/api.ts';
import { fetchAuthenticatedMediaBlob, isProtectedApiFileUrl } from '../lib/authMedia.ts';
import type { SignedScanAttachment, SignedScanCollectionKey } from '../shared/types.ts';
import {
  ALLOWED_SIGNED_SCAN_MIMES,
  MAX_SIGNED_SCAN_BYTES,
} from '../shared/docUniqueness.ts';

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.onload = () => {
      const res = typeof reader.result === 'string' ? reader.result : '';
      const idx = res.indexOf('base64,');
      resolve(idx >= 0 ? res.slice(idx + 7) : res);
    };
    reader.readAsDataURL(file);
  });
}

function base64ToBlob(base64: string, mimeType: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType });
}

function formatBytes(bytes: number, isFa: boolean): string {
  if (bytes < 1024) return isFa ? `${bytes} بایت` : `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export interface SignedScanRowButtonProps {
  signedScan?: SignedScanAttachment | null;
  onClick: (e: React.MouseEvent) => void;
  recordLabel?: string;
}

/**
 * Compact status/action button for Form History table cells across all form sections
 * (except Storage Label). Clicking opens the Signed Scan viewer/uploader modal.
 */
export const SignedScanRowButton: React.FC<SignedScanRowButtonProps> = ({
  signedScan,
  onClick,
  recordLabel,
}) => {
  const { prefs } = useApp();
  const isFa = prefs.language === 'fa';
  const hasScan = Boolean(signedScan?.dataBase64);

  return (
    <button
      type="button"
      data-testid={hasScan ? 'signed-scan-view-btn' : 'signed-scan-upload-btn'}
      onClick={(e) => {
        e.stopPropagation();
        onClick(e);
      }}
      title={
        hasScan
          ? isFa
            ? `مشاهده اسکن امضاشده (${signedScan?.fileName || recordLabel || ''})`
            : `View signed scan (${signedScan?.fileName || recordLabel || ''})`
          : isFa
            ? `اسکن / آپلود فایل امضاشده ${recordLabel || ''}`
            : `Scan / upload signed form ${recordLabel || ''}`
      }
      className={`h-7 px-2 rounded-lg border text-[11px] font-semibold inline-flex items-center gap-1 transition-colors whitespace-nowrap ${
        hasScan
          ? 'border-emerald-500/40 bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20'
          : 'border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[var(--text-secondary)] hover:border-[var(--accent-primary)] hover:text-[var(--accent-primary)]'
      }`}
    >
      {hasScan ? (
        <>
          <FileCheck2 className="w-3.5 h-3.5 shrink-0" />
          <span>{isFa ? 'اسکن امضاشده' : 'Signed Scan'}</span>
        </>
      ) : (
        <>
          <ScanLine className="w-3.5 h-3.5 shrink-0" />
          <span>{isFa ? 'آپلود اسکن' : 'Upload Scan'}</span>
        </>
      )}
    </button>
  );
};

export interface SignedScanModalProps {
  open: boolean;
  collection: SignedScanCollectionKey;
  recordId: string;
  recordLabel: string;
  signedScan?: SignedScanAttachment | null;
  onClose: () => void;
  onUpdated: (nextScan: SignedScanAttachment | null) => void;
}

/**
 * Reusable Signed Form Scan Viewer & Uploader Modal.
 * Works across ALL form history views (and any future form section) via
 * PUT/DELETE `/api/form-scans/:collection/:id`.
 * Supports PDF, PNG, JPG, WebP upload as well as direct mobile/tablet camera scan.
 */
export const SignedScanModal: React.FC<SignedScanModalProps> = ({
  open,
  collection,
  recordId,
  recordLabel,
  signedScan,
  onClose,
  onUpdated,
}) => {
  const { prefs, user, notify, formatDate } = useApp();
  const isFa = prefs.language === 'fa';
  const canEdit = user?.role === 'admin' || user?.role === 'operator';

  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const rawValue = (signedScan?.dataBase64 || '').trim();
    if (!open || !rawValue) {
      setPreviewUrl(null);
      setLoadingPreview(false);
      return;
    }

    let active = true;
    let objectUrl: string | null = null;
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const mimeType = signedScan?.mimeType || 'application/octet-stream';

    if (isProtectedApiFileUrl(rawValue)) {
      setLoadingPreview(true);
      setPreviewUrl(null);
      fetchAuthenticatedMediaBlob(rawValue, {
        signal: controller?.signal,
        mimeTypeHint: mimeType,
      })
        .then((blob) => {
          const nextUrl = URL.createObjectURL(blob);
          if (!active) {
            URL.revokeObjectURL(nextUrl);
            return;
          }
          objectUrl = nextUrl;
          setPreviewUrl(nextUrl);
          setLoadingPreview(false);
        })
        .catch(() => {
          if (!active) return;
          setPreviewUrl(null);
          setLoadingPreview(false);
        });
    } else {
      try {
        const cleanBase64 = rawValue.replace(/^data:[^;]+;base64,/i, '');
        const blob = base64ToBlob(cleanBase64, mimeType);
        objectUrl = URL.createObjectURL(blob);
        setPreviewUrl(objectUrl);
      } catch {
        setPreviewUrl(null);
      }
      setLoadingPreview(false);
    }

    return () => {
      active = false;
      if (controller) controller.abort();
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [open, signedScan]);

  if (!open) return null;

  const isPdf = (signedScan?.mimeType || '').toLowerCase() === 'application/pdf';
  const isImage = (signedScan?.mimeType || '').toLowerCase().startsWith('image/');

  const processFile = async (file: File | null | undefined) => {
    if (!file || !canEdit) return;
    const mime = (file.type || '').toLowerCase();
    const inferredMime =
      mime ||
      (file.name.toLowerCase().endsWith('.pdf')
        ? 'application/pdf'
        : file.name.toLowerCase().endsWith('.png')
          ? 'image/png'
          : file.name.toLowerCase().endsWith('.webp')
            ? 'image/webp'
            : file.name.toLowerCase().endsWith('.jpg') || file.name.toLowerCase().endsWith('.jpeg')
              ? 'image/jpeg'
              : '');

    if (!ALLOWED_SIGNED_SCAN_MIMES.has(inferredMime)) {
      notify(
        'error',
        isFa
          ? 'فرمت فایل مجاز نیست. لطفاً فایل PDF یا تصویر (PNG / JPG / WebP) انتخاب کنید.'
          : 'Unsupported file type. Please choose a PDF or image (PNG / JPG / WebP).',
      );
      return;
    }

    if (file.size > MAX_SIGNED_SCAN_BYTES) {
      notify(
        'error',
        isFa ? 'حجم فایل نباید بیشتر از ۱۰ مگابایت باشد.' : 'File size must not exceed 10 MB.',
      );
      return;
    }

    setUploading(true);
    try {
      const dataBase64 = await readFileAsBase64(file);
      const res = await apiRequest<{ ok: boolean; signedScan: SignedScanAttachment }>(
        `/api/form-scans/${encodeURIComponent(collection)}/${encodeURIComponent(recordId)}`,
        {
          method: 'PUT',
          body: JSON.stringify({
            fileName: file.name,
            mimeType: inferredMime,
            sizeBytes: file.size,
            dataBase64,
          }),
        },
      );
      onUpdated(res.signedScan);
      notify(
        'success',
        isFa
          ? `فایل اسکن امضاشده برای فرم ${recordLabel} با موفقیت ذخیره شد.`
          : `Signed scan saved for form ${recordLabel}.`,
      );
    } catch (err) {
      notify(
        'error',
        err instanceof ApiError
          ? err.message
          : isFa
            ? 'ذخیره فایل اسکن ناموفق بود.'
            : 'Failed to save signed scan.',
      );
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async () => {
    if (!canEdit || !signedScan) return;
    setDeleting(true);
    try {
      await apiRequest(
        `/api/form-scans/${encodeURIComponent(collection)}/${encodeURIComponent(recordId)}`,
        { method: 'DELETE' },
      );
      onUpdated(null);
      notify(
        'info',
        isFa ? 'فایل اسکن امضاشده حذف شد.' : 'Signed scan removed.',
      );
    } catch (err) {
      notify(
        'error',
        err instanceof ApiError
          ? err.message
          : isFa
            ? 'حذف فایل اسکن ناموفق بود.'
            : 'Failed to delete signed scan.',
      );
    } finally {
      setDeleting(false);
    }
  };

  const handleDownload = () => {
    if (!signedScan?.dataBase64 || !previewUrl) return;
    const a = document.createElement('a');
    a.href = previewUrl;
    a.download = signedScan.fileName || `${recordLabel || 'signed-form'}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  return (
    <div
      data-testid="signed-scan-modal"
      className="fixed inset-0 z-[80] bg-slate-950/65 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 print:hidden"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={isFa ? `اسکن امضاشده فرم ${recordLabel}` : `Signed Scan — ${recordLabel}`}
        className="w-full max-w-4xl max-h-[92vh] rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-2xl flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-[var(--border-subtle)] bg-[var(--bg-canvas)]/70 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-[var(--accent-soft)] text-[var(--accent-primary)] flex items-center justify-center shrink-0">
              {signedScan ? <FileCheck2 className="w-5 h-5" /> : <ScanLine className="w-5 h-5" />}
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-extrabold truncate">
                {isFa ? `نسخه اسکن و امضاشده فرم` : `Signed & Scanned Form`}{' '}
                <span dir="ltr" className="font-mono text-[var(--accent-primary)]">
                  {recordLabel}
                </span>
              </h3>
              <p className="text-[11px] text-[var(--text-muted)] truncate">
                {signedScan
                  ? isFa
                    ? `${signedScan.fileName} · ${formatBytes(signedScan.sizeBytes, true)} · ثبت‌شده در ${formatDate(signedScan.uploadedAt.slice(0, 10))}${signedScan.uploadedBy ? ` توسط ${signedScan.uploadedBy}` : ''}`
                    : `${signedScan.fileName} · ${formatBytes(signedScan.sizeBytes, false)} · Uploaded ${formatDate(signedScan.uploadedAt.slice(0, 10))}`
                  : isFa
                    ? 'پس از تکمیل امضاهای فرم چاپ‌شده، فایل اسکن‌شده (PDF یا تصویر) را در این بخش بارگذاری نمایید.'
                    : 'After collecting signatures on the printed form, scan or upload the signed file (PDF or image) here.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {signedScan && (
              <>
                <button
                  type="button"
                  data-testid="signed-scan-download-btn"
                  onClick={handleDownload}
                  className="h-8 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)] text-xs font-semibold inline-flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>{isFa ? 'دانلود' : 'Download'}</span>
                </button>
                {canEdit && (
                  <>
                    <button
                      type="button"
                      disabled={uploading}
                      onClick={() => fileInputRef.current?.click()}
                      className="h-8 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)] text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-50"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>{isFa ? 'جایگزینی' : 'Replace'}</span>
                    </button>
                    <button
                      type="button"
                      data-testid="signed-scan-delete-btn"
                      disabled={deleting}
                      onClick={() => void handleDelete()}
                      className="h-8 px-2.5 rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400 hover:bg-rose-500/20 text-xs font-semibold inline-flex items-center gap-1 disabled:opacity-50"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>{isFa ? 'حذف' : 'Delete'}</span>
                    </button>
                  </>
                )}
              </>
            )}
            <button
              type="button"
              data-testid="signed-scan-close-btn"
              onClick={onClose}
              aria-label={isFa ? 'بستن پنجره اسکن' : 'Close scan viewer'}
              className="w-8 h-8 rounded-lg border border-[var(--border-subtle)] flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-subtle)]"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Hidden File & Camera Inputs */}
        <input
          ref={fileInputRef}
          type="file"
          data-testid="signed-scan-file-input"
          accept="application/pdf,image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => {
            void processFile(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            void processFile(e.target.files?.[0]);
            e.target.value = '';
          }}
        />

        {/* Body */}
        <div className="flex-1 overflow-auto p-4 sm:p-5 bg-[var(--bg-canvas)]/40">
          {signedScan && loadingPreview ? (
            <div className="min-h-[45vh] flex flex-col items-center justify-center gap-2.5 text-xs text-[var(--text-muted)]">
              <Loader2 className="w-6 h-6 animate-spin text-[var(--accent-primary)]" />
              <span>{isFa ? 'در حال بارگذاری فایل اسکن امضاشده...' : 'Loading signed scan file...'}</span>
            </div>
          ) : signedScan && previewUrl ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2 text-xs text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded-xl px-3.5 py-2">
                <span className="inline-flex items-center gap-1.5 font-semibold">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  {isFa
                    ? 'نسخه امضاشده این فرم در سامانه آرشیو شده و در هر زمان با کلیک روی ردیف سابقه قابل مشاهده است.'
                    : 'Signed copy is archived and viewable anytime by clicking this history row.'}
                </span>
                <span dir="ltr" className="font-mono text-[11px] opacity-80">
                  {signedScan.mimeType}
                </span>
              </div>

              <div className="rounded-xl border border-[var(--border-subtle)] bg-white overflow-hidden flex items-center justify-center min-h-[55vh]">
                {isPdf ? (
                  <iframe
                    src={previewUrl}
                    title={signedScan.fileName}
                    data-testid="signed-scan-pdf-preview"
                    className="w-full h-[65vh] border-0"
                  />
                ) : isImage ? (
                  <img
                    src={previewUrl}
                    alt={signedScan.fileName}
                    data-testid="signed-scan-img-preview"
                    className="max-w-full max-h-[68vh] object-contain p-2"
                  />
                ) : (
                  <div className="p-8 text-center space-y-2 text-slate-600">
                    <FileText className="w-10 h-10 mx-auto text-slate-400" />
                    <div className="text-xs font-semibold">{signedScan.fileName}</div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                if (canEdit) setDragActive(true);
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragActive(false);
                if (canEdit) void processFile(e.dataTransfer.files?.[0]);
              }}
              className={`rounded-2xl border-2 border-dashed p-8 sm:p-12 text-center transition-colors space-y-4 ${
                dragActive
                  ? 'border-[var(--accent-primary)] bg-[var(--accent-soft)]/50'
                  : 'border-[var(--border-strong)] bg-[var(--bg-surface)]'
              }`}
            >
              <div className="w-14 h-14 mx-auto rounded-2xl bg-[var(--accent-soft)] text-[var(--accent-primary)] flex items-center justify-center">
                <ScanLine className="w-7 h-7" />
              </div>
              <div className="space-y-1">
                <div className="text-sm font-extrabold text-[var(--text-primary)]">
                  {isFa
                    ? 'هنوز نسخه اسکن و امضاشده‌ای برای این فرم ثبت نشده است'
                    : 'No signed scan uploaded for this form yet'}
                </div>
                <p className="text-xs text-[var(--text-secondary)] max-w-md mx-auto leading-relaxed">
                  {isFa
                    ? 'فایل اسکن فرم امضاشده (PDF، PNG، JPG یا WebP تا ۱۰ مگابایت) را بکشید و اینجا رها کنید یا از دکمه‌های زیر فایل را انتخاب یا اسکن نمایید.'
                    : 'Drag and drop the signed form scan (PDF, PNG, JPG, or WebP up to 10 MB) here, or use the buttons below to upload or capture with a camera.'}
                </p>
              </div>

              {canEdit ? (
                <div className="flex flex-wrap items-center justify-center gap-2.5 pt-2">
                  <button
                    type="button"
                    data-testid="signed-scan-choose-file-btn"
                    disabled={uploading}
                    onClick={() => fileInputRef.current?.click()}
                    className="h-10 px-5 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-[var(--accent-contrast)] text-xs font-bold inline-flex items-center gap-2 shadow-sm disabled:opacity-50"
                  >
                    <Upload className="w-4 h-4" />
                    <span>
                      {uploading
                        ? isFa
                          ? 'در حال بارگذاری...'
                          : 'Uploading...'
                        : isFa
                          ? 'انتخاب فایل اسکن (PDF / تصویر)'
                          : 'Choose Scan File (PDF / Image)'}
                    </span>
                  </button>

                  <button
                    type="button"
                    disabled={uploading}
                    onClick={() => cameraInputRef.current?.click()}
                    className="h-10 px-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] hover:bg-[var(--bg-subtle)] text-xs font-semibold text-[var(--text-primary)] inline-flex items-center gap-2 disabled:opacity-50"
                  >
                    <Camera className="w-4 h-4 text-[var(--accent-primary)]" />
                    <span>{isFa ? 'اسکن مستقیم با دوربین' : 'Scan with Camera'}</span>
                  </button>
                </div>
              ) : (
                <div className="inline-flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
                  <Eye className="w-3.5 h-3.5" />
                  <span>
                    {isFa
                      ? 'حساب شما فقط دسترسی مشاهده دارد.'
                      : 'Your role has read-only access.'}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
