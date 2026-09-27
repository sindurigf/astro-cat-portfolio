import type { APIRoute } from 'astro';
import { SITE_NAME, SITE_SHORT_NAME } from '../lib/site';
import { themeColor } from '../lib/theme-color';

/*
 * Generated, not the icon pack's static file: its hardcoded gold disagrees
 * with `<meta name="theme-color">` and sits outside scripts/check-tokens.mjs.
 */

const MANIFEST = {
  name: SITE_NAME,
  short_name: SITE_SHORT_NAME,
  start_url: '/',
  display: 'standalone',
  theme_color: themeColor,
  background_color: themeColor,
  icons: [
    {
      src: '/android-chrome-192x192.png',
      sizes: '192x192',
      type: 'image/png',
    },
    {
      src: '/android-chrome-512x512.png',
      sizes: '512x512',
      type: 'image/png',
    },
    /* Separate entry, not `purpose: 'any maskable'`: the padded artwork would draw too small unmasked. */
    {
      src: '/maskable-icon-512x512.png',
      sizes: '512x512',
      type: 'image/png',
      purpose: 'maskable',
    },
  ],
};

export const GET: APIRoute = () =>
  new Response(JSON.stringify(MANIFEST, null, 2), {
    headers: {
      'Content-Type': 'application/manifest+json; charset=utf-8',
    },
  });
