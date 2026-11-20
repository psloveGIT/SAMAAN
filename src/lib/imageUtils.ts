export interface ProcessedEquipmentImage {
  itemImage: string;
  itemImageThumb: string;
  width: number;
  height: number;
  sizeKb: number;
}

const ALLOWED_IMAGE_MIME = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/bmp',
  'image/avif',
]);

const MAX_RAW_FILE_BYTES = 15 * 1024 * 1024; // 15 MB raw input limit

export function validateEquipmentImageFile(
  file: File,
  isFa: boolean,
): string | null {
  const mime = (file.type || '').toLowerCase();
  const extOk = /\.(jpe?g|png|webp|gif|bmp|avif)$/i.test(file.name || '');
  if (!ALLOWED_IMAGE_MIME.has(mime) && !extOk) {
    return isFa
      ? 'فقط فایل‌های تصویری (JPG، PNG، WebP، GIF) پشتیبانی می‌شوند.'
      : 'Only image files (JPG, PNG, WebP, GIF) are supported.';
  }
  if (file.size > MAX_RAW_FILE_BYTES) {
    return isFa
      ? 'حجم فایل تصویر نباید بیشتر از ۱۵ مگابایت باشد.'
      : 'Image file size must not exceed 15 MB.';
  }
  return null;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(new Error('Failed to read image file'));
    reader.readAsDataURL(file);
  });
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Invalid or corrupted image file'));
    img.src = src;
  });
}

function renderResizedDataUrl(
  img: HTMLImageElement,
  maxSide: number,
  quality: number,
): { dataUrl: string; width: number; height: number } {
  const natW = img.naturalWidth || img.width || 1;
  const natH = img.naturalHeight || img.height || 1;
  const scale = Math.min(1, maxSide / Math.max(natW, natH));
  const width = Math.max(1, Math.round(natW * scale));
  const height = Math.max(1, Math.round(natH * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return { dataUrl: img.src, width: natW, height: natH };
  }

  // Fill white background behind transparent PNGs when exporting JPEG
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, width, height);

  let dataUrl = '';
  try {
    const webp = canvas.toDataURL('image/webp', quality);
    if (webp.startsWith('data:image/webp')) {
      dataUrl = webp;
    }
  } catch {
    // ignore
  }
  if (!dataUrl) {
    dataUrl = canvas.toDataURL('image/jpeg', quality);
  }
  return { dataUrl, width, height };
}

export async function processEquipmentImageFile(
  file: File,
): Promise<ProcessedEquipmentImage> {
  const rawDataUrl = await readFileAsDataUrl(file);
  if (!rawDataUrl) {
    throw new Error('Empty image data');
  }

  const img = await loadImageElement(rawDataUrl);
  const full = renderResizedDataUrl(img, 1280, 0.84);
  const thumb = renderResizedDataUrl(img, 120, 0.75);

  const sizeKb = Math.max(1, Math.round((full.dataUrl.length * 0.75) / 1024));
  return {
    itemImage: full.dataUrl,
    itemImageThumb: thumb.dataUrl,
    width: full.width,
    height: full.height,
    sizeKb,
  };
}
