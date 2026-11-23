import type { ThemeMode } from './types.ts';

export interface DocumentThemeMeta {
  /** Uses 'only light' / 'only dark' to block Android Chrome/WebView/Samsung/HyperOS Force-Dark inversion. */
  colorScheme: 'only light' | 'only dark';
  /** Synchronized Android/iOS browser status bar & PWA toolbar theme-color. */
  themeColor: string;
  /** Explicit canvas background color matching CSS variables. */
  backgroundColor: string;
  isDark: boolean;
  isEyeComfort: boolean;
}

export function resolveDocumentThemeMeta(
  theme: ThemeMode,
  eyeComfort: boolean,
): DocumentThemeMeta {
  const isDark = theme === 'dark';
  const isEyeComfort = Boolean(eyeComfort);

  if (isDark && isEyeComfort) {
    return {
      colorScheme: 'only dark',
      themeColor: '#171410',
      backgroundColor: '#171410',
      isDark: true,
      isEyeComfort: true,
    };
  }
  if (isDark) {
    return {
      colorScheme: 'only dark',
      themeColor: '#0b111b',
      backgroundColor: '#0b111b',
      isDark: true,
      isEyeComfort: false,
    };
  }
  if (isEyeComfort) {
    return {
      colorScheme: 'only light',
      themeColor: '#f5efe3',
      backgroundColor: '#f5efe3',
      isDark: false,
      isEyeComfort: true,
    };
  }
  return {
    colorScheme: 'only light',
    themeColor: '#ffffff',
    backgroundColor: '#f8fafc',
    isDark: false,
    isEyeComfort: false,
  };
}

export function upsertHeadMeta(name: string, content: string): void {
  if (typeof document === 'undefined' || !document.head) return;
  let el = document.head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute('name', name);
    document.head.appendChild(el);
  }
  if (el.getAttribute('content') !== content) {
    el.setAttribute('content', content);
  }
}

export function applyThemeMetaToDocument(theme: ThemeMode, eyeComfort: boolean): DocumentThemeMeta {
  const meta = resolveDocumentThemeMeta(theme, eyeComfort);
  if (typeof document !== 'undefined') {
    const root = document.documentElement;
    root.classList.toggle('dark', meta.isDark);
    root.classList.toggle('eye-comfort', meta.isEyeComfort);
    root.dataset.theme = meta.isDark ? 'dark' : 'light';
    root.style.colorScheme = meta.colorScheme;
    if (document.body) {
      document.body.style.colorScheme = meta.colorScheme;
    }
    upsertHeadMeta('color-scheme', meta.colorScheme);
    upsertHeadMeta('theme-color', meta.themeColor);
  }
  return meta;
}
