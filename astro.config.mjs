// @ts-check
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig } from 'astro/config';

import cloudflare from '@astrojs/cloudflare';
import sitemap from '@astrojs/sitemap';
import vue from '@astrojs/vue';
import tailwindcss from '@tailwindcss/vite';
import { satteri } from '@astrojs/markdown-satteri';

import { linkListItem } from './src/plugins/link-list-item.mjs';
import { codeBlock } from './src/plugins/code-block.mjs';
import { postFigure } from './src/plugins/post-figure.mjs';
import { WIDTHS } from './src/lib/image-densities.ts';
import { cssColorToken } from './src/lib/css-token.ts';
import { recordFingerprint } from './scripts/build-fingerprint.mjs';
import { licenses } from './scripts/licenses.mjs';
import { presenter } from './src/presenter/integration.mjs';
import { SITE_CONFIG } from './src/site.config.ts';
import { BUILD_ENV_NAMES } from './src/lib/build-env.ts';
import {
  isAdvertised,
  lastmodFor,
  readPosts,
} from './src/lib/sitemap-filter.ts';

const VIDEO_DIR = 'public/videos';
const VIDEO_URL_PREFIX = '/videos/';

/* For src/lib/video-range.ts: ASSETS streams without a Content-Length. */
const videoSizes = existsSync(VIDEO_DIR)
  ? Object.fromEntries(
      readdirSync(VIDEO_DIR).map((file) => [
        `${VIDEO_URL_PREFIX}${file}`,
        statSync(join(VIDEO_DIR, file)).size,
      ]),
    )
  : {};

const posts = readPosts();

/* Resolved here so a `?raw` stylesheet import never reaches the Worker. */
const themeColor = cssColorToken('--color-background');

/*
 * Baseline Widely Available as of Vite 8.2.2, pinned so it cannot move with
 * Vite. Not `browserslist`: Tailwind 4 ignores it. tests/css-target.spec.ts.
 */
const CSS_TARGET = [
  'chrome111',
  'edge111',
  'firefox114',
  'safari16.4',
  'ios16.4',
];

/* Clear of the test ports, which tests/ports.ts derives in 20000 to 29999. */
const LOCAL_SERVER_PORT = 4340;

export default defineConfig({
  site: SITE_CONFIG.site.url,

  server: { port: LOCAL_SERVER_PORT },

  /* On-demand routes must also be in wrangler.jsonc `run_worker_first`. */
  output: 'static',

  /* The default warning lets a post named like a category vanish silently. */
  prerenderConflictBehavior: 'error',

  /* Prerendering in workerd fails: pages read files at build time. */
  adapter: cloudflare({
    prerenderEnvironment: 'node',

    /*
     * The default `cloudflare-binding` ships every image at master size.
     * No test checks bytes.
     */
    imageService: { build: 'compile' },
  }),
  /* Sessions set a cookie; /privacy claims none: tests/privacy.spec.ts. */
  session: false,

  /*
   * No `trailingSlash: 'always'`: `astro preview` then 404s `/about`. Links
   * carry the slash instead: tests/seo.spec.ts.
   */
  integrations: [
    recordFingerprint(),
    licenses(),
    presenter(),
    /* Every component uses <script setup>. */
    vue({ features: { optionsAPI: false } }),
    /*
     * `sitemap-index.xml` must match BaseLayout and robots.txt:
     * tests/sitemap.spec.ts. The integration drops /404 itself.
     */
    sitemap({
      filter: (page) => isAdvertised(page, posts),

      /* Config time: `getCollection` is unavailable, so frontmatter is read. */
      serialize: (item) => {
        const lastmod = lastmodFor(item.url, posts);
        return lastmod ? { ...item, lastmod } : item;
      },
    }),
  ],

  /* Only images with a `layout` read this: those post-figure.mjs marks. */
  image: { breakpoints: WIDTHS },

  markdown: {
    /*
     * Shiki's inline styles are blocked by the CSP's `style-src`; Prism would
     * need a syntax palette the design system does not have.
     */
    syntaxHighlight: false,
    processor: satteri({ hastPlugins: [linkListItem, postFigure, codeBlock] }),
  },

  vite: {
    plugins: [tailwindcss()],
    define: {
      __VIDEO_SIZES__: JSON.stringify(videoSizes),
      __THEME_COLOR__: JSON.stringify(themeColor),
      /* src/lib/build-env.ts reads these; the Worker has no `process`. */
      ...Object.fromEntries(
        BUILD_ENV_NAMES.map((name) => [
          `process.env.${name}`,
          JSON.stringify(process.env[name] ?? ''),
        ]),
      ),
    },
    build: {
      cssTarget: CSS_TARGET,
      /* Inlined scripts and data: URIs would each need a CSP exception. */
      assetsInlineLimit: 0,
      /* Coverage builds only: a deployed map would publish the source. */
      sourcemap: process.env.COVERAGE === '1',
    },
  },
});
