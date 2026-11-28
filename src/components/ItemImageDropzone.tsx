import React, { useEffect, useRef, useState } from 'react';
import {
  Camera,
  ImagePlus,
  Loader2,
  RefreshCw,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react';
import {
  processEquipmentImageFile,
  validateEquipmentImageFile,
} from '../lib/imageUtils.ts';
import { AuthMediaImage } from './AuthMediaImage.tsx';

/* =========================================================================
 * Live Camera Capture Modal (supports desktop webcam & mobile cameras,
 * with graceful fallback to native capture="environment" file picker)
 * ========================================================================= */
interface CameraCaptureModalProps {
  open: boolean;
  isFa: boolean;
  onClose: () => void;
  onCaptureFile: (file: File) => void;
  onFallbackNativeCamera: () => void;
}

const CameraCaptureModal: React.FC<CameraCaptureModalProps> = ({
  open,
  isFa,
  onClose,
  onCaptureFile,
  onFallbackNativeCamera,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [loading, setLoading] = useState(true);
  const [camError, setCamError] = useState('');

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setCamError('');

    const stopStream = () => {
      if (streamRef.current) {
        for (const track of streamRef.current.getTracks()) {
          track.stop();
        }
        streamRef.current = null;
      }
    };

    const startCamera = async () => {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setLoading(false);
        setCamError(
          isFa
            ? 'دسترسی مستقیم به دوربین در این مرورگر پشتیبانی نمی‌شود. می‌توانید از دوربین پیش‌فرض دستگاه استفاده کنید.'
            : 'Direct camera stream is not supported in this browser. Use the device camera button below.',
        );
        return;
      }
      try {
        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: facingMode }, width: { ideal: 1600 }, height: { ideal: 1200 } },
            audio: false,
          });
        } catch {
          stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        }
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        setLoading(false);
      } catch {
        if (!cancelled) {
          setLoading(false);
          setCamError(
            isFa
              ? 'دسترسی به دوربین رد شد یا دوربینی یافت نشد. می‌توانید از دوربین/فایل دستگاه استفاده کنید.'
              : 'Camera access was denied or no camera was detected. You can use the native camera picker instead.',
          );
        }
      }
    };

    void startCamera();
    return () => {
      cancelled = true;
      stopStream();
    };
  }, [open, facingMode, isFa]);

  if (!open) return null;

  const handleSnap = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const file = new File([blob], `camera-${Date.now()}.jpg`, { type: 'image/jpeg' });
        onCaptureFile(file);
        onClose();
      },
      'image/jpeg',
      0.92,
    );
  };

  return (
    <div
      className="fixed inset-0 z-[90] bg-black/75 flex items-center justify-center p-4"
      onClick={onClose}
      data-testid="camera-capture-modal"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-2xl overflow-hidden"
      >
        <div className="px-4 py-3 border-b border-[var(--border-subtle)] flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-bold">
            <Camera className="w-4 h-4 text-[var(--accent-primary)]" />
            <span>{isFa ? 'عکسبرداری با دوربین دستگاه' : 'Take Photo with Camera'}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-subtle)]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          {camError ? (
            <div className="p-4 rounded-xl border border-[var(--status-warning)]/40 bg-[var(--status-warning-bg)] text-xs text-[var(--text-primary)] space-y-3 text-center">
              <p className="leading-relaxed">{camError}</p>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onFallbackNativeCamera();
                }}
                className="h-9 px-4 rounded-lg bg-[var(--accent-primary)] text-[var(--accent-contrast)] text-xs font-semibold inline-flex items-center gap-1.5"
              >
                <Camera className="w-3.5 h-3.5" />
                <span>{isFa ? 'باز کردن دوربین / انتخاب فایل' : 'Open Device Camera / Picker'}</span>
              </button>
            </div>
          ) : (
            <div className="relative rounded-xl overflow-hidden bg-black aspect-[4/3] flex items-center justify-center">
              {loading && (
                <div className="absolute inset-0 flex items-center justify-center gap-2 text-xs text-white/80">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>{isFa ? 'در حال اتصال به دوربین...' : 'Starting camera...'}</span>
                </div>
              )}
              <video
                ref={videoRef}
                playsInline
                autoPlay
                muted
                className="w-full h-full object-cover"
              />
            </div>
          )}

          <div className="flex items-center justify-between gap-2 pt-1">
            <button
              type="button"
              onClick={() => setFacingMode((m) => (m === 'environment' ? 'user' : 'environment'))}
              disabled={Boolean(camError)}
              className="h-9 px-3 rounded-lg border border-[var(--border-subtle)] hover:bg-[var(--bg-subtle)] text-xs font-medium flex items-center gap-1.5 disabled:opacity-40"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>{isFa ? 'تغییر دوربین' : 'Switch Camera'}</span>
            </button>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="h-9 px-3.5 rounded-lg border border-[var(--border-subtle)] text-xs font-medium hover:bg-[var(--bg-subtle)]"
              >
                {isFa ? 'انصراف' : 'Cancel'}
              </button>
              {!camError && (
                <button
                  type="button"
                  disabled={loading}
                  onClick={handleSnap}
                  data-testid="camera-snap-btn"
                  className="h-9 px-4 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-[var(--accent-contrast)] text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span>{isFa ? 'ثبت عکس' : 'Capture Photo'}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

/* =========================================================================
 * Single-Image Dropzone (Detailed Equipment: 1 photo + live camera capture)
 * ========================================================================= */
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
  const nativeCamRef = useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [localError, setLocalError] = useState('');
  const [metaText, setMetaText] = useState('');
  const [cameraOpen, setCameraOpen] = useState(false);

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
      if (nativeCamRef.current) nativeCamRef.current.value = '';
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
        <div className="flex items-center gap-2">
          {metaText && previewSrc && (
            <span dir="ltr" className="text-[10px] text-[var(--text-muted)] tabular-nums">
              {metaText}
            </span>
          )}
          <button
            type="button"
            data-testid="item-image-camera-btn"
            onClick={() => setCameraOpen(true)}
            className="h-7 px-2.5 rounded-lg border border-[var(--accent-primary)]/40 bg-[var(--accent-soft)] text-[var(--accent-primary)] hover:opacity-90 text-[11px] font-semibold flex items-center gap-1"
          >
            <Camera className="w-3.5 h-3.5" />
            <span>{isFa ? 'گرفتن عکس با دوربین' : 'Take Photo'}</span>
          </button>
        </div>
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
      <input
        ref={nativeCamRef}
        type="file"
        accept="image/*"
        capture="environment"
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
              <AuthMediaImage
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
                  ? 'برای جایگزینی، تصویر جدیدی بکشید و رها کنید یا از دوربین / فایل استفاده نمایید.'
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
                  onClick={() => setCameraOpen(true)}
                  className="h-8 px-3 rounded-lg border border-[var(--accent-primary)]/40 bg-[var(--accent-soft)] text-[var(--accent-primary)] text-xs font-medium flex items-center gap-1.5 hover:opacity-90"
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span>{isFa ? 'دوربین' : 'Camera'}</span>
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
                  ? 'پشتیبانی از JPG، PNG، WebP، دوربین دستگاه و Ctrl+V — فشرده‌سازی خودکار'
                  : 'Supports JPG, PNG, WebP, device camera & Ctrl+V — auto-optimized'}
              </div>
            </div>
          </div>
        )}
      </div>

      {localError && (
        <div className="text-[11px] text-[var(--status-danger)] font-medium">{localError}</div>
      )}

      <CameraCaptureModal
        open={cameraOpen}
        isFa={isFa}
        onClose={() => setCameraOpen(false)}
        onCaptureFile={(file) => void handleFile(file)}
        onFallbackNativeCamera={() => nativeCamRef.current?.click()}
      />
    </div>
  );
};

