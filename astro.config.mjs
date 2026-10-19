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
import { tableScope } from './src/plugins/table-scope.mjs';
import { postFigure } from './src/plugins/post-figure.mjs';
import { MARKDOWN_WIDTHS } from './src/lib/image-densities.ts';
import { cssColorToken } from './src/lib/css-token.ts';
import { recordFingerprint } from './scripts/build-fingerprint.mjs';
import { licenses } from './scripts/licenses.mjs';
import { presenter } from './src/presenter/integration.mjs';
import { SITE_CONFIG } from './src/site.config.ts';
import { BUILD_ENV, BUILD_ENV_NAMES } from './src/lib/build-env.ts';
import { staleStatementGuard } from './scripts/stale-statement.mjs';
import { noindex } from './scripts/noindex.mjs';
import { placeholderSite } from './scripts/placeholder-site.mjs';
import {
  isAdvertised,
  lastmodFor,
  readPosts,
} from './src/lib/sitemap-filter.ts';

/*
 * `astro build` syncs through a dev server that leaves plugin-vue's
 * `devServer` set, so SFC templates compile non-inline in production.
 * `post` runs this after plugin-vue's own `configResolved` copies its options.
 * tests/client-chunks.spec.ts fails if the clear stops working.
 */
const inlineVueTemplates = () => ({
  name: 'inline-vue-templates',
  enforce: /** @type {const} */ ('post'),
  configResolved(/** @type {import('vite').ResolvedConfig} */ config) {
    if (config.command !== 'build') return;
    const vuePlugin = config.plugins.find(
      (plugin) => plugin.name === 'vite:vue',
    );
    if (!vuePlugin?.api?.options) {
      throw new Error(
        'inline-vue-templates: @vitejs/plugin-vue no longer exposes api.options.',
      );
    }
    vuePlugin.api.options.devServer = undefined;
  },
});

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
 * The floor in ARCHITECTURE.md > Browser support, pinned so it cannot move with
 * Vite. Not `browserslist`: Tailwind 4 ignores it. tests/css-target.spec.ts.
 */
const CSS_TARGET = ['chrome120', 'edge120', 'firefox128', 'safari17', 'ios17'];

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
    placeholderSite(SITE_CONFIG.site.url),
    recordFingerprint(),
    licenses(),
    presenter(),
    staleStatementGuard(SITE_CONFIG.site.url, SITE_CONFIG.site.repository),
    /* Every component uses <script setup>. */
    vue({ features: { optionsAPI: false } }),
    /*
     * `sitemap-index.xml` must match BaseLayout and robots.txt:
     * tests/sitemap.spec.ts. The integration drops /404 itself.
     */
    BUILD_ENV.noindex
      ? noindex()
      : sitemap({
          filter: (page) => isAdvertised(page, posts),

          /* Config time: `getCollection` is unavailable, so frontmatter is read. */
          serialize: (item) => {
            const lastmod = lastmodFor(item.url, posts);
            return lastmod ? { ...item, lastmod } : item;
          },
        }),
  ],

  /* Only images with a `layout` read this: those post-figure.mjs marks. */
  image: { breakpoints: MARKDOWN_WIDTHS },

  markdown: {
    /*
     * Shiki's inline styles are blocked by the CSP's `style-src`; Prism would
     * need a syntax palette the design system does not have.
     */
    syntaxHighlight: false,
    processor: satteri({
      hastPlugins: [linkListItem, postFigure, codeBlock, tableScope],
    }),
  },

  vite: {
    environments: {
      /*
       * @astrojs/cloudflare 14.3.3 sets a `process` shim banner for the server in
       * astro:build:setup, and it leaks into every browser chunk (51 bytes each):
       * https://github.com/withastro/astro/blob/%40astrojs/cloudflare%4014.3.3/packages/integrations/cloudflare/src/index.ts#L668
       */
      client: { build: { rolldownOptions: { output: { banner: '' } } } },
      /* The on-demand bundle; src/lib/person-image.ts reads it. */
      ssr: { define: { __PRERENDERED__: 'false' } },
    },
    plugins: [tailwindcss(), inlineVueTemplates()],
    define: {
      __VIDEO_SIZES__: JSON.stringify(videoSizes),
      __THEME_COLOR__: JSON.stringify(themeColor),
      __PRERENDERED__: 'true',
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
