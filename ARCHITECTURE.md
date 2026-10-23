# Architecture

Stack, site config, token mechanics, content, assets, headers and test
conventions for this template. Design rules and values are in
[docs/STYLEGUIDE.md](docs/STYLEGUIDE.md).

## Stack

| Concern     | Choice                                                                                  |
| ----------- | --------------------------------------------------------------------------------------- |
| Framework   | Astro 7, static output; `/contact/send/` renders on demand in the Worker                |
| Interactive | Vue 3 via `@astrojs/vue`, islands only (the homepage canvas hero and the About cats)    |
| Scripts     | Plain modules for everything that is not an island                                      |
| Styling     | Tailwind CSS 4 via `@tailwindcss/vite`                                                  |
| Language    | TypeScript, `astro/tsconfigs/strictest`, checked with `astro check` and `vue-tsc`       |
| Content     | Astro Content Collections, Markdown in repo, rendered by Sätteri                        |
| Font        | Lexend, self-hosted through Fontsource                                                  |
| Hosting     | Cloudflare Workers static assets, D1 (EU), Rate Limiting, Email Routing, Workers Builds |
| Tests       | Playwright in Chromium, Firefox and WebKit, with axe-core for WCAG 2.2 AA               |
| Runtime     | Node.js from `.nvmrc`                                                                   |

- Vue runs with `features: { optionsAPI: false }`; every component uses
  `<script setup>`.
- No `trailingSlash` in `astro.config.mjs`: `'always'` makes `astro preview`
  404 on `/about`.
- No `tailwind.config.mjs`. Tokens live in the `@theme static` block in
  `src/styles/global.css`. `static` keeps tokens that no utility references;
  plain `@theme` tree-shakes them and `var(--color-…)` resolves to nothing.
- `global.css` holds the Tailwind import, fonts, `@source` and `@theme`, which
  the scripts read, then imports the partials in cascade order: `base.css`,
  `components/*.css` by area with `reduced-motion.css` among them,
  `utilities.css`, `light-mode.css`. Reordering the imports reorders the
  cascade.
- Page-only partials are not in that list: `slides.css` (the talk page and the
  presenter), `about-cats.css` (`/about`) and `not-found.css` (`/404`) are
  imported by the page that uses them, so each builds as its own sheet, linked
  after the shared one. Each opens with `@reference '../global.css'` so
  `@apply` and the tokens resolve; Tailwind then writes token values as `var()`
  fallbacks and repeats its `@property` block in that sheet.
  `tests/head.spec.ts` holds the link order, which sets the layer order, and
  `check:classes` fails a page that uses a class from a sheet it does not link.
- `@astrojs/tailwind` peers at `astro ^3 || ^4 || ^5` and cannot be used.
- `overrides.sharp` in `package.json` lifts miniflare's exact `sharp@0.35.4`
  pin to 0.35.5, the fix for GHSA-wq5f-xc86-pv6w. Drop it once miniflare
  depends on 0.35.5 or later.
- Collection config is `src/content.config.ts` with `glob()` loaders.

## Site config

`src/site.config.ts` holds everything that names the site or its owner. It is
validated on import, so a bad value fails the build and the tests.

