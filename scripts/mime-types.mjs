/**
 * Content types for every file the build emits, for the test servers.
 * tests/headers-rules.spec.ts fails on an emitted extension missing here.
 */
export const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  /* Pages use WebP; Open Graph cards are PNG and JPEG (src/lib/og-image.ts). */
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  /* Emitted only by the coverage build; see playwright.coverage.config.ts. */
  '.map': 'application/json; charset=utf-8',
  /* No `charset`: it would override the XML prolog's encoding declaration. */
  '.xml': 'application/xml',
  /* For public/videos/. Unverified against the edge; `check:live` does not read these. */
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.vtt': 'text/vtt; charset=utf-8',
};
