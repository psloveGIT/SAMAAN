import React from 'react';
import { useAuthenticatedMediaUrl } from '../lib/authMedia.ts';

export interface AuthMediaImageProps
  extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src'> {
  src?: string | null;
}

/**
 * Drop-in `<img>` wrapper that loads protected `/api/files/:projectId/:filename` attachments
 * through authenticated `fetch` -> `Blob` Object URL with automatic `URL.revokeObjectURL` cleanup,
 * while passing legacy `data:image/...` and static `./assets/...` sources straight through.
 */
export const AuthMediaImage: React.FC<AuthMediaImageProps> = ({
  src,
  alt = '',
  className,
  ...rest
}) => {
  const { url, loading } = useAuthenticatedMediaUrl(src);

  if (!url) {
    return (
      <span
        role="img"
        aria-label={alt}
        className={`block bg-[var(--bg-subtle)] ${loading ? 'animate-pulse' : ''} ${className || ''}`}
      />
    );
  }

  return <img src={url} alt={alt} className={className} {...rest} />;
};