/* =========================================================================
 * Multi-Image Dropzone (General Equipment: up to 2 photos + live camera)
 * ========================================================================= */
interface MultiImageDropzoneProps {
  images: string[];
  thumbs: string[];
  maxImages?: number;
  loadingExisting?: boolean;
  isFa: boolean;
  compact?: boolean;
  label?: string;
  onChange: (next: { itemImages: string[]; itemImageThumbs: string[] }) => void;
  onError?: (msg: string) => void;
}

export const MultiImageDropzone: React.FC<MultiImageDropzoneProps> = ({
  images,
  thumbs,
  maxImages = 2,
  loadingExisting = false,
  isFa,
  compact = false,
  label,
  onChange,
  onError,
}) => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const nativeCamRef = useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [localError, setLocalError] = useState('');
  const [cameraOpen, setCameraOpen] = useState(false);

  const count = Math.max(images.length, thumbs.length);
  const previews = Array.from({ length: count }, (_, i) => images[i] || thumbs[i] || '').filter(Boolean);
  const canAddMore = previews.length < maxImages;

  const handleFiles = async (fileList: FileList | File[]) => {
    const files = Array.from(fileList).filter((f) => f && f.size > 0);
    if (!files.length) return;
    setLocalError('');
    const remaining = maxImages - previews.length;
    if (remaining <= 0) {
      const msg = isFa
        ? `حداکثر ${maxImages.toLocaleString('fa-IR')} تصویر برای هر نگله مجاز است.`
        : `At most ${maxImages} photos are allowed per package.`;
      setLocalError(msg);
      onError?.(msg);
      return;
    }

    const toProcess = files.slice(0, remaining);
    setProcessing(true);
    try {
      const nextImages = [...images];
      const nextThumbs = [...thumbs];
      for (const file of toProcess) {
        const err = validateEquipmentImageFile(file, isFa);
        if (err) {
          setLocalError(err);
          onError?.(err);
          continue;
        }
        const processed = await processEquipmentImageFile(file);
        nextImages.push(processed.itemImage);
        nextThumbs.push(processed.itemImageThumb);
      }
      onChange({
        itemImages: nextImages.slice(0, maxImages),
        itemImageThumbs: nextThumbs.slice(0, maxImages),
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
      if (nativeCamRef.current) nativeCamRef.current.value = '';
    }
  };

  const removeAt = (idx: number) => {
    setLocalError('');
    const nextImages = images.filter((_, i) => i !== idx);
    const nextThumbs = thumbs.filter((_, i) => i !== idx);
    onChange({ itemImages: nextImages, itemImageThumbs: nextThumbs });
  };

  return (
    <div className="space-y-1.5" data-testid="general-multi-image-dropzone">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="text-[11px] font-bold text-[var(--text-secondary)] flex items-center gap-1.5">
          <ImagePlus className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
          <span>
            {label ||
              (isFa
                ? `تصاویر نگله (حداکثر ${maxImages.toLocaleString('fa-IR')} تصویر — اختیاری)`
                : `Package Photos (up to ${maxImages} — Optional)`)}
          </span>
          <span className="text-[10px] font-normal text-[var(--text-muted)] tabular-nums">
            ({isFa ? `${previews.length.toLocaleString('fa-IR')} از ${maxImages.toLocaleString('fa-IR')}` : `${previews.length}/${maxImages}`})
          </span>
        </label>
        {canAddMore && (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              data-testid="general-image-upload-btn"
              onClick={() => inputRef.current?.click()}
              className="h-7 px-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)] text-[11px] font-medium flex items-center gap-1"
            >
              <UploadCloud className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
              <span>{isFa ? 'انتخاب تصویر' : 'Upload'}</span>
            </button>
            <button
              type="button"
              data-testid="general-image-camera-btn"
              onClick={() => setCameraOpen(true)}
              className="h-7 px-2.5 rounded-lg border border-[var(--accent-primary)]/40 bg-[var(--accent-soft)] text-[var(--accent-primary)] hover:opacity-90 text-[11px] font-semibold flex items-center gap-1"
            >
              <Camera className="w-3.5 h-3.5" />
              <span>{isFa ? 'دوربین' : 'Camera'}</span>
            </button>
          </div>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        data-testid="general-image-file-input"
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            void handleFiles(e.target.files);
          }
        }}
      />
      <input
        ref={nativeCamRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            void handleFiles(e.target.files);
          }
        }}
      />

      <div
        onDragEnter={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (canAddMore) setDragging(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (canAddMore && !dragging) setDragging(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (e.currentTarget.contains(e.relatedTarget as Node)) return;
          setDragging(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDragging(false);
          if (canAddMore && e.dataTransfer?.files?.length) {
            void handleFiles(e.dataTransfer.files);
          }
        }}
        className={`rounded-xl border border-dashed transition-colors ${
          dragging
            ? 'border-[var(--accent-primary)] bg-[var(--accent-soft)]/70'
            : 'border-[var(--border-subtle)] bg-[var(--bg-surface)]'
        } ${compact ? 'p-2.5' : 'p-3'}`}
      >
        {processing || loadingExisting ? (
          <div className="py-3 flex items-center justify-center gap-2 text-xs text-[var(--text-muted)]">
            <Loader2 className="w-4 h-4 animate-spin text-[var(--accent-primary)]" />
            <span>
              {loadingExisting
                ? isFa
                  ? 'در حال بارگذاری تصاویر...'
                  : 'Loading photos...'
                : isFa
                  ? 'در حال بهینه‌سازی تصویر...'
                  : 'Optimizing photo...'}
            </span>
          </div>
        ) : previews.length === 0 ? (
          <div
            onClick={() => inputRef.current?.click()}
            className="cursor-pointer py-2 flex items-center justify-center gap-2.5 text-center"
          >
            <UploadCloud className="w-4 h-4 text-[var(--accent-primary)] shrink-0" />
            <span className="text-[11px] text-[var(--text-muted)]">
              {isFa
                ? `حداکثر ${maxImages.toLocaleString('fa-IR')} تصویر را اینجا بکشید و رها کنید یا از دکمه‌های بالا انتخاب/عکسبرداری کنید`
                : `Drop up to ${maxImages} photos here, or click Upload / Camera above`}
            </span>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2.5">
            {previews.map((src, idx) => (
              <div
                key={idx}
                className="relative group w-20 h-20 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] overflow-hidden shrink-0"
              >
                <AuthMediaImage
                  src={src}
                  alt={isFa ? `تصویر ${idx + 1}` : `Photo ${idx + 1}`}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
                <button
                  type="button"
                  onClick={() => removeAt(idx)}
                  title={isFa ? 'حذف تصویر' : 'Remove photo'}
                  data-testid={`general-image-remove-${idx}`}
                  className="absolute top-1 end-1 w-5 h-5 rounded-md bg-black/70 text-white hover:bg-red-600 flex items-center justify-center transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
            {canAddMore && (
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="w-20 h-20 rounded-lg border border-dashed border-[var(--border-strong)] hover:border-[var(--accent-primary)] hover:bg-[var(--accent-soft)]/40 flex flex-col items-center justify-center gap-1 text-[10px] text-[var(--text-muted)] transition-colors"
              >
                <ImagePlus className="w-4 h-4 text-[var(--accent-primary)]" />
                <span>{isFa ? 'افزودن' : 'Add'}</span>
              </button>
            )}
          </div>
        )}
      </div>

      {localError && (
        <div className="text-[11px] text-[var(--status-danger)] font-medium">{localError}</div>
      )}

      <CameraCaptureModal
        open={cameraOpen}
        isFa={isFa}
        onClose={() => setCameraOpen(false)}
        onCaptureFile={(file) => void handleFiles([file])}
        onFallbackNativeCamera={() => nativeCamRef.current?.click()}
      />
    </div>
  );
};
