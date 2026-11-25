import { resolvePublicAssetUrl } from './assets.ts';
import { BUILT_IN_EMPLOYERS } from '../shared/employers.ts';

const LOGO_CACHE_STORAGE_KEY = 'samaan_offline_employer_logos_v1';

const memoryCache = new Map<string, string>();
let storageLoaded = false;

function loadCacheFromStorage(): void {
  if (storageLoaded) return;
  storageLoaded = true;
  if (typeof localStorage === 'undefined') return;
  try {
    const raw = localStorage.getItem(LOGO_CACHE_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Record<string, string>;
    if (parsed && typeof parsed === 'object') {
      for (const [key, val] of Object.entries(parsed)) {
        if (typeof val === 'string' && val.startsWith('data:image/')) {
          memoryCache.set(key, val);
        }
      }
    }
  } catch {
    // Ignore storage parse errors
  }
}

function persistCacheToStorage(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const obj: Record<string, string> = {};
    for (const [k, v] of memoryCache.entries()) {
      obj[k] = v;
    }
    localStorage.setItem(LOGO_CACHE_STORAGE_KEY, JSON.stringify(obj));
  } catch {
    // Quota exceeded or private mode — keep in-memory cache
  }
}

function normalizeCacheKey(rawUrl: string): string {
  const clean = (rawUrl || '').trim();
  if (!clean) return '';
  return clean.replace(/^\.\//, '').replace(/^\//, '');
}

/**
 * Resolves any employer logo URL (data:image/... OR built-in ./assets/aistudio/...):
 * - Custom uploaded data URLs are returned verbatim (always offline-safe).
 * - Built-in asset URLs check the offline base64 cache first, falling back to resolvePublicAssetUrl().
 */
export function resolveEmployerLogoSrc(rawUrl: string | undefined | null): string {
  const clean = (rawUrl || '').trim();
  if (!clean) return '';
  if (clean.startsWith('data:image/')) return clean;

  loadCacheFromStorage();
  const key = normalizeCacheKey(clean);
  const cached = memoryCache.get(key);
  if (cached) return cached;

  return resolvePublicAssetUrl(clean);
}

/**
 * Eagerly fetches and caches built-in employer logo assets as base64 data URLs in localStorage
 * whenever online, guaranteeing instant offline display even if CacheStorage is purged on mobile/iOS.
 */
export async function warmBuiltInEmployerLogosCache(): Promise<void> {
  if (typeof window === 'undefined' || typeof fetch === 'undefined') return;
  loadCacheFromStorage();

  const urls = new Set<string>();
  for (const emp of BUILT_IN_EMPLOYERS) {
    for (const logo of emp.logos) {
      if (logo.dataUrl && !logo.dataUrl.startsWith('data:image/')) {
        urls.add(logo.dataUrl);
      }
    }
  }

  let updated = false;
  await Promise.all(
    Array.from(urls).map(async (rawUrl) => {
      const key = normalizeCacheKey(rawUrl);
      if (!key || memoryCache.has(key)) return;
      try {
        const resolved = resolvePublicAssetUrl(rawUrl);
        const res = await fetch(resolved, { cache: 'force-cache' });
        if (!res.ok) return;
        const blob = await res.blob();
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
          reader.onerror = () => reject(new Error('FileReader failed'));
          reader.readAsDataURL(blob);
        });
        if (dataUrl.startsWith('data:image/')) {
          memoryCache.set(key, dataUrl);
          updated = true;
        }
      } catch {
        // Offline or transient fetch failure — will retry next online load
      }
    }),
  );

  if (updated) {
    persistCacheToStorage();
  }
}
