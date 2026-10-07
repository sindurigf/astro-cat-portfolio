# Development

## Requirements

- Node.js from [`.nvmrc`](../.nvmrc) (`nvm use`) and its bundled npm. CI and
  Workers Builds read the same file, and `engines.node` matches it: CI tests
  no older Node. Local `test:webkit` can run an older minor ([WebKit](#webkit)).
- Docker for `test:webkit` and `check:pdf`.
- No Cloudflare account or secrets for `dev`, `build`, `check` or any test
  suite. Only `check:live`'s D1 count needs `npx wrangler login` or
  `CLOUDFLARE_API_TOKEN` with `CLOUDFLARE_ACCOUNT_ID`.
- Python 3 with pikepdf for `publish:talk`: `apt install python3-pikepdf`.

## Setup

```sh
nvm use
npm ci
npx playwright install --with-deps chromium firefox
git config core.hooksPath .githooks
npm run dev
```

The pre-push hook refuses a push that does not contain the last-fetched `main`
and does not fetch: run `git fetch` first. The commit-msg hook: [AGENTS.md](../AGENTS.md#commits).

The contact form needs a local D1 with the schema applied. To try it by hand:

```sh
npm run build
npx wrangler d1 migrations apply MESSAGES_DB --local
npm run preview
```

A schema change is a new, numbered file in `migrations/`:

```sh
npx wrangler d1 migrations create MESSAGES_DB <name>
```

Apply it locally with the `--local` command above; `test:worker` applies every
migration before it runs. Production: [DEPLOYMENT.md](DEPLOYMENT.md#d1).

What happens without the `CONTACT_NOTIFY_TO` secret:
[DEPLOYMENT.md](DEPLOYMENT.md#contact-form-email).

## Commands

| Command                       | Does                                                                                                                                               |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run dev`                 | Dev server at `http://localhost:4340`                                                                                                              |
| `npm test`                    | `test:a11y`, then `test:worker`; each builds first                                                                                                 |
| `npm run build`               | Build to `dist/client` (assets) and `dist/server` (Worker)                                                                                         |
| `npm run preview`             | Serve the build through the Worker runtime                                                                                                         |
| `npm run typecheck`           | `astro check` (fails on hints), then `vue-tsc` on `.vue` files                                                                                     |
| `npm run format`              | Prettier, write                                                                                                                                    |
| `npm run check`               | `check:tokens`, `links`, `pins`, `classes`, `untransformed`, `title-case`, `exif`, `format:check`, `commits`, `leaks`; needs `npm run build` first |
| `npm run format:check`        | Prettier, check only                                                                                                                               |
| `npm run check:links`         | Relative Markdown links and `#heading` anchors resolve; no link names a gitignored path; no network                                                |
| `npm run check:classes`       | Every class in the built HTML has a CSS rule                                                                                                       |
| `npm run check:untransformed` | No built file is byte-identical to a source image                                                                                                  |
| `npm run check:exif`          | No EXIF or XMP metadata in images under `src/assets` and `public`                                                                                  |
| `npm run check:leaks`         | No names or ids from the project this template came from; `--pdf <file>` checks one PDF                                                            |
| `npm run test:a11y`           | Playwright suite in Chromium and Firefox; CI adds WebKit                                                                                           |
| `npm run test:webkit`         | The same suite in WebKit, in Playwright's Docker image                                                                                             |
| `npm run test:a11y:ui`        | The same suite in Playwright's UI mode                                                                                                             |
| `npm run test:worker`         | Worker specs, local D1: contact endpoint, byte ranges, types, /blog pager                                                                          |
| `npm run test:demo`           | Demo specs against a `NOINDEX` demo build                                                                                                          |
| `npm run test:coverage`       | `test:a11y` in Chromium, with line and branch coverage of `src/`                                                                                   |
| `npm run check:live`          | Production headers and markup against this repository                                                                                              |
| `npm run check:live:console`  | Every production route in a browser, failing on console errors                                                                                     |
| `npm run check:umami`         | The vendored Umami tracker against the one Umami serves                                                                                            |
| `npm run check:pdf`           | Every PDF in `public/` against PDF/UA-1, veraPDF in Docker                                                                                         |
| `npm run publish:talk`        | Print a talk's slideshow to its tagged PDF in `public/talks/`                                                                                      |
| `npm run og`                  | Render `public/images/og-default.png` from `src/site.config.ts`                                                                                    |

### WebKit

Run before pushing any markup, CSS or image change: WebKit fails where Chromium
and Firefox pass (e.g. it drops `aspect-ratio` from a failed image).

WebKit cannot run on Ubuntu newer than 24.04 (see `projects` in
`playwright.config.ts`), so the script runs the suite in
`mcr.microsoft.com/playwright`, pinned by digest in `scripts/test-webkit.sh`
(`check:pins` enforces it). The script refuses to run when the image's tag is
not the installed `@playwright/test` version; bump both together. It also
refuses an image whose Node major differs from `.nvmrc`. An older minor is
allowed, because Playwright's image ships the Node current at its release.
That Node also stamps `dist/`, so run `npm run build` on the host before
`npm run check` or `publish:talk`. Arguments pass through to `playwright test`:

```sh
npm run test:webkit
npm run test:webkit -- tests/reflow.spec.ts
```

### Published PDFs

- `npm run check:pdf` validates every PDF in `public/` against PDF/UA-1;
  `npm run check:pdf -- <path>` validates one.
- veraPDF runs in Docker, pinned by digest in `scripts/check-pdf.mjs`
  (`check:pins` enforces it), with no network and a read-only mount.
- Exit codes: 0 all pass, 1 a failure, 2 could not run (e.g. no Docker).
- `EXPECTED_FAILURES` in `scripts/check-pdf.mjs` lists known non-conforming
  files (empty), pinned to a SHA-256 and to an [ACCESSIBILITY.md](../ACCESSIBILITY.md)
  section 7 gap. It fails when the bytes change, the file starts passing, or
  the gap no longer names it.
- CI runs it; it stays out of `npm run check`, which needs no Docker.
- A pass is the machine half; [MANUAL_TESTING.md](MANUAL_TESTING.md) §13 is
  the rest.

### Other notes

- A test that never opens a page takes `NODE` from `tests/tags.ts`: it runs
  once, in the `node` project, and the browser projects skip it.
- `.github/workflows/scheduled.yml` runs weekly, never on pull requests:
  `npm audit --omit=dev --audit-level=high`, `check:live`, `check:umami` and
  `tests/security-txt.spec.ts`. After a deploy:
  [DEPLOYMENT.md](DEPLOYMENT.md).
- `test:coverage` writes `coverage/` (`index.html`, `lcov.info`). It covers
  browser JavaScript only (the Vue islands and page scripts). It builds with source
  maps: run a plain `npm run build` before anything else reads `dist/`.
- `dev` and `build` pass `--force` to clear Astro's content cache, which does
  not invalidate when a plugin in `src/plugins/` changes. The resulting
  `[WARN] [content] data store cleared (force)` is expected.
- `prebuild` (`scripts/seed-image-cache.mjs`) copies images from other
  worktrees on the same sharp and libvips into an empty
  `node_modules/.astro/assets` before `build`, so a new worktree does not
  regenerate them all.
- Helpers, not run directly: `scripts/build-fingerprint.mjs` stamps `dist/`,
  and checks that read `dist/` refuse a stale build; `scripts/mime-types.mjs`
  holds content types for the test servers; `scripts/pdf-pages.mjs` counts PDF
  pages for `publish:talk` and `tests/talk-pdf.spec.ts`;
  `scripts/noindex.mjs` rewrites `_headers` and `_redirects` on a
  [`NOINDEX` build](DEPLOYMENT.md#run-a-demo).
- [AGENTS.md](../AGENTS.md) lists what must pass before a change is done.

| Variable                        | Default                  | Effect                                                   |
| ------------------------------- | ------------------------ | -------------------------------------------------------- |
| `LIVE_ORIGIN`                   | `site.url` in the config | Target of `check:live:console` only, e.g. a preview URL  |
| `PORT`                          | 4321                     | Port of `node scripts/preview-static.mjs` run by hand    |
| `TEST_PORT`, `TEST_WORKER_PORT` | from the checkout path   | Ports for `test:a11y`, `test:worker`; must be 1024-65535 |
| `WEBKIT`                        | unset                    | `1` adds the WebKit project outside CI                   |
| `CLOUDFLARE_API_TOKEN`          | unset                    | Lets `check:live` count unsent notifications in D1       |
| `CLOUDFLARE_ACCOUNT_ID`         | unset                    | Needed with the token: a D1-only token cannot look it up |
| `CHECK_LIVE_SKIP_D1`            | unset                    | `1` skips that D1 count                                  |
| `CI`                            | unset                    | Adds the WebKit project and one retry; set by CI         |
| `TRUST_DEPENDABOT`              | unset                    | `1` skips `check:commits` for Dependabot's commits       |
| `COVERAGE`                      | unset                    | `1` builds source maps; set by `test:coverage`           |
| `WORKERS_CI`                    | unset                    | `1` skips the build fingerprint, set in Workers Builds   |

`check:live` takes an optional origin argument (`sh scripts/check-live.sh <origin>`),
default `site.url` in `src/site.config.ts`; `LIVE_ORIGIN` does not affect it.

Each checkout gets its own pair. Set them when another process holds one:

```sh
TEST_PORT=4331 TEST_WORKER_PORT=4332 npm run test:a11y
```

Run one suite at a time per checkout: every suite's build rewrites `dist/`,
and `test:worker` adds a fixture to `public/videos/` during its build. Run
suites in parallel from separate worktrees.

## Project layout

```text
src/
  assets/           Images, processed by the build
  components/       Astro components; ui/ holds the Vue islands
  composables/      Vue composables shared by the islands
  content/blog/     Blog posts as Markdown
  content/talks/    One Slidev Markdown deck per talk
  content.config.ts Content collection schema
  layouts/          BaseLayout: head, header, footer
  lib/              Shared TypeScript
  licenses/         License texts for vendored scripts
  pages/            File-based routes
  plugins/          Markdown plugins
  presenter/        Dev-only presenter view for talks
  scripts/          Browser modules that are not islands
  styles/           global.css (tokens, imports), base, components/, light mode
  worker.ts         Worker entry: Astro's handler and the retention sweep
public/             Static files served from the site root, including _headers
                    and the vendored Umami tracker in vendor/
artwork/            Source artwork the build never reads
migrations/         D1 schema
scripts/            Convention and live-site checks, PDF publishing, test helpers
tests/              Playwright specs; fixtures/ holds files the specs serve
.github/            CI workflows, Dependabot, pull request template
.githooks/          commit-msg and pre-push hooks
docs/               Development, deployment, style guide, manual testing
```

## Where the copy lives

| File                                                                                  | Holds                                                            |
| ------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `src/site.config.ts`                                                                  | Site name, URL, tagline, motto, name, job title, email, profiles |
| `src/pages/index.astro`, `src/pages/about.astro`, `src/pages/career.astro`            | The persona's text; names and links come from the config         |
| `src/content/blog/sample-post.md`, `src/content/talks/sample-talk/slides.md`          | The sample post and talk                                         |
| `src/lib/persona.ts`, `src/lib/credits.ts`                                            | The sample persona's notice; the `/credits` entries              |
| `src/pages/contact.astro`, `src/pages/privacy.astro`, `src/pages/accessibility.astro` | Mostly config values; check the wording against your site        |
| `src/assets/photos/`, `src/assets/blog/`                                              | Sample photos, credited in [LICENSE-photos](../LICENSE-photos)   |

- Replacing the photos: update `LICENSE-photos`, or remove it and its row in
  the [README license table](../README.md#license).

## Writing a post

Add a Markdown file to `src/content/blog/`; the filename is the slug. The build
validates frontmatter against `src/content.config.ts` and fails on a mismatch.
`sample-talk.md` is a complete example.

- The newest published post needs `cover` and `coverAlt`: `/blog` features
  it. A cover can have any ratio; the post hero and the feature card show it uncropped.
- Tests read the new post's routes, category and tags from its frontmatter.
- A spec that needs a post or talk with some property (a cover, a tag, a
  paired talk PDF) skips, naming the property, while none has it.
- `journeyPost` in `src/site.config.ts` is the post `/about`, `/career` and
  `/contact/sent` end on, by slug. Deleting that post fails the build: name
  another published post, or set it to `null` to end those pages on their
  next page only.

## Writing a talk

One deck per talk: `src/content/talks/<deck>/slides.md`, in Slidev's Markdown
format, shown at `/talks/<deck>/`. Example:
`sample-talk/slides.md`. The build fails on anything the
slideshow cannot render, naming file, slide and line (`src/lib/slides.ts`).

- Opening frontmatter is slide 1: `layout: cover` and `info:` (the meta
  description).
- Later slides put settings in a `yaml` code block at the top, never between
  `---` lines (Prettier breaks those).
- The first slide after the cover sets `part:`. `layout: section` also opens a
  part, centered under its number; name it `Part N: Title`.
- One `#` heading per slide, in the case it should display.
- A group label is a `**bold**` paragraph. Two or more on a slide become cards.
  `**A good model: ...**` and `**Example: ...**` always become a card. Six or
  more non-card blocks run two columns on wide screens.
- `label:` adds a grouping (e.g. a pillar number) inside the heading. Use only
  where the heading alone loses it.
- Images go in the deck's `images/` as `./images/<file>`. Reuse a site image
  by relative symlink into `src/assets/` (needs `core.symlinks` on Windows).
- No `v-click`, Vue components, `::right::` slots or `src:` imports.
- A slide's last HTML comment is its speaker note, never published
  ([presenter view](../ARCHITECTURE.md#talks)). Any other comment fails the
  build.
- Add a new deck's route to `TALK_ROUTES` in `tests/routes.ts`.

### Publishing the PDF

```sh
npm run build
npm run publish:talk -- <deck>
npm run check:pdf -- public/talks/<deck>.pdf
```

- Prints the built slideshow to `public/talks/<deck>.pdf`, one slide a page,
  and tags it with `scripts/tag-talk-pdf.py`. Refuses a stale build.
- `tag-talk-pdf.py` fixes what veraPDF fails in Chromium's tagged print:

  | PDF/UA-1 rule      | Fix                                                                                                 |
  | ------------------ | --------------------------------------------------------------------------------------------------- |
  | 7.1-3              | Untagged paths and text become `/Artifact`; untagged text must equal the page's `aria-hidden` count |
  | 7.1-5              | Role map `Strong` to `Span`                                                                         |
  | 7.2-20             | `LI` content beside `Lbl` moves into an `LBody`                                                     |
  | 7.18.1-2, 7.18.5-2 | Link annotations get `/Contents` from the page's link text                                          |
  | 7.1-8              | XMP title, language and PDF/UA identifier                                                           |
  | Not a rule         | Bookmarks are retitled from the page: Chromium drops spaces at line breaks                          |

- Update the size and page count wherever the PDF is linked;
  `tests/slides.spec.ts` fails until they match.
- Reprint after changing a slide; `tests/talk-pdf.spec.ts` fails when
  `slides.md` no longer matches. Speaker notes do not count.

### Presenting

```sh
npm run dev
```

- Open `/talks/<deck>/presenter/` for yourself and the slideshow from its
  "Open the Slideshow" link for the room; put that window on the projector and
  press Full Screen.
- The windows stay in sync; arrow keys and Page Up/Down (clickers) work in
  both. In full screen Space, Shift+Space and Enter also turn the slide, and
  Escape leaves.
- Shows the slide, notes, next title and a timer. Dev server only. Edited
  notes show on reload.

## Replace the logo

Sizes and roles of every file: [ARCHITECTURE.md assets](../ARCHITECTURE.md#assets)
and [the favicon set](../ARCHITECTURE.md#the-favicon-set).

1. Swap the mark, `#131313` artwork on a transparent ground:
   - `src/assets/mark-dark.png`: 840 x 900, read by `Header.astro`,
     `Roundel.astro` and `about.astro`.
   - `artwork/mark-dark.svg`: the vector source, read by `npm run og`.
2. Keep the 840:900 aspect. For another one, update `MARK_WIDTHS` and the
   `sizes` in `src/components/Roundel.astro`; `tests/image-size.spec.ts` fails
   on drift.
3. Redraw the tab icon `public/favicon.svg` (64 x 64 viewBox).
4. Render the PNGs from it, sizes as in the favicon table:
   - `public/favicon-96x96.png`.
   - `artwork/favicon-16x16.png`, `artwork/favicon-32x32.png`,
     `artwork/favicon-48x48.png`, then rebuild `public/favicon.ico` with the
     `convert` command under the table; it must hold 16, 32 and 48.
5. Render the app icons on a full-bleed `#FFC000` square:
   `public/apple-touch-icon.png` (180), `public/android-chrome-192x192.png`,
   `public/android-chrome-512x512.png` and `public/maskable-icon-512x512.png`
   (mark inside the 80% safe zone). `src/pages/site.webmanifest.ts` and
   `src/layouts/BaseLayout.astro` already link these names.
6. Run `npm run og` to redraw `public/images/og-default.png` (1200 x 630) from
   the new `artwork/mark-dark.svg`
   ([the sharing image](#the-sharing-image)).
7. Update the `alt` in `src/lib/og-image.ts`, which describes the sample mark,
   and the mark and icon lines in [AI_DISCLOSURE.md](../AI_DISCLOSURE.md).

Verify:

```sh
npm run build
npm run check
npx playwright test tests/icons.spec.ts tests/image-size.spec.ts tests/seo.spec.ts
```

- `tests/icons.spec.ts` fails on a linked icon missing from the build, a
  `sizes` value the file does not match, an `.ico` without 16, 32 and 48, and
  a manifest without exactly one maskable icon.
- `npm run check:untransformed` fails if `src/assets/mark-dark.png` is renamed:
  update its entry in `scripts/check-untransformed.mjs`.
- `tests/alt-text.spec.ts` and `tests/image-priority.spec.ts` match the file
  name `mark-dark`; keep it or update both.

## The sharing image

`public/images/og-default.png` is the link preview for every page without a
post cover. Render it after changing your name, `site.tagline` or `site.name`:

```sh
npm run og
```

- `scripts/make-og.mjs` reads those three values from `src/site.config.ts`
  and the colors from `src/styles/global.css`, and draws the image in
  Chromium with Lexend and `artwork/mark-dark.svg`.
- Text is inserted as text, never markup. A name over 40 characters, or one
  that does not fit at the smallest size, fails with a message;
  `src/site.config.ts` already caps each tagline line at 40.
- Needs the Playwright Chromium from Setup; no network.

## Publishing a CV

- Put the PDF under `public/` and set `person.cv` in `src/site.config.ts` to
  its path. `/career` links it with its size.
- `tests/cv.spec.ts` then checks it: no identifying metadata, a title, a
  language, tags. `npm run check:pdf` validates it against PDF/UA-1.
- `npm run check` fails on an `/Author` or `dc:creator` in any tracked PDF
  (`scripts/check-leaks.mjs`); remove them before committing.
