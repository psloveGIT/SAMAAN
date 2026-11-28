import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024; // 10 MB decoded binary limit

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

const EXT_TO_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  pdf: 'application/pdf',
};

const SAFE_PROJECT_ID_RE = /^[a-z0-9_-]{1,80}$/;
const SAFE_UPLOAD_FILENAME_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|pdf)$/i;
const PROTECTED_API_FILE_URL_RE =
  /^\/api\/files\/([a-z0-9_-]{1,80})\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|pdf))$/i;
const PROTECTED_API_IMAGE_URL_RE =
  /^\/api\/files\/([a-z0-9_-]{1,80})\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp))$/i;
const DATA_URL_RE = /^data:([a-z0-9.+\/-]+);base64,([a-z0-9+/=\s]+)$/i;

let cachedDefaultUploadsDir: string | null = null;

/**
 * Resolves the uploads root directory.
 * Defaults to `/app/uploads` (matching Docker volume mounts). If `SAMAAN_UPLOADS_DIR` is explicitly
 * provided, always uses that path; otherwise falls back to `<cwd>/uploads` only if `/app/uploads`
 * cannot be created in a non-root local development sandbox.
 */
export function getUploadsRootDir(overrideDir?: string): string {
  if (overrideDir && overrideDir.trim()) {
    return path.resolve(overrideDir.trim());
  }
  const envDir = String(process.env.SAMAAN_UPLOADS_DIR || '').trim();
  if (envDir) {
    return path.resolve(envDir);
  }
  if (cachedDefaultUploadsDir) {
    return cachedDefaultUploadsDir;
  }

  const dockerDefault = '/app/uploads';
  try {
    fs.mkdirSync(dockerDefault, { recursive: true });
    fs.accessSync(dockerDefault, fs.constants.W_OK);
    cachedDefaultUploadsDir = dockerDefault;
    return dockerDefault;
  } catch {
    const localFallback = path.resolve(process.cwd(), 'uploads');
    fs.mkdirSync(localFallback, { recursive: true });
    cachedDefaultUploadsDir = localFallback;
    return localFallback;
  }
}

export function sanitizeUploadProjectId(rawProjectId: string): string | null {
  const clean = String(rawProjectId || '').trim().toLowerCase();
  if (!SAFE_PROJECT_ID_RE.test(clean)) {
    return null;
  }
  return clean;
}

export function isValidUploadedFilename(filename: string): boolean {
  const clean = String(filename || '').trim();
  return SAFE_UPLOAD_FILENAME_RE.test(clean);
}

export function isProtectedApiFileUrl(value: unknown): boolean {
  return typeof value === 'string' && PROTECTED_API_FILE_URL_RE.test(value.trim());
}

/**
 * Validates image fields accepted by warehouse routes:
 * supports inline `data:image/(jpeg|jpg|png|webp);base64,...` strings AND extracted
 * authenticated relative URLs `/api/files/<projectId>/<uuid>.(jpg|png|webp)`.
 */
export function isValidImageValue(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (PROTECTED_API_IMAGE_URL_RE.test(trimmed)) {
    return true;
  }
  const m = /^data:(image\/(?:jpeg|jpg|png|webp));base64,/i.exec(trimmed);
  return Boolean(m);
}

function normalizeAllowedMime(rawMime: string): string | null {
  const clean = String(rawMime || '').split(';')[0].trim().toLowerCase();
  if (clean === 'image/jpg') return 'image/jpeg';
  if (Object.prototype.hasOwnProperty.call(MIME_TO_EXT, clean)) {
    return clean;
  }
  return null;
}

/**
 * Verifies leading binary magic bytes match the declared MIME type to prevent spoofed uploads.
 */
function matchesMagicBytes(buf: Buffer, mimeType: string): boolean {
  if (buf.length < 4) return false;
  if (mimeType === 'image/jpeg') {
    return buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  }
  if (mimeType === 'image/png') {
    return (
      buf.length >= 8 &&
      buf[0] === 0x89 &&
      buf[1] === 0x50 &&
      buf[2] === 0x4e &&
      buf[3] === 0x47 &&
      buf[4] === 0x0d &&
      buf[5] === 0x0a &&
      buf[6] === 0x1a &&
      buf[7] === 0x0a
    );
  }
  if (mimeType === 'image/webp') {
    return (
      buf.length >= 12 &&
      buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
      buf.subarray(8, 12).toString('ascii') === 'WEBP'
    );
  }
  if (mimeType === 'application/pdf') {
    // Allow optional leading whitespace/BOM before %PDF-
    const head = buf.subarray(0, Math.min(buf.length, 32)).toString('ascii');
    return head.includes('%PDF-');
  }
  return false;
}

export interface SavedAttachmentResult {
  url: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  diskPath: string;
}