| Key                          | Used by                                                                                                                               |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `site.name`, `shortName`     | Titles, header wordmark, feeds, manifest, footer copyright                                                                            |
| `site.url`                   | `site` in `astro.config.mjs`: canonicals, sitemap, feeds, JSON-LD                                                                     |
| `site.locale`                | `<html lang>`, `og:locale`, JSON-LD `inLanguage`, the feed `<language>`                                                               |
| `site.tagline`               | The default share image and its alt text                                                                                              |
| `site.motto`                 | Homepage stickers, the footer name and `/about`, marked with its `lang`; `meaning` gives `/about`'s "Latin for …" line, null omits it |
| `site.firstPublished`        | The footer copyright year                                                                                                             |
| `site.repository`            | `/accessibility`'s link to the full statement                                                                                         |
| `person.*`                   | Homepage `<h1>` (one name per line), JSON-LD `Person`, contact address, CV                                                            |
| `profiles`                   | Footer tiles and JSON-LD `sameAs`; each label needs an icon                                                                           |
| `journeyPost`                | The close row of `/about`, `/career`, `/contact/sent`; must name a published post, or `null`                                          |
| `analytics`                  | `null` loads no tracker; an Umami website id turns it on ([Umami](docs/DEPLOYMENT.md#umami))                                          |
| `bingSiteVerification`       | `null` adds no tag; a [Bing](docs/DEPLOYMENT.md#bing-webmaster-tools) code adds one to `/`                                            |
| `contact.form`               | `cloudflare-d1` (the form) or `none` (email only)                                                                                     |
| `contact.notificationSender` | Must equal `allowed_sender_addresses` in `wrangler.jsonc`                                                                             |
| `accessibility.responseDays` | The reply aim on `/accessibility`, in whole days                                                                                      |

- Libraries re-export these as constants (`src/lib/site.ts`, `profiles.ts`,
  `contact.ts`, `analytics-site.ts`, `site-language.ts`); `og-image.ts` and
  `contact-notification.ts` read the config directly. Other code imports
  those, not the config.
- The browser bundle never imports the config: the click tracker reads
  `analytics.ts`, which does not.
- Tests read the same constants, and the ones for analytics, the contact form,
  the journey post and the CV skip when the feature is off.

## Browser support

Chrome 120, Edge 120, Firefox 128, Safari 17, iOS Safari 17 (the floor
`/accessibility` states). Set once as `CSS_TARGET` in `astro.config.mjs` and
passed to `vite.build.cssTarget`.

- Firefox 128 is Tailwind 4's own floor
  ([compatibility](https://tailwindcss.com/docs/compatibility)).
- Chrome, Edge and Safari are set by two features in use (versions from
  `@mdn/browser-compat-data`, an external source, not a dependency):
  `popover`, for the About cats' trick list and every abbreviation (Chrome
  114, Firefox 125, Safari 17), and `@media (scripting: none)`, without which
  the no-JavaScript nav is not shown (Chrome 120, Safari 17). `:has()`
  (Firefox 121) and ARIA reflection (Firefox 119) are inside the floor.
- Pinned, not left to the bundler default, which moves between releases.
- No `browserslist` key: neither Tailwind 4 nor Vite reads it.
- `tests/css-target.spec.ts` asserts the list and the prefixes it implies
  (`-webkit-text-decoration`) in the built CSS. No engine in the suite runs at
  the floor, so this is the only cover.

## Design system

Every visual rule, token and value is in [docs/STYLEGUIDE.md](docs/STYLEGUIDE.md).
This section keeps the mechanisms.

### Blocks

Rules: [STYLEGUIDE Color tokens](docs/STYLEGUIDE.md#color-tokens).

- `src/styles/components/cards.css` remaps the color tokens on each block, as
  light mode does on `<main>`, so utilities inside read on its fill.
- A fill that must stay gold inside a block uses `bg-block-gold`, a fixed token
  that is never remapped.
- The Step's offsets are `--step-x` and `--step-y` in `global.css`; juts are
  translates or margins, so no page scrolls sideways (`tests/blocks.spec.ts`).
- `src/lib/wall.ts` turns a wall's rows per breakpoint into `card-rise-*` and
  `card-step-*` classes; the wall's `drop-shadow` follows the stepped outline.

### Light mode

Dark is the default. Colors and rules:
[STYLEGUIDE Light mode](docs/STYLEGUIDE.md#light-mode).

- `data-theme="light"` on `<html>`; `src/styles/light-mode.css`, imported last,
  overrides a subset of tokens on `<main>`, the header and the footer while it
  is set. No `dark:` variants.
- `<main>`, the header and the footer change; the header bar stays gold and
  its throw turns ink. The no-JS nav stays dark.
- `mark` and `tile-edge` hold the mode-independent logo-tile colors.
- An inline script in `BaseLayout.astro`'s `<head>` sets `data-theme` from the
  saved choice or `prefers-color-scheme` before the body parses, and adds the
  `js` class the slideshow's pre-hide keys on. After `DECK_READY_TIMEOUT_MS` it
  sets `data-deck-failed` on a deck that is not ready, and the deck then shows
  every slide. Its hash is in `script-src`.
  It sits in `<head>`, not beside the switch, so nothing paints in the wrong
  theme first.
- Three choices: System (the default, nothing stored), Light and Dark (stored
  as `light` or `dark` under `THEME_STORAGE_KEY` in `src/lib/theme.ts`).
  `data-theme` always holds the resolved `light` or `dark`.
- `src/components/ThemeSwitch.astro` is a 44px `<button popovertarget>` named
  "Theme" showing the theme in use, and a popover with a "Theme" `<fieldset>`
  of three native radios. Its `id` prop names the popover and the radio group,
  so two on a page do not clash.
- `src/scripts/theme-switch.ts` applies a choice at once, removes the key for
  System, keeps every menu's radios in step, and follows a
  `prefers-color-scheme` change while System is chosen. It places the popover
  beside its button, toward the larger side of the viewport, and closes it
  when focus leaves.
- Without JavaScript the page is dark and the switch hidden; without popovers
  the switch is hidden and the page follows the system.
- `HeroField.vue` (through `use-hero-field.ts`) reads its palette from its own element and rebuilds when a
  `MutationObserver` sees `data-theme` change. Its ground is `hero-ground`.
  A `(resolution)` media query resizes its canvases when only the pixel ratio
  changes; in forced colors it is hidden (`tests/hero-media.spec.ts`).
- `AboutCats.vue` needs neither: its SVG parts carry classes, and
  `about-cats.css` maps them to tokens, so the cats follow the theme in CSS.
- `playwright.config.ts` sets `colorScheme: 'dark'`; specs that measure light
  set `colorScheme: 'light'` themselves (`light-mode.spec.ts`, `focus.spec.ts`,
  `states.spec.ts`, `about-cats.spec.ts`, the talk scan in `a11y.spec.ts`).

### Token enforcement

`scripts/check-tokens.mjs` scans `src/` (comments ignored) and fails on:

- any Tailwind arbitrary value
- a raw hex outside `global.css`; `rgb()`, `rgba()`, `hsl()` or `hsla()`
  outside `@theme`
- px, rem or em in a declaration outside `@theme` (media conditions and zero
  allowed)
- spacing utilities off the 0, 1, 2, 3, 4, 6, 8, 12, 16, 24 scale
- border widths other than 0, 4, 8 (a bare `border` included)
- radius other than `rounded-full`, `rounded-none`
- weights other than `font-normal`, `font-black`; Tailwind's own sizes,
  leading or tracking (`leading-none`, `tracking-normal` allowed)
- a removed outline
- an inline `style` attribute in a component
- a grid column count or split other than those in
  [STYLEGUIDE Grid](docs/STYLEGUIDE.md#grid)

`EXCEPTIONS` lists false positives, each with its reason, and fails when one
no longer matches.

Headings, alt text, focus rings and axe are checked on the rendered page by
`tests/headings.spec.ts`, `tests/alt-text.spec.ts`, `tests/focus.spec.ts` and
`tests/a11y.spec.ts`.

### Design reference

- Colors: [Color tokens](docs/STYLEGUIDE.md#color-tokens),
  [Contrast](docs/STYLEGUIDE.md#contrast),
  [Gold surface](docs/STYLEGUIDE.md#gold-surface).
- Typography: [Type scale](docs/STYLEGUIDE.md#type-scale),
  [Heading floors](docs/STYLEGUIDE.md#heading-floors),
  [Uppercase](docs/STYLEGUIDE.md#uppercase),
  [Soft hyphens](docs/STYLEGUIDE.md#soft-hyphens).
- Borders, shadows, radius:
  [STYLEGUIDE](docs/STYLEGUIDE.md#borders-shadows-and-radius).
- Component classes: [Components](docs/STYLEGUIDE.md#components).
- Page rules: [Sections](docs/STYLEGUIDE.md#sections-rhythm-and-grid),
  [Hero](docs/STYLEGUIDE.md#hero), [Posts](docs/STYLEGUIDE.md#posts),
  [States](docs/STYLEGUIDE.md#empty-loading-and-error-states),
  [Photo frames](docs/STYLEGUIDE.md#photo-frames-and-the-failed-photo-state).

## Content collection

`src/content.config.ts` defines `blog` (`glob()` over
`src/content/blog/*.md`, top level only) and [`talks`](#talks).

| Field            | Type              | Required     | Default |
| ---------------- | ----------------- | ------------ | ------- |
| `title`          | string            | yes          |         |
| `date`           | date              | yes          |         |
| `updated`        | date              | no           |         |
| `category`       | enum, see below   | yes          |         |
| `placeholder`    | boolean           | yes          |         |
| `tags`           | slug[], see below | no           | `[]`    |
| `teaser`         | string            | yes          |         |
| `featured`       | boolean           | no           | `false` |
| `readingTime`    | number            | no           |         |
| `seoTitle`       | string            | no           |         |
| `seoDescription` | string            | no           |         |
| `cover`          | image             | no           |         |
| `coverAlt`       | string            | with `cover` |         |
| `coverCredit`    | string            | no           |         |
| `personaSources` | boolean           | no           | `false` |

- Categories: `skincare`, `travel`, `personal-thoughts`,
  `professional-journey`, `open-source`. Rename them in `BLOG_CATEGORIES` and
  `CATEGORIES` together. Import `BLOG_CATEGORIES`.
- Glyph and teaser per category: `CATEGORIES` in `src/lib/categories.ts`.
  Every category is gold: `CATEGORY_LABEL` and `CATEGORY_TILE` there;
  `tests/category-style.spec.ts` holds them to 7:1.
- Tags are kebab-case URL segments (`/blog/tag/<tag>/`). Proper-noun labels in
  `TAG_LABELS`. Tag `<h1>` is `text-h2`, since a tag cannot take a soft hyphen.
- A category page is built only once it has a published post. Tag listings
  are `noindex, follow` and excluded from the sitemap by
  `src/lib/sitemap-filter.ts` (`tests/sitemap.spec.ts`).
  `/contact/sent/` is `noindex`.
  Every other page sends `robots` `max-image-preview:large`, so Google may
  show its share image large (`tests/canonical.spec.ts`).
- Non-placeholder posts get `og:type` `article`,
  `article:published_time` and a `BlogPosting` JSON-LD node. Other pages are
  `website`.
- `cover` is relative to the post, any ratio, never cropped, and shown as the
  post's hero photo, on the `/blog` feature card and on its sharing card; the
  schema requires `coverAlt` with it.
- `updated` sets `dateModified`; absent, it is omitted, not copied from `date`.
- Pagination (`/blog/page/<n>`) builds only past `POSTS_PER_PAGE`, 9 unless
  the build's `POSTS_PER_PAGE` variable sets another positive whole number.
  `test:worker` builds at 1 so `tests/blog-pages.spec.ts` reaches the pager.
- Every blog, category, tag, feed and Markdown-copy URL comes from
  `src/lib/paths.ts`, which imports nothing.
- `/llms.txt` and `[slug].astro` read with `getCollection`, not
  `getSortedPosts`, which drops placeholders ([rejected](#rejected-findings)).
  `tests/llms-txt.spec.ts` holds `placeholder` to each post's text.

### Feeds

- `/rss.xml` (all published posts) and `/blog/tag/<tag>/rss.xml`, RSS 2.0 from
  `src/lib/feed.ts`, with `atom:link rel="self"` and RFC 822 dates.
- A tag feed serves aggregators that follow one topic.
- Placeholders are excluded. `tests/rss.spec.ts`.

### Markdown visitors

Sätteri hast visitors in `astro.config.mjs` `hastPlugins`.
`markdown.rehypePlugins` does nothing without `@astrojs/markdown-remark`,
which is not installed.

| Visitor                          | Marks                                               |
| -------------------------------- | --------------------------------------------------- |
| `src/plugins/link-list-item.mjs` | a list item that is only a link (SC 2.5.5)          |
| `src/plugins/post-figure.mjs`    | a post image: frame, sizer, `widths`, `sizes`       |
| `src/plugins/code-block.mjs`     | `<pre>` as `tabindex="0"` `role="group"` (SC 2.1.1) |

`group`, not `region`, so code blocks are not landmarks.

### Markdown sources and discovery

- Every published post is also served at `/blog/<slug>.md`
  (`src/lib/markdown-source.ts`), linked with
  `rel="alternate" type="text/markdown"`. It never reads image fields, which
  would ship the originals.
- `public/_headers` sends a `Link` header to `/llms.txt`, the sitemap and the
  feed. `tests/agent-readiness.spec.ts`.
- `robots.txt` (`src/pages/robots.txt.ts`) disallows crawlers that collect
  pages for AI training (GPTBot, ClaudeBot, CCBot, Google-Extended,
  Applebot-Extended, Meta-ExternalAgent, Amazonbot, Bytespider); Google-Extended
  also covers Gemini app grounding. Everything else is allowed, search crawlers
  included. Meta-WebIndexer, Amzn-SearchBot and Amzn-User stay allowed. Google
  Search, AI Overviews and AI Mode use Googlebot and are unaffected; Search
  Console's Search generative AI control stays on Include. Cloudflare's managed
  robots.txt stays off so it cannot contradict this. `tests/sitemap.spec.ts`.

### Talks

One deck per talk, `src/content/talks/<deck>/slides.md`, Slidev Markdown
format, rendered by the site as a slideshow at `/talks/<deck>/`, a dev-only
presenter view and a PDF. Authoring rules:
[docs/DEVELOPMENT.md](docs/DEVELOPMENT.md#writing-a-talk).

- **Not Slidev.** Its output has no `<main>`, no slide-change announcement,
  nested buttons, a scaled fixed canvas, no reduced motion, nothing without JS,
  a public `/presenter/` and notes in the bundle, and an untagged PDF with no
  `/Lang` ([slidev#2426](https://github.com/slidevjs/slidev/issues/2426),
  [slidev#2273](https://github.com/slidevjs/slidev/pull/2273)).
- **Loader.** `src/lib/talk-loader.ts`, one entry per slide
  (`<deck>/<number>`). `src/lib/slides.ts` splits the file first (following
  Slidev's `packages/parser/src/core.ts`), then `renderMarkdown` runs the
  visitors above, with a strict schema
  ([what fails the build](docs/DEVELOPMENT.md#writing-a-talk)).
- **Slideshow.** Every slide is a `.card` in `<section id="slide-N">`, all in
  the HTML. `DeckBar.astro` holds the controls and a polite live region;
  `src/scripts/slideshow.ts` wires them and the keys. Hidden slides use
  `data-current`, not `hidden`: Tailwind's `[hidden]` `!important` would stop
  print showing them. Focus stays on a bar control as a slide turns (APG
  carousel), scrolled back into view when a taller slide pushes it off screen.
  Below `lg` a media query stacks every slide and hides the controls, the
  script ignores slide keys, and a card links the talk PDF with its size.
  `tests/slideshow.spec.ts`, which also checks every slide fits 1280x720.
- **Presenter view.** `src/presenter/integration.mjs`, `astro dev` only, synced
  over `BroadcastChannel`. Notes load via `import.meta.glob` (no `node:fs` in
  the Cloudflare dev runtime). `tests/talk.spec.ts` checks no note is in the
  build.
- **PDF.** `scripts/publish-talk.mjs` prints one slide per 1280x720 page,
  then `scripts/tag-pdf.py` fixes tags for PDF/UA-1. It prints with static
  Lexend 400/900 from `@fontsource/lexend` (dev only): the variable font
  becomes Type 3 and stalls veraPDF past CI's timeout. The PDF stores a
  SHA-256 of the deck; `tests/talk-pdf.spec.ts` fails on drift.
- **Images.** `scripts/check-untransformed.mjs` covers deck images, symlinked
  site images included ([where images go](docs/DEVELOPMENT.md#writing-a-talk)).

## Conventions

Commits, copy rules and process: [AGENTS.md](AGENTS.md).

### Code

- Comment `.astro` templates with `{/* … */}`. Authored `<!-- -->` ships
  verbatim. `tests/seo.spec.ts` fails on any in the build.
- Internal links end with `/`; production 307s the unslashed form.
  `tests/seo.spec.ts`.

### Text size

`--text-scale` (Smaller and Larger) is a unitless number on the root,
multiplied into `--text-lead`, `--text-standfirst`, `--text-post-teaser`, `--text-body` and
`--text-label` in `global.css`. Scaling the root font size was rejected: media
queries ignore it, so layouts overflowed at widths such as 768px.
`tests/reading-tab.spec.ts` holds the no-sideways-scroll rule at 320, 390 and
1280px. The control is the reading tab (`ReadingTab.astro`).

### Scripts loaded on demand

`src/scripts/on-demand.ts` loads a feature's code on its first use, so
it stays out of the per-page script budgets (`tests/performance.spec.ts`).

- A feature is a `?worker&url` file. `Footer.astro` renders the registry on
  every page except under `/talks/`.
- A trigger is `[data-on-demand="<feature file URL>"]`, shipped `hidden`; the
  registry unhides it. Without JavaScript nothing shows. A trigger that takes
  room in the layout is drawn from first paint instead, so nothing moves when
  the registry runs: the Aa brick, hidden like Theme without `data-theme`.
- First click imports the file, then dispatches an `on-demand` event on the
  trigger; later clicks only dispatch. A failed import is reported with
  `reportError` and retried on the next click.
- A feature file finds its trigger and listens at top level:
  `trigger.addEventListener('on-demand', ...)`, and ends with `export {};` so
  TypeScript treats it as a module.

Rejected:

- Main-bundle `import()`: Vite adds its preload helper to the page bundle.
- `script.src`: blocked by the Trusted Types CSP.
- `build.modulePreload: false`: changes the preloads of every page.
- Nested `?worker&url` in a worker-built file: emits into `dist/server` (404).
- Exporting a function from a feature: the IIFE worker build drops exports.

### Tests

- A green check is evidence only once it has been shown to fail on its defect
  (fix removed, state forced, or defect restored).
- A validator is one reader. veraPDF passing does not mean a screen reader can
  read the PDF.
- Shared helpers: `tests/source.ts` (values read from the repo) and
  `tests/wcag.ts` (`MIN_TARGET`, `AXE_TAGS`, `REFLOW_VIEWPORT`). Read values,
  never copy them.
- **Route-list literals need a completeness guard.** Playwright collects before
  `webServer` builds, so a literal subset of `ROUTES` is unavoidable; a second
  test derives the real list from the build and fails when the literal falls
  behind. `FRAME_ROUTES` in `tests/failed-images.spec.ts` is the pattern.
- **CI caches optimized images, not `dist/`.** Each shard's `webServer` runs
  `npm run build`; image generation is nearly all of it. The checks job saves
  `node_modules/.astro/assets` and the shards restore it, so the shards still
  start together. A shared `dist/` artifact would need a build job in front of
  them.
- **The apt package cache is a trust boundary.** Only pushes to main (shard 1)
  write it. An exact hit (same Playwright version and runner image) installs
  the cached `.deb` files with `dpkg -i`, unverified. Any other path runs
  install-deps: apt picks versions from the signed index and reuses a cached
  file whose name and size match without re-hashing it
  ([apt 2.8.3](https://salsa.debian.org/apt-team/apt/-/blob/2.8.3/apt-pkg/acquire-item.cc#L3494-L3507),
  the runner's version). A corrupt file fails in dpkg. Do not widen the writes
  to pull requests.
- Post, category and tag routes in `tests/routes.ts` are read from
  `src/content/blog/` frontmatter, which exists at collection. A test that
  needs a particular post picks it by property (`CONTENTS_POST_ROUTE`,
  `PHOTO_POST_ROUTES`), never by position or slug.
- A guard that can match nothing needs a floor: two empty lists compare equal.
- **Route walks.** A check on built HTML is one test over `ROUTES` with
  `expect.soft`, pushing each route onto `checked` and asserting it equals
  `ROUTES`. A check that drives a browser stays one test per route.
- A count in a comment states its unit.
- A fact duplicated across Markdown files needs a check that fails when the
  copies disagree; otherwise keep one copy and link.

### Claims that rest on a platform setting

A public claim that depends on a dashboard or plan setting (retention, region,
mail forward) gets an entry in `src/lib/platform-facts.ts` with the page to
check and the date checked. `tests/platform-facts.spec.ts` fails when one
lapses. A fact that cannot drift gets a comment instead (D1's EU jurisdiction
in `wrangler.jsonc`).

## Assets

- **The suffix names the artwork color.** `-dark` is `#131313` artwork (goes
  on gold or light); `-white` is `#FFFFFF` artwork (goes on dark). The wrong
  pairing renders invisible.
- `src/assets/`: rendered artwork, through `astro:assets`, WebP, hashed into
  `/_astro/`, cached immutably. Unimported files are not emitted.
- `public/images/`: stable URLs for outside consumers (Open Graph images).
- `artwork/`: source artwork the build never reads (the badge, the
  `favicon.ico` frames). Nothing in it ships.

| Path                           | Artwork   | Goes on       | Used by                                      |
| ------------------------------ | --------- | ------------- | -------------------------------------------- |
| `artwork/badge-white.png`      | `#FFFFFF` | Dark surfaces | Nothing; source artwork                      |
| `public/images/og-default.png` | Composite | n/a           | `BaseLayout.astro`, the homepage and the 404 |
| `public/images/og/*.jpg`       | Composite | n/a           | `BaseLayout.astro`, every other page         |

| Artwork             | on `#0B0B0B` | on `#1A1A1A` | on `#FFFFFF` | on `#FFC000` |
| ------------------- | ------------ | ------------ | ------------ | ------------ |
| `-dark`, `#131313`  | 1.06         | 1.07         | **18.58**    | **11.32**    |
| `-white`, `#FFFFFF` | **19.68**    | **17.40**    | 1.00         | 1.64         |

- `og-default.png`: 1200x630, the site card: the name, `site.tagline` and `site.name` on the gold panel, the logo
  cat whole and centered on the dark strip, clear of the cropped edges. Rendered by `npm run og`
  ([DEVELOPMENT.md](docs/DEVELOPMENT.md#the-sharing-images)). A PNG in `public/`
  because scrapers need a stable URL and format.
- `public/images/og/<route>.jpg`: every other page's card, drawn by the same
  script from the built page: the person's name over the page title on gold,
  and on the strip the first photo in `<main>`, whole, or the logo cat when
  there is none. `OG_PHOTO_CHOICES` in `src/lib/og-cards.ts` holds per-route
  exceptions, empty as shipped. `cards.json` records each card's title, photo
  and alt; `tests/seo.spec.ts` fails when a page's title or first photo no
  longer matches its card.
- Rerun `npm run build && npm run og` after changing a token, a page title,
  a page's first photo, the name or the tagline, and commit `public/images/`.
  Not part of `npm run build`: the Cloudflare build has no Chromium.
- `src/lib/brand-mark.ts`: the logo cat, an eared tile in Hela's calico with
  happy eyes; the source for `logo-cat.svg` (written by `npm run icons`, for
  the `/about` tile in `CatMark.astro`) and `npm run og`. The favicons and
  app icons come from a cut-out cat, [the favicon set](#the-favicon-set).
- `src/lib/box-cat.ts`: the box cat's cardboard box (`cat-cardboard`, ink edge,
  pink throw, flaps). `npm run box-cat`
  (`scripts/make-box-cat.mjs`) sets a cut-out cat from `artwork/cats/` in it,
  with a white die-cut rim, and writes:

| Path                             | Cat     | Used by                                        |
| -------------------------------- | ------- | ---------------------------------------------- |
| `src/assets/box-cat-logo.svg`    | Minerva | `Header.astro` logo, `404.astro` guide (84x96) |
| `src/assets/box-cat-roundel.svg` | Rudra   | `Roundel.astro`, 112x112                       |
| `src/assets/box-cat-footer.svg`  | Hela    | `Footer.astro` mascot on the motto band        |

- The marks, icons, sharing image and hero poneglyph are drawn by AI
  ([AI_DISCLOSURE.md](AI_DISCLOSURE.md)).
- Every box cat file and `logo-cat.svg` load as an `<img alt="">` imported with
  `?url`, cached once for every page. The roundel is sized by
  `size-24 lg:size-32` (page) or `size-roundel` (hero) and tilted 3deg.
- A `.vue` component cannot reach `astro:assets`: call `getImage()` in Astro
  and pass the result as a prop.
- Footer links: one sticker tile per profile plus Email (six as shipped), with
  Simple Icons (CC0) paths, one `<symbol>` per link label in
  `src/assets/social-icons.svg`. The footer runs JavaScript only for features
  [loaded on demand](#scripts-loaded-on-demand).

### Photos and video

- Photos: `src/assets/photos/` (pages) and `src/assets/blog/<slug>/` (posts).
  Masters are JPEG, metadata stripped, never cropped on display: tiles, pairs,
  strips, figures, covers and sharing cards show the whole file.
- Fixed-size photos pass `DENSITIES`; fluid ones pass `WIDTHS` and `sizes`
  from `src/lib/image-densities.ts`. `WIDTHS` steps at most 1.5x; `sizes` is
  the real drawn width. `tests/image-size.spec.ts` fails on stretching,
  more than 1.5x oversize, or `sizes` over 1.1x.
- Exception: the `/about` cat card photo has two drawn widths, so
  `about.astro` gives it its own widths and `sizes` (`CAT_PHOTO_WIDTHS`).
- `/about` photo boxes match their file's ratio. No
  text over photos.
- Markdown images: `post-figure.mjs` sets `layout: 'full-width'` so
  `image.breakpoints` (`MARKDOWN_WIDTHS`) applies. An image alone in a post
  paragraph becomes a `figure`, its title the `figcaption`; a portrait gets
  `.figure-portrait`. `.post-layout` is the container a figure breaks out to.
- From `xl` a landscape figure breaks out right, under the contents rail's
  column: place it below the contents; `tests/post-page.spec.ts` fails a
  figure that overlaps the rail.
- Markdown images are WebP only: Markdown renders
  `<img>`, not `<Picture>`, so `PHOTO_FORMATS` (AVIF first) does not reach them.
- Credits: `src/lib/credits.ts`, one link per photographer, keyed by the name
  after "Photo: " in a caption. Captions and `/credits` read from it. A
  Markdown image title "Photo: name" links `PHOTOGRAPHERS`, "Screenshot: name"
  links `SCREENSHOT_SOURCES`; an unlisted name stays plain text.
- A Creative Commons photo goes in `LICENSED_PHOTOS`, keyed by its file name
  without the extension: `photographer`, `title`, `titleInCaption`, `source`,
  `sourceName`, `license` (spelled out), `licenseShort` ("CC BY 4.0"),
  `licenseHref` and `changes`. Its "Photo: name" caption is then
  `licensedCaption`: the title first with `titleInCaption`, and the short
  license ([Photo credits](docs/STYLEGUIDE.md#photo-credits)); /credits lists
  it in full. Empty in the template.
- **Video** goes in `public/videos/` (none published). Encode AV1 WebM, H.264
  MP4 fallback, WebP poster, WebVTT captions; max 25 MiB a file.
  - Workers static assets answer `Range` with a full `200`; Safari and iOS need
    `206`. So `/videos/*` is in `run_worker_first` and
    `src/lib/video-range.ts` serves one `bytes` range, `416` past the end,
    honors `If-Range`, else the whole file.
  - Sizes come from `__VIDEO_SIZES__` at build (the ASSETS binding streams
    without `Content-Length`). A re-encoded video needs a rebuild.
  - Slices go through `FixedLengthStream` so the `206` has a length.
  - Ranged responses keep the `_headers` rules.
  - `tests/video-range.spec.ts` runs under the Worker config, against a
    fixture the config copies into `public/videos/` for that build.
  - Not dead code ([rejected](#rejected-findings)).

### The favicon set

All written by `npm run icons` (`scripts/make-icons.mjs`) from
`artwork/cats/minerva-head.png`, her head cut from the Canva AI drawing
`artwork/cats/minerva-sit.png`, in Chromium with the color tokens.

- Tab icons (`favicon.*`, `artwork/favicon-*`): Minerva's head as a die-cut
  sticker: white rim, ink edge and a pink block behind her, on a transparent
  ground. The ink edge holds 3:1 on a light tab strip and the white rim on a
  dark one (`tests/brand-mark.spec.ts`). Each is scaled down from one 512px
  render with a clear 1px border. No SVG favicon: at tab size Chromium rounds
  the die-cut filter radii to whole px and clips the sticker.
- App icons (`apple-touch-icon`, `android-chrome-*`, `maskable-icon`): the same
  sticker on a full-bleed `background` square, the manifest's color.

| Path                                | Size         | Notes                                             |
| ----------------------------------- | ------------ | ------------------------------------------------- |
| `public/favicon.ico`                | 16 / 32 / 48 | Legacy fallback, three PNG frames                 |
| `artwork/favicon-16x16.png`         | 16           | `favicon.ico` frame                               |
| `artwork/favicon-32x32.png`         | 32           | `favicon.ico` frame                               |
| `artwork/favicon-48x48.png`         | 48           | `favicon.ico` frame                               |
| `public/favicon-96x96.png`          | 96           | The sticker, linked from the head                 |
| `public/apple-touch-icon.png`       | 180          | Full-bleed; iOS rounds it, do not pre-round       |
| `public/android-chrome-192x192.png` | 192          | PWA icon, from the manifest                       |
| `public/android-chrome-512x512.png` | 512          | PWA icon, from the manifest                       |
| `public/maskable-icon-512x512.png`  | 512          | `purpose: maskable`, cat inside the 80% safe zone |

- `tests/icons.spec.ts` checks every `sizes` attribute against the bytes.
- No light-scheme variants.

### The web app manifest

`/site.webmanifest` is generated by `src/pages/site.webmanifest.ts` so
`theme_color` reads `--color-background` via `src/lib/theme-color.ts`, matching
`<meta name="theme-color">`. `check-tokens` only scans `src/`, so no hex goes
in `public/`.

## Security headers

- `public/_headers` sets headers for static assets only; the build copies it to
  `dist/client/`. This section explains each header. Dashboard overrides:
  [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md#cloudflare-settings).
- Worker responses do not get `_headers`; `src/worker.ts` adds its `/*` rule to
  each one, redirects and 403s included. Routes set only their Cache-Control.
- An on-demand route must be in `assets.run_worker_first`. Otherwise a
  navigation request (`Sec-Fetch-Mode: navigate`) to it is answered by the
  asset layer, and a POST gets 405. `tests/contact.spec.ts` sends that header.
- `/videos/*` is in `run_worker_first` for byte ranges
  ([Photos and video](#photos-and-video)).
- `/_image` is in `run_worker_first`: on-demand pages (the contact error pages)
  point images at the adapter's passthrough endpoint, which serves the original
  from `/_astro/`. Without it the asset layer answers with `404.html`.

### Rules and caching

- One rule per header name. Cloudflare applies every matching rule and
  comma-joins a repeated header: `same-origin, cross-origin` does not parse,
  and two CSPs are both enforced. `tests/headers-rules.spec.ts`.
- The exception is `Cache-Control`, which later rules detach with
  `! Cache-Control`. The asset worker applies rules in file order
  (`attachCustomHeaders` in `node_modules/miniflare/dist/src/workers/assets/`).
- `immutable` for a year on `/_astro/*` only: Vite content-hashes those names.
  An unhashed file there stays stale for a year in every browser that has it.
- Everything else gets `Cache-Control: no-transform` alone, so browsers
  revalidate against the ETag. `/vendor/*`, favicons and feeds detach it so
  Cloudflare compresses them; sitemaps and `llms.txt` would save under 1 KB.
  `/vendor/*` also caches for an hour: its URL is not hashed.
- `no-transform` keeps JavaScript Detections (forced on the Free plan) off
  pages: its inline script carries a per-request token no CSP hash allows, and
  it strips the ETag. The cost is uncompressed HTML, since no pattern
  separates page paths from assets. `npm run check:live` fails if the script
  returns or an asset arrives unencoded.

### Other headers

- HSTS: 180 days, `includeSubDomains`, no `preload`. Every subdomain needs TLS
  before it serves anything. Preload ships the host in browser releases and
  takes months to undo. The zone HSTS setting stays off
  ([DEPLOYMENT](docs/DEPLOYMENT.md#cloudflare-settings)).
  `tests/headers-rules.spec.ts` pins the max-age and asserts no preload.
- `Link`: `llms.txt` as `describedby`, the sitemap, and the feed as
  `alternate` (RFC 8288). `sitemap` is not a registered relation;
  specification.website's discovery checklist names it.
- `X-Robots-Tag: noindex` on `/blog/*.md`, a copy of each page, and on
  `/*.pdf` (the talk slides), whose pages are the search results. To close the
  whole site, use this header rather than `Disallow`: a crawler barred from a
  page never sees its noindex and can still list the URL.
- No `Cross-Origin-Embedder-Policy`: nothing uses `SharedArrayBuffer`, and it
  would break any future cross-origin subresource.
- No `Reporting-Endpoints`: there is no collector.

### Speculation rules

- `Speculation-Rules: "/speculationrules.json"`: a header-named file, so no
  inline hash. Prefetch on hover only, never prerender (would count Umami
  visits).
- Excludes `/contact/send/`, `/videos/`, PDFs, downloads.
- Served as `application/speculationrules+json` or Chromium ignores it.
  `tests/served-types.spec.ts`, `tests/headers.spec.ts`.

### The CSP

```text
default-src 'self';
script-src 'self' <3 sha256 hashes>;
style-src  'self' <1 sha256 hash>;
connect-src 'self';
object-src 'none'; base-uri 'none';
form-action 'self'; frame-ancestors 'none';
upgrade-insecure-requests;
require-trusted-types-for 'script'; trusted-types vue
```

- No `'unsafe-inline'`, no `'unsafe-eval'`. Everything is same-origin: fonts in
  `/_astro/`, Umami vendored under `/vendor/`, no embeds, no `data:` URIs, Vue
  runtime-only build.
- `connect-src` is `'self'` while analytics is off. With analytics on it also
  names Umami's collector, `UMAMI_HOST_URL` in `src/lib/analytics.ts`;
  `tests/headers-rules.spec.ts` asserts whichever applies. See
  [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md#umami).
- `vite.build.assetsInlineLimit: 0` so no script is inlined.
- `form-action 'self'`, never `'none'`: `'none'` silently blocks the contact
  form. Never `*`. A form posting to a new origin widens it to that exact
  origin and updates `tests/headers-rules.spec.ts` and this section in the same
  commit; so does loosening any directive now `'none'`.
- Trusted Types: no script of ours writes HTML; Vue's runtime does, through
  its own `vue` policy, the only one allowed. `tests/headers.spec.ts` opens
  every page with a script and the island dialogs under the policy.
- Trusted Types: no script of ours writes HTML; Vue's runtime does, through
  its own `vue` policy, the only one allowed. `tests/headers.spec.ts` opens
  every page with a script and the island dialogs under the policy.
- `tests/headers-rules.spec.ts` asserts each directive.

### The hashes go stale

Hashed inline blocks:

- On `/` and `/about/` (the `HeroField.vue` and `AboutCats.vue` islands, both
  `client:load` so they share one loader hash): the `client:load` loader, the
  `<astro-island>` hydration script, and the
  `astro-island,astro-slot,astro-static-slot{display:contents}` style.
- On every page: the theme script in `BaseLayout.astro`'s `<head>`.
- JSON-LD needs no hash (not executed).

An Astro upgrade can change a hash; the island then silently fails to hydrate
(console only). To regenerate:

1. `npm run build`
2. `npx playwright test tests/headers-rules.spec.ts`
3. Copy the hashes printed by the failure of
   `the csp allows exactly the inline blocks the build emits` into
   `public/_headers`. Never hand-edit a hash.

`npm run check:live` checks what Cloudflare actually sends.

## The contact form's honeypot

- A filled honeypot gets an identical success response and is discarded;
  `handleSubmission` logs it.
- Hidden with the `hidden` attribute ([rejected](#rejected-findings)). It
  catches naive fillers only; the no-JS form and static `/contact/` rule out
  timing checks and tokens.
- Volume is bounded by the `CONTACT_RATE_LIMIT` binding (`wrangler.jsonc`) per
  /64; fail-open paths are logged.

## Rejected findings

Review findings investigated and rejected. Do not re-raise without new
evidence.

- **Fix axe's forced-colors `color-contrast` on `.sticker` in a `.card`:** axe
  reads the authored gold; the computed color there is CanvasText on Canvas,
  and `tests/forced-colors.spec.ts` passes.
- **Keep `/brand` swatch colors in forced colors with `forced-color-adjust: none`:**
  `tests/forced-colors.spec.ts` holds the site rule that forced colors replaces
  every color; a swatch there is a bordered box.
- **Allow `img-src data:` so a box cat SVG opened on its own shows its cat:**
  the files are only ever drawn by an `<img>`, where the page's CSP does not
  reach the picture inside; widening the CSP for a direct visit adds risk for
  no reader.
- **Delete the video byte-range pipeline as dead code:** the next
  published video would not play in Safari and iOS, which need `206`.
- **Route `/llms.txt` through `getSortedPosts`:** it drops placeholder
  posts, and `/llms.txt` is the one surface meant to list them.
- **Use Astro's `security.csp`:** `@astrojs/cloudflare` lacks
  `adapterFeatures.staticHeaders`, so it adds a `<meta>` policy beside the
  header instead of replacing it. `frame-ancestors` is ignored in `<meta>`, and
  the header also covers PDFs, `llms.txt`, the sitemap and videos.
- **Set `package.json` `"license"` to `"MIT"`:** the code is MIT and the
  photographs are CC BY 4.0, so one SPDX identifier would mislabel the
  photographs. `SEE LICENSE IN README.md` is npm's form for that case.
- **Hide the honeypot with CSS instead of `hidden`:** if the
  stylesheet fails, a person sees the field and loses their message.
- **Make `/contact`'s "Or Find Me Here" and "Write to Me About" `h2`:** they
  are parts of the "Write to Me" section, other ways to write and what to
  write about, so `h3` is the true outline.
- **Turn on `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`:**
  none of their errors is a bug. Every index is guarded at runtime (an empty
  deck throws, `Map.groupBy` groups are never empty); every optional-prop
  error passes `undefined` on purpose. `tsconfig.json` turns both off.
- **Replace `contact-env.ts`'s binding types with `wrangler types`:** its
  runtime types redeclare DOM globals (`Element`, `append`), breaking the
  client scripts sharing this program. Env-only output needs
  `@cloudflare/workers-types`. The hand-written types stay narrow, so tests
  fake bindings without casts.
- **Place the cat card with CSS anchor positioning, not JS:** the anchor is an
  SVG `<rect>` in a transformed group, and `anchor-name` needs an element with
  a CSS box.
- **Swap the cover's `<p>` for `<div>` in a rehype plugin, not a regex in
  `TalkSlide.astro`:** the input is the site's own cover, which the loader
  holds to text only; a plugin for one tag swap costs more than it saves.
- **Store a message and count the last hour in one D1 `batch()`:** a batch
  is one transaction, so a failed count would roll back the stored message;
  apart, a failed count only skips the hourly cap.
- **Give the talk page one `h1` above the slides:** the cover slide's heading
  is the `h1` and every other slide carries its own `h2`; another would repeat
  the title.
- **Add a `BreadcrumbList` to the talk page:** pages outside `/blog` carry no
  breadcrumbs (`tests/breadcrumbs.spec.ts`); the link to the talk's post
  covers the way back.
- **Name the bud and head ellipses in `hero-field.ts` or the glyph strokes in
  `hero-field-poneglyph.ts` as constants:** they are drawing coordinates, not
  tuning values.
- **Move every `href` in page markup into `paths.ts`:** a route used by code
  (redirects, nav, sitemap, `llms.txt`) is a constant there; a link in prose
  stays markup, and `tests/internal-links.spec.ts` fails on a broken one.
- **Disallow `/` in `robots.txt` on a `NOINDEX` build:** a blocked crawler
  never fetches the page, so it never sees `X-Robots-Tag: noindex`, and Google
  indexes the URL from links alone.
- **Cap stored contact messages across all senders:** the per-address limit
  cannot stop a flood spread over many addresses, but the worst case is a
  temporary 503 when D1's writes run out; nothing stored is lost or exposed.
- **Run Lighthouse in CI:** timing scores vary on shared runners.
  `tests/performance.spec.ts` gates script and CSS bytes and layout shift, the
  image and head specs gate formats, priority and font preload; Lighthouse runs
  by hand after a deploy ([DEPLOYMENT.md](docs/DEPLOYMENT.md)).
- **Add ESLint, or `checkJs` for the `.mjs` scripts:** the strictest tsconfig,
  `astro check` at hint level, `vue-tsc`, Prettier and the `check:*` scripts
  cover what a linter would. `checkJs` reports untyped code (implicit `any`,
  untyped `catch`, loose DOM and Node types), not bugs.
- **Fetch external links in CI:** the result depends on other sites' uptime,
  so the gate would fail for reasons outside the repository.
  `tests/internal-links.spec.ts` covers every same-origin link.
- **Emulate touch in the browser projects:** the menu, photo strip and
  slideshow use native buttons and links, which fire the same events for
  touch; pointer and keyboard runs already cover them.
- **Drop the About cat card's "beside its cat, not over it" checks as
  decoration:** the card opens beside its cat by design, so where it opens is
  function; the test name in `tests/about-cats.spec.ts` says so.
- **Draw the About cat's focus ring round the cat, not its band:** the ring on
  the band passes SC 2.4.11 (sides and top stay visible), and the cat moves
  while the band does not.
- **Let an About cat keep playing while it has keyboard focus:** the hold is a
  rule, with its reason, in [STYLEGUIDE.md](docs/STYLEGUIDE.md#motion).
- **Size the hero roundel with a fixed 96px disc, a jump to 128px at `lg`, or
  a 64 to 96px clamp:** 96px leaves 8px to the title on a phone, the jump
  leaves 18px each side at 1024px, and the clamp leaves 24px below on a phone.
  [The roundel's size](docs/STYLEGUIDE.md#the-roundels-size) derives it
  instead.
- **Raise the post `h3` floor to 24px, or exempt level 4 from `STEP`, to allow
  an `h4`:** the first is a reflow change (SC 1.4.10); the second drops the
  step check. A post stops at `h3`
  ([STYLEGUIDE.md](docs/STYLEGUIDE.md#a-post-stops-at-h3-there-is-no-h4)).
- **Disable the contact submit button until the form is valid:** the button
  is always operable. `aria-disabled` is set only while a send is in flight
  (`src/scripts/contact-sending.ts`), to stop a double send. Every other press
  submits, and the server validates (`novalidate` in `ContactForm.astro`), so
  the error summary says what is missing instead of a silent button.
- **Reset the contact form on a timer after Stop:** invites a double send; Esc
  and `navigateerror` cover it, Firefox's Stop button does not.
- **Drop uppercase from headings, labels, nav and buttons:** the advice
  against capitals is about "large amounts of text"
  ([GOV.UK](https://guidance.publishing.service.gov.uk/writing-to-gov-uk-standards/style-guides/a-to-z-style-guide/)),
  "continuous text"
  ([BDA Dyslexia Style Guide 2023](https://cdn.bdadyslexia.org.uk/uploads/documents/Advice/style-guide/BDA-Style-Guide-2023.pdf))
  and "longer passages or reading full sentences", while single words
  glanced at read as fast or faster in capitals
  ([NN/g, Laubheimer 2017](https://www.nngroup.com/articles/glanceable-fonts/));
  these are a few words each, cased by the
  [case rule](docs/STYLEGUIDE.md#uppercase). How screen readers
  speak them is checked in the screen-reader pass.
- **Remove `tests/cursor.spec.ts` as decoration:** it guards `base.css`'s
  override of Tailwind preflight's `cursor: default` on buttons, and the
  `not-allowed` cursor the button styles give `aria-disabled` buttons, an
  interaction state.
- **Copy the restored apt packages into apt's archive directory when the dpkg
  path falls back:** apt reuses a cached file of the right size, so a corrupt
  `.deb` would fail in dpkg again. After a failed `dpkg -i` the fallback only
  fetches what failed.
- **Open fewer photos in `tests/photo-viewer.spec.ts`'s short-viewer test:**
  at full clock it uses a fraction of its timeout. One photo per size,
  thumbnail and group saves seconds and drops coverage; its near-timeouts came
  from a throttled CPU.
- **Drop `tests/header-fit.spec.ts`'s sideways-scroll check as a reflow
  duplicate:** it is the only sideways check at 336px (`--breakpoint-xs`), and
  it reads one number from the page state the test already measures.
- **Change the contact endpoint for an over-cap chunked 500
  (run 37695518322):** the dev proxy (`@cloudflare/vite-plugin` 1.62.5)
  answers 500 after the endpoint's 413. It can recur in CI under
  `--fail-on-flaky-tests`: the log shows `POST /contact/send/ 413`, then
  undici "fetch failed". Keep the test strict.
- **Give the logo cat and the mark alt text (Bing Webmaster Tools "Alt
  attribute for images is missing"):** every `<img>` has an `alt`; the scanner
  counts an empty one as missing. The logo sits in the home link beside the
  site name, and the hero roundel is decoration, so `alt=""` is right
  ([H67](https://www.w3.org/WAI/WCAG22/Techniques/html/H67)). Text there would
  be announced twice.
- **Answer the unslashed URL with a 301, not a 307:** the status is the
  platform's (`html_handling` in `wrangler.jsonc`). Every internal link,
  canonical, sitemap and feed URL ends in `/`, so only a typed or outside link
  meets it; the alternative is one `_redirects` line per route.
- **AccessLint engine hits, each checked against the live DOM:**
  `color-contrast` on the homepage name is read against a gold ancestor the
  text does not sit on; `landmark-unique` counts the no-JavaScript nav, which
  is `display: none` with scripts on; `focus-order` flags the photo strips,
  which are focusable so a keyboard can scroll them.
- **Move the full-screen slide bar inside the card:** on a 16:9 screen the
  foot row crosses the bottom of the focused slide's ring while both show.
  The row shows only while the pointer moves or one of its buttons has focus,
  and inside the card it would sit over slide content at some widths.

## Content notes

- Editorial copy (posts, About, Career, taglines, bios) ships as the sample
  persona, a tribute to Nico Robin, written with AI ([AI_DISCLOSURE.md](AI_DISCLOSURE.md)).
  The sample posts show every Markdown feature the site renders.
- Homepage section headings, category descriptions and the `/blog` heading
  and standfirst are hers too.
- **CV PDF.** Set `person.cv` in `src/site.config.ts` to a PDF under
  `public/`, and `/career` links it with its size; `tests/cv.spec.ts` then
  checks the file's metadata and tags. No CV ships.
- **Post artwork.** A `feature` `BlogCard` without a `cover` shows
  `PlaceholderBox`. `/career` has no photo placement.
