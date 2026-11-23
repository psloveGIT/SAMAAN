const rawBase = import.meta.env.BASE_URL || './';
const normalizedBase = rawBase.endsWith('/') ? rawBase : `${rawBase}/`;

export const MD1_STACKED_LOGO = `${normalizedBase}assets/aistudio/______________________________65f1164c.png`;

export function resolvePublicAssetUrl(url: string): string {
  const trimmed = (url || '').trim();
  if (!trimmed) return '';
  if (
    trimmed.startsWith('data:') ||
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('/')
  ) {
    return trimmed;
  }
  const cleanRel = trimmed.replace(/^\.\//, '');
  return `${normalizedBase}${cleanRel}`;
}
