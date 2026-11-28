import { useEffect, useState } from 'react';
import { getActiveProjectId } from './api.ts';

const PROTECTED_API_FILE_URL_RE =
  /^\/api\/files\/[a-z0-9_-]{1,80}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|pdf)$/i;

/**
 * Returns true if the URL points to an authenticated server attachment under `/api/files/:projectId/:filename`.
 */
export function isProtectedApiFileUrl(value: string | null | undefined): boolean {
  if (typeof value !== 'string') return false;
  return PROTECTED_API_FILE_URL_RE.test(value.trim());
}

/**
 * Fetches a protected binary attachment (`/api/files/:projectId/:filename`) using an authenticated
 * request (`credentials: 'same-origin'` + `X-Samaan-Project` header) and returns a `Blob`.
 * Works seamlessly both with current session cookies and upcoming HttpOnly cookie auth upgrades.
 */
export async function fetchAuthenticatedMediaBlob(
  url: string,
  options?: {
    signal?: AbortSignal;
    mimeTypeHint?: string;
    fetchImpl?: typeof fetch;
  },
): Promise<Blob> {
  const cleanUrl = String(url || '').trim();
  if (!isProtectedApiFileUrl(cleanUrl)) {
    throw new Error('Refusing to fetch non-protected or invalid attachment URL');
  }

  const doFetch = options?.fetchImpl || fetch;
  const response = await doFetch(cleanUrl, {
    method: 'GET',
    credentials: 'same-origin',
    headers: {
      'X-Samaan-Project': getActiveProjectId(),
    },
    signal: options?.signal,
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch protected media (${response.status})`);
  }

  const blob = await response.blob();
  if (!blob.type && options?.mimeTypeHint) {
    return new Blob([blob], { type: options.mimeTypeHint });
  }
  return blob;
}

/**
 * React hook that resolves an image/attachment source safely:
 * - For protected `/api/files/:projectId/:filename` URLs: fetches via authenticated `fetch`,
 *   converts to a Blob Object URL, and guarantees `URL.revokeObjectURL` cleanup on change or unmount.
 * - For legacy `data:image/...` or static `./assets/...` URLs: passes through immediately without extra network calls.
 */
export function useAuthenticatedMediaUrl(src: string | null | undefined): {
  url: string;
  loading: boolean;
  error: boolean;
} {
  const trimmed = typeof src === 'string' ? src.trim() : '';
  const isProtected = isProtectedApiFileUrl(trimmed);

  const [state, setState] = useState<{
    url: string;
    loading: boolean;
    error: boolean;
  }>(() => ({
    url: isProtected ? '' : trimmed,
    loading: isProtected,
    error: false,
  }));

  useEffect(() => {
    if (!trimmed) {
      setState({ url: '', loading: false, error: false });
      return;
    }

    if (!isProtectedApiFileUrl(trimmed)) {
      setState({ url: trimmed, loading: false, error: false });
      return;
    }

    let active = true;
    let objectUrl: string | null = null;
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;

    setState({ url: '', loading: true, error: false });

    fetchAuthenticatedMediaBlob(trimmed, { signal: controller?.signal })
      .then((blob) => {
        const nextUrl = URL.createObjectURL(blob);
        if (!active) {
          URL.revokeObjectURL(nextUrl);
          return;
        }
        objectUrl = nextUrl;
        setState({ url: nextUrl, loading: false, error: false });
      })
      .catch(() => {
        if (!active) return;
        setState({ url: '', loading: false, error: true });
      });

    return () => {
      active = false;
      if (controller) {
        controller.abort();
      }
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [trimmed]);

  return state;
}