export function saveBase64Attachment(params: {
  projectId: string;
  base64OrDataUrl: string;
  mimeTypeHint?: string;
  uploadsRootDir?: string;
}): SavedAttachmentResult {
  const safeProjectId = sanitizeUploadProjectId(params.projectId);
  if (!safeProjectId) {
    throw new Error(`Invalid projectId for attachment storage: "${params.projectId}"`);
  }

  const raw = String(params.base64OrDataUrl || '').trim();
  if (!raw) {
    throw new Error('Empty attachment payload');
  }

  let declaredMime = '';
  let base64Body = '';

  const dataUrlMatch = DATA_URL_RE.exec(raw);
  if (dataUrlMatch) {
    declaredMime = dataUrlMatch[1];
    base64Body = dataUrlMatch[2].replace(/\s+/g, '');
  } else if (params.mimeTypeHint) {
    declaredMime = params.mimeTypeHint;
    base64Body = raw.replace(/\s+/g, '');
  } else {
    throw new Error('Attachment must be a valid data URL or include a valid MIME type hint');
  }

  const normalizedMime = normalizeAllowedMime(declaredMime);
  if (!normalizedMime) {
    throw new Error(`Unsupported attachment MIME type: "${declaredMime}"`);
  }

  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(base64Body) || base64Body.length === 0) {
    throw new Error('Invalid base64 encoding in attachment payload');
  }

  // Fast pre-check before allocating large Buffers
  const estimatedBytes = Math.floor((base64Body.length * 3) / 4);
  if (estimatedBytes > MAX_ATTACHMENT_BYTES + 4) {
    throw new Error(`Attachment exceeds maximum allowed size of ${MAX_ATTACHMENT_BYTES} bytes`);
  }

  const buffer = Buffer.from(base64Body, 'base64');
  if (buffer.length === 0) {
    throw new Error('Decoded attachment binary is empty');
  }
  if (buffer.length > MAX_ATTACHMENT_BYTES) {
    throw new Error(`Attachment exceeds maximum allowed size of ${MAX_ATTACHMENT_BYTES} bytes`);
  }
  if (!matchesMagicBytes(buffer, normalizedMime)) {
    throw new Error(`Attachment binary signature does not match declared MIME type "${normalizedMime}"`);
  }

  const ext = MIME_TO_EXT[normalizedMime];
  const filename = `${crypto.randomUUID()}.${ext}`;
  const uploadsRoot = getUploadsRootDir(params.uploadsRootDir);
  const projectDir = path.resolve(uploadsRoot, safeProjectId);

  // Strict canonical path confinement check
  if (projectDir !== uploadsRoot && !projectDir.startsWith(uploadsRoot + path.sep)) {
    throw new Error('Resolved project upload directory escapes uploads root');
  }

  fs.mkdirSync(projectDir, { recursive: true });
  const diskPath = path.resolve(projectDir, filename);
  if (!diskPath.startsWith(projectDir + path.sep)) {
    throw new Error('Resolved attachment file path escapes project directory');
  }

  const tmpPath = `${diskPath}.tmp`;
  fs.writeFileSync(tmpPath, buffer);
  fs.renameSync(tmpPath, diskPath);

  return {
    url: `/api/files/${safeProjectId}/${filename}`,
    filename,
    mimeType: normalizedMime,
    sizeBytes: buffer.length,
    diskPath,
  };
}

export interface ExtractAttachmentsOptions {
  uploadsRootDir?: string;
  onError?: (err: Error, fieldPath: string) => void;
}

export interface ExtractAttachmentsSummary {
  extractedCount: number;
  extractedUrls: string[];
}

/**
 * Recursively detects and extracts inline `data:image/...;base64,...`, `data:application/pdf;base64,...`,
 * and `signedScan.dataBase64` payloads inside any incoming record object, writes validated binaries to
 * `/app/uploads/<projectId>/<uuid>.<ext>`, and replaces inline strings in-place with
 * `/api/files/<projectId>/<uuid>.<ext>`.
 */
