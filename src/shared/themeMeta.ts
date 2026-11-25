import type { ThemeMode } from './types.ts';

export interface DocumentThemeMeta {
  /** CSS color-scheme property value ('only light' / 'only dark'). */
  colorScheme: 'only light' | 'only dark';
  /** HTML <meta name="color-scheme"> content ('light only' / 'dark only' — strictly required by HTML spec & Samsung Internet / Chromium Force Dark). */
  metaColorScheme: 'light only' | 'dark only';
  /** Synchronized Android/iOS browser status bar & PWA toolbar theme-color. */
  themeColor: string;
  /** Explicit canvas background color matching CSS variables. */
  backgroundColor: string;
  /** Explicit primary foreground ink color. */
  textColor: string;
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
      metaColorScheme: 'dark only',
      themeColor: '#171410',
      backgroundColor: '#171410',
      textColor: '#f3ebd8',
      isDark: true,
      isEyeComfort: true,
    };
  }
  if (isDark) {
    return {
      colorScheme: 'only dark',
      metaColorScheme: 'dark only',
      themeColor: '#0b111b',
      backgroundColor: '#0b111b',
      textColor: '#e6edf6',
      isDark: true,
      isEyeComfort: false,
    };
  }
  if (isEyeComfort) {
    return {
      colorScheme: 'only light',
      metaColorScheme: 'light only',
      themeColor: '#f5efe3',
      backgroundColor: '#f5efe3',
      textColor: '#2c251c',
      isDark: false,
      isEyeComfort: true,
    };
  }
  return {
    colorScheme: 'only light',
    metaColorScheme: 'light only',
    themeColor: '#ffffff',
    backgroundColor: '#f8fafc',
    textColor: '#0f172a',
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
    root.classList.toggle('light', !meta.isDark);
    root.classList.toggle('eye-comfort', meta.isEyeComfort);
    root.dataset.theme = meta.isDark ? 'dark' : 'light';
    root.style.colorScheme = meta.colorScheme;
    root.style.backgroundColor = meta.backgroundColor;
    root.style.color = meta.textColor;
    if (document.body) {
      document.body.style.colorScheme = meta.colorScheme;
      document.body.style.backgroundColor = meta.backgroundColor;
      document.body.style.color = meta.textColor;
    }
    upsertHeadMeta('color-scheme', meta.metaColorScheme);
    upsertHeadMeta('supported-color-schemes', meta.metaColorScheme);
    upsertHeadMeta('theme-color', meta.themeColor);
  }
  return meta;
}
