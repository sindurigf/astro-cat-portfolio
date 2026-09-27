import type { ImageOutputFormat } from 'astro';

/**
 * AVIF where the browser takes it, the WebP `<img>` everywhere else.
 * Markdown post images are WebP only: ARCHITECTURE.md#photos-and-video.
 */
export const PHOTO_FORMATS: {
  formats: ImageOutputFormat[];
  fallbackFormat: ImageOutputFormat;
} = {
  formats: ['avif'],
  fallbackFormat: 'webp',
};