export function extractAttachmentsInRecord(
  projectId: string,
  record: unknown,
  options?: ExtractAttachmentsOptions,
): ExtractAttachmentsSummary {
  const summary: ExtractAttachmentsSummary = {
    extractedCount: 0,
    extractedUrls: [],
  };

  if (!record || typeof record !== 'object') {
    return summary;
  }

  const visited = new WeakSet<object>();

  const walk = (node: unknown, currentPath: string): void => {
    if (!node || typeof node !== 'object') return;
    if (visited.has(node)) return;
    visited.add(node);

    if (Array.isArray(node)) {
      for (let i = 0; i < node.length; i += 1) {
        const val = node[i];
        const nextPath = `${currentPath}[${i}]`;
        if (typeof val === 'string') {
          if (val.startsWith('data:image/') || val.startsWith('data:application/pdf')) {
            try {
              const saved = saveBase64Attachment({
                projectId,
                base64OrDataUrl: val,
                uploadsRootDir: options?.uploadsRootDir,
              });
              node[i] = saved.url;
              summary.extractedCount += 1;
              summary.extractedUrls.push(saved.url);
            } catch (err) {
              options?.onError?.(err instanceof Error ? err : new Error(String(err)), nextPath);
            }
          }
        } else if (val && typeof val === 'object') {
          walk(val, nextPath);
        }
      }
      return;
    }

    const obj = node as Record<string, unknown>;
    const isSignedScanObject =
      currentPath.endsWith('.signedScan') ||
      currentPath === 'signedScan' ||
      (typeof obj.dataBase64 === 'string' &&
        typeof obj.mimeType === 'string' &&
        typeof obj.fileName === 'string');

    for (const key of Object.keys(obj)) {
      const val = obj[key];
      const nextPath = currentPath ? `${currentPath}.${key}` : key;

      if (typeof val === 'string') {
        const trimmed = val.trim();
        if (!trimmed || isProtectedApiFileUrl(trimmed)) {
          continue;
        }

        if (trimmed.startsWith('data:image/') || trimmed.startsWith('data:application/pdf')) {
          try {
            const saved = saveBase64Attachment({
              projectId,
              base64OrDataUrl: trimmed,
              uploadsRootDir: options?.uploadsRootDir,
            });
            obj[key] = saved.url;
            summary.extractedCount += 1;
            summary.extractedUrls.push(saved.url);
          } catch (err) {
            options?.onError?.(err instanceof Error ? err : new Error(String(err)), nextPath);
          }
          continue;
        }

        // Handle raw base64 stored inside `signedScan.dataBase64` (paired with `signedScan.mimeType`)
        if (isSignedScanObject && key === 'dataBase64') {
          const hint = typeof obj.mimeType === 'string' ? obj.mimeType : '';
          if (normalizeAllowedMime(hint)) {
            try {
              const saved = saveBase64Attachment({
                projectId,
                base64OrDataUrl: trimmed,
                mimeTypeHint: hint,
                uploadsRootDir: options?.uploadsRootDir,
              });
              obj[key] = saved.url;
              summary.extractedCount += 1;
              summary.extractedUrls.push(saved.url);
            } catch (err) {
              options?.onError?.(err instanceof Error ? err : new Error(String(err)), nextPath);
            }
          }
        }
      } else if (val && typeof val === 'object') {
        walk(val, nextPath);
      }
    }
  };

  walk(record, '');
  return summary;
}

export type ResolvedUploadFile =
  | { ok: true; diskPath: string; filename: string; mimeType: string }
  | { ok: false; reason: 'invalid_project' | 'invalid_filename' | 'path_traversal' | 'not_found' };

/**
 * Safely resolves `/api/files/:projectId/:filename` to a verified file inside
 * `<uploadsRoot>/<projectId>/`, preventing directory traversal and symlink escapes.
 */
export function resolveSafeUploadFilePath(
  rawProjectId: string,
  rawFilename: string,
  uploadsRootDir?: string,
): ResolvedUploadFile {
  const safeProjectId = sanitizeUploadProjectId(rawProjectId);
  if (!safeProjectId) {
    return { ok: false, reason: 'invalid_project' };
  }

  const cleanFilename = String(rawFilename || '').trim();
  if (
    !cleanFilename ||
    cleanFilename.includes('/') ||
    cleanFilename.includes('\\') ||
    cleanFilename.includes('..') ||
    cleanFilename.includes('\0') ||
    !isValidUploadedFilename(cleanFilename)
  ) {
    return { ok: false, reason: 'invalid_filename' };
  }

  const uploadsRoot = getUploadsRootDir(uploadsRootDir);
  const projectDir = path.resolve(uploadsRoot, safeProjectId);
  if (!projectDir.startsWith(uploadsRoot + path.sep)) {
    return { ok: false, reason: 'path_traversal' };
  }

  const candidatePath = path.resolve(projectDir, cleanFilename);
  if (!candidatePath.startsWith(projectDir + path.sep)) {
    return { ok: false, reason: 'path_traversal' };
  }

  if (!fs.existsSync(candidatePath)) {
    return { ok: false, reason: 'not_found' };
  }

  let realProjectDir: string;
  let realFilePath: string;
  try {
    realProjectDir = fs.realpathSync(projectDir);
    realFilePath = fs.realpathSync(candidatePath);
  } catch {
    return { ok: false, reason: 'not_found' };
  }

  if (!realFilePath.startsWith(realProjectDir + path.sep)) {
    return { ok: false, reason: 'path_traversal' };
  }

  let stat: fs.Stats;
  try {
    stat = fs.statSync(realFilePath);
  } catch {
    return { ok: false, reason: 'not_found' };
  }

  if (!stat.isFile()) {
    return { ok: false, reason: 'not_found' };
  }

  const ext = path.extname(cleanFilename).slice(1).toLowerCase();
  const mimeType = EXT_TO_MIME[ext];
  if (!mimeType) {
    return { ok: false, reason: 'invalid_filename' };
  }

  return {
    ok: true,
    diskPath: realFilePath,
    filename: cleanFilename,
    mimeType,
  };
}
