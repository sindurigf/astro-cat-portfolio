# Accessibility

The accessibility statement this template ships with: what it aims for, what
is tested, what is not, and how to report a barrier. The public summary is the
site's `/accessibility` page, built from this file.

The owner and both reporting rows in section 1 are the template maintainer's
own details, so the template's statement reaches a real person. In a fork,
replace the project, owner and reporting rows with yours and review the rest
before you publish: until you do, your visitors' barrier reports go to her.
The build fails, and `npm run check:live` exits 2, while a real `site.url`
still publishes her rows.

The statement is voluntary for a personal site and follows the
[W3C model for accessibility statements](https://www.w3.org/WAI/planning/statements/).

## 1. Project information

<!-- TODO(fork): Replace the Project, Accessibility owner and both reporting rows with your own, and set Last reviewed once you have reviewed this file. -->

| Field               | Value                                                      |
| ------------------- | ---------------------------------------------------------- |
| Project             | astro-cat-portfolio                                        |
| Project type        | Static personal website (Astro, two Vue islands, Tailwind) |
| Accessibility owner | Sinduri Guntupalli                                         |
| Public reporting    | <https://github.com/sindurigf/astro-cat-portfolio/issues>  |
| Private reporting   | <lol@sinduri.lol>                                          |
| Target standard     | WCAG 2.2 Level AA, with AAA text contrast                  |
| Conformance status  | **Target only. No claim that the site meets it.**          |
| Last reviewed       | 2026-10-16                                                 |

`src/lib/accessibility-facts.ts` reads the Target standard, Conformance status,
Last reviewed and both reporting rows into `/accessibility` at build time and
throws if a row is missing. `tests/accessibility-page.spec.ts` asserts the
status is still "Target only. No claim that the site meets it." While the
Public reporting URL or the repository is on an example host, the page leaves
out its link.

## 2. Commitment

- WCAG 2.2 AA is the floor. AAA criteria are met where practical (below).
- Both color modes are measured: dark by default, light on request.
- Keyboard first: every control is reachable, visible when focused, and never
  hidden under the sticky header.
- No motion traps: the homepage hero field and each About cat can be paused,
  and nothing moves under `prefers-reduced-motion: reduce`.
- Native HTML before ARIA.
- Every color is measured against every ground it is used on.
- Automated checks run in CI and a violation blocks the merge.
- Untested means untested: gaps are listed in [section 7](#7-known-gaps), not
  implied away.

### AAA criteria in scope

| Criterion                            | What we do                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.4.6 Contrast (Enhanced)            | Every text token at rest clears 7:1 on every ground it is used on, dark, light and gold. `pink` is never text; `pink-text` is. Ratios: [contrast table](docs/STYLEGUIDE.md#contrast). Under the pointer, sampled controls on every route are hovered and their text measured at 7:1, large text included: dark mode across header, main and footer (`tests/states.spec.ts`), light mode in `<main>` (`tests/light-mode.spec.ts`).                                                                                                                                                                                                                                                                                   |
| 1.4.8 Visual Presentation            | `tests/visual-presentation.spec.ts`, every route at 390, 1280 and 1920: a visible `p`, `li` or `dd` of more than one sentence has at most 80 characters a line, line height 1.5 or more and no justification (not measured: the open cat card, set at 1.2, and talk slides from 1024px wide, whose text token is 1.35); each `p` followed by a `p` leaves 2.5em of the larger text from its last line box's top to the next one's first. Width at 200%: `tests/reflow.spec.ts`; at the 500% zoom some headings need for 2x, `tests/zoom-lines.spec.ts` keeps every line on screen at 200 and 256px. Colors: browsers can override them (G156); the theme switch offers light and dark (`tests/light-mode.spec.ts`). |
| 2.2.4 Interruptions                  | Nothing interrupts: no alerts, assertive live regions or automatic refresh.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 2.3.3 Animation from Interactions    | Under `prefers-reduced-motion: reduce` a pressed control does not move into its shadow, the hero field is drawn once and held, and the About cats sit still on the brick under them (`tests/press.spec.ts`, `tests/motion.spec.ts`, `tests/about-cats.spec.ts`).                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 2.4.9 Link Purpose (Link Only)       | Within a page, one link name leads to one place. Hidden text completes short names: "Community tag", "Robin on GitHub". Exception: link text in posts, listed in `tests/link-purpose.spec.ts`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 2.4.12 Focus Not Obscured (Enhanced) | No focused control is even partly covered. On pages, none sits under the sticky header in either Tab direction (`tests/focus.spec.ts`); the About cats' sleep and trick controls sit beside their cat buttons, and the last cat's band ends at the raised card above it; inside the open cat card, photo viewer and menu, and from an open trick list, every stop is wholly uncovered (`tests/focus-obscured.spec.ts`). In full-screen slides the focused heading is never covered (`tests/slideshow.spec.ts`), but on a 16:9 screen the pointer bar, while shown, covers part of the bottom edge of the ring drawn around the slide.                                                                               |
| 2.4.13 Focus Appearance              | One solid ring, `--focus-width` wide. At every page focus stop it covers at least a 2px perimeter of the control and reaches 3:1 against the ground it paints over.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 2.5.5 Target Size (Enhanced)         | Every pointer target outside a sentence has a 44 by 44px area of its own, never shared: controls are drawn at `--spacing-target` (44px); header nav bricks are 44px tall; breadcrumb links get a pointer area wider than their drawn box (`.hit-target`); footer links are 44px rows. `tests/target-size.spec.ts` hit-tests every target at 305px and 1280px on every page, listings sampled, in the open cat card and photo viewer, and in the open menu at 305px. An open trick list is not hit-tested.                                                                                                                                                                                                           |
| 2.5.6 Concurrent Input Mechanisms    | No input is turned off because another one was detected.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 3.1.3 Unusual Words                  | On functional pages (statement, privacy, credits, brand), jargon is written in plain words, or defined in the sentence of its first use and marked with `<dfn>` (G112, H54). Posts, About, Career and the contact page's introduction are the site owner's copy and are not checked.                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 3.1.4 Abbreviations                  | On functional pages (statement, privacy, credits, brand), each abbreviation's first use is a `<button popovertarget>` around an `<abbr>`, described by its expansion (`aria-describedby`). A tap or Enter opens the expansion with no script, and Escape or a press elsewhere closes it; a script adds hover and focus and places it under the abbreviation. A browser without popovers reads the expansion inline in brackets, and the script removes the button there. A Creative Commons license in a photo caption ("CC BY 4.0") is instead a link to its deed, which names it in full (G55). Posts, About and Career are the site owner's copy and are not checked.                                            |
| 3.2.5 Change on Request              | No new windows, automatic refresh or navigation by script.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |

axe's `wcag2aaa` rules are not run.

## 3. Scope and supported environments

In scope:

- Every route in `tests/routes.ts`, and the layouts, components, tokens and
  Markdown they are built from.
- `/contact/send/`, the one on-demand route, tested over HTTP and, for its
  error pages, in Chromium (`tests/contact.spec.ts`).
- Every PDF under `public/`: the sample talk, `public/talks/sample-talk.pdf`,
  and a CV once `person.cv` is set in `src/site.config.ts`.

Not in scope: third-party sites linked from the footer, the talk presenter
view (development server only, never published), and forks.

| Environment      | Support                                                                                                              |
| ---------------- | -------------------------------------------------------------------------------------------------------------------- |
| Browsers         | Chrome and Edge 120, Firefox 128, Safari and iOS Safari 17 ([ARCHITECTURE.md](ARCHITECTURE.md#browser-support))      |
| Engines tested   | Chromium and Firefox locally and in CI; WebKit in CI and through Docker (`npm run test:webkit`)                      |
| Color modes      | Dark by default. With JavaScript, the Theme menu offers System (follows the device), Light and Dark (remembered)     |
| Forced colors    | Windows High Contrast (`forced-colors: active`)                                                                      |
| No JavaScript    | Navigation and the contact form work; the page stays dark and the theme switch is hidden; the hero field stays blank |
| Zoom and spacing | 400% zoom at 1280px (320px reflow), SC 1.4.12 text spacing                                                           |
| Screen readers   | None tested. See [gap 2](#7-known-gaps)                                                                              |

## 4. What the site supports

- **axe, WCAG tags.** Every route passes `wcag2a`, `wcag2aa`, `wcag21a`,
  `wcag21aa` and `wcag22aa` with no rule disabled and no result excluded, in
  dark mode, in light mode, at 320px in both, and with the mobile menu open.
  The photo viewer open, a post's contents open and the talk past its cover
  are scanned too. The experimental rules in those tags, which axe ships off,
  are turned on (`AXE_EXPERIMENTAL_RULES` in `tests/wcag.ts`).
- **axe, best practice.** Every route passes `best-practice` in its own block.
- **Undecided results.** Every `incomplete` result from the WCAG scans is
  decided (`tests/incomplete.ts`): contrast by walking the paint stack, label
  in name (SC 2.5.3) by passing only a control whose visible text is symbols,
  which
  [Understanding 2.5.3](https://www.w3.org/WAI/WCAG22/Understanding/label-in-name.html)
  puts out of scope.
- **Reflow.** No route scrolls sideways at 305px (320px less a classic 15px
  scrollbar, the stricter case), with and without the SC 1.4.12 override, or at
  640px, 768px, 1024px, 1280px and 1920px. Open dialogs and menus are outside
  this sweep. The content box matches the
  [heading floors](docs/STYLEGUIDE.md#heading-floors), no heading word is wider
  than its box, and no text or control sits past either edge. Below 320px
  (1000px and 1280px windows at 500% zoom), every line of text stays on
  screen and no route scrolls sideways at 200px or 256px (SC 1.4.8). On a
  short window (320x256, 667x375, 683x384) the photo viewer draws each photo
  no smaller than its thumbnail, whole in a window of 20rem or taller, and
  scrolls to its buttons (`tests/photo-viewer.spec.ts`).
- **Text resize.** Headings other than talk titles reach 2x at 200% zoom
  (talk titles: [gap 7](#7-known-gaps)); other text reaches 2x by
  page zoom in Chromium and Firefox ([Text resize](#text-resize-sc-144)).
- **Text size control.** Smaller, Larger and Reset step the reading text
  (lead, standfirst, post teaser, body, label) from 75 to 200 percent. From
  86rem wide it is an "Aa Text Size" button on the right edge that opens a
  native popover; below that an "Aa Text Size" button in the header opens the same
  group in a popover below `md`, and from `md` it is in the Theme menu. Escape closes the popover and returns focus to its
  button, a press outside or Tab out closes it, and it slides away while a
  control in the page has keyboard focus (SC 2.4.11). A step that would scroll
  the page sideways is taken back and announced (SC 1.4.10). The browser's own
  zoom and text-only zoom still work (SC 1.4.4). `tests/reading-tab.spec.ts`.
- **Target size.** A 44px square centered on every target outside a sentence
  hits only that target, at 305px and 1280px, on every page (listings sampled
  as below) and in the open cat card, photo viewer and menu (SC 2.5.5).
- **Keyboard.** The tab order is walked in both directions on every page at
  two widths; category and tag listings, one template differing only by label,
  are walked once per group that shows the same posts. Each stop is hit-tested
  against the sticky header, with no part under it (SC 2.4.11, 2.4.12), and
  its ring measured against the ground it lands on (SC 1.4.11) and for area
  (SC 2.4.13). Inside the open cat card, photo viewer and menu, no stop is even
  partly covered (SC 2.4.12). The walk proves each stop is reached, not that
  it works when pressed ([gap 8](#7-known-gaps)).
- **Sticky header.** Below 30rem of viewport height the header scrolls away
  instead of covering the page.
- **Focus ring.** One global ring, offset past the element's shadow, measured
  on every ground ([STYLEGUIDE Focus](docs/STYLEGUIDE.md#focus)).
- **Mobile menu.** A native modal `<dialog>` that returns focus and works at
  400% zoom ([STYLEGUIDE The menu](docs/STYLEGUIDE.md#the-menu)).
- **No JavaScript.** A fallback navigation replaces the mobile menu, sits
  below the header and never duplicates the primary nav.
- **Current page.** `aria-current` in every navigation, plus a shape change,
  never color alone: a gold brick with an inset ink ring in the header, a brick
  pressed into its shadow in the menu, a filled block in the no-JavaScript
  navigation, an underline in the footer.
- **Help.** Every page has the Get in Touch link: in the header from 48rem,
  in the menu below it (SC 3.2.6).
- **Headings and titles.** One `h1`, no skipped level, nothing under 19px
  outside a dialog.
  Every `<title>` is distinct, and every one but the homepage's names the
  page before the site.
- **Language.** One language, declared in `<html lang>`, `og:locale`,
  structured data and the feed. Latin phrases carry `lang="la"`.
- **Alt text.** Every image in the build is named or decorative on purpose;
  a failed photo shows its alt text on its frame without doubling it for a
  screen reader.
- **Motion.** The hero field on `/` has a pause control and each cat on
  `/about` a sleep control (SC 2.2.2). Both are still under reduced motion;
  nothing else animates ([STYLEGUIDE Motion](docs/STYLEGUIDE.md#motion)).
- **Forced colors.** Every non-link control keeps a painted border or opaque
  background, except the last row of a cat's trick list (set in the CSS; no test opens the list in forced colors); links are distinct
  from body text, every focus stop on `/` keeps an outline, and the menu
  button's bars take `ButtonText`.
- **Contact form.** Labels with "(required)" in words, `autocomplete` on name
  and email (SC 1.3.5), a focused error summary on failure, typed values kept
  on a 422, `aria-disabled` on the button and a `role="status"` message while
  sending, with no `aria-busy` to hold that message back. Details
  in gap 1. With `contact.form: 'none'` there is no form and `/contact` shows
  the email address.
- **Talk PDF.** Passes PDF/UA-1 in `npm run check:pdf`. See gap 6. Below
  `lg` (1024px) the talk page links it with its size and shows every slide as
  text that reflows, so the PDF is never the only way to read the talk on a
  narrow screen (SC 1.4.10).

- **Font loading.** No WCAG criterion. Lexend is preloaded with
  `font-display: optional`; a page that paints first keeps a fallback sized to
  Lexend's average width and line box, so text never moves after first paint
  (`tests/font-fallback.spec.ts`, `tests/performance.spec.ts`, Chromium).
  Reflow, heading fit, line length and text resize are tested in Lexend only.

Passing axe is not conformance.

### Text resize (SC 1.4.4)

[Understanding 1.4.4](https://www.w3.org/WAI/WCAG22/Understanding/resize-text.html):
"it should still be possible to get 200% text enlargement in some way
compared to the default 100% zoom".

- **Headings:** page, reading, hero, section (h2 and h3), post and card
  titles are fixed sizes, so they reach 2x at 200% zoom at every width, in every browser and
  with text-only zoom. `tests/text-resize.spec.ts` asserts it at 390, 1000,
  1280 and 1920px.
- **Other text:** tokens with a `vw` or `svh` term grow less than the zoom
  factor, so 2x comes at a higher page zoom, up to 500% in Chromium and
  Firefox. The spec finds the lowest zoom that reaches 2x for each and fails
  if none does. Some slide tokens reach 2x only at 500%, the browsers'
  ceiling; the spec's annotation names them.
- **Safari:** its Page Zoom list stops at 300% on macOS and iOS, not
  confirmed from an Apple or WebKit source. The spec runs WebKit up to 300%
  and records which tokens reach 2x there without failing. Others reach 2x in
  Safari only through system magnification (Zoom on macOS and iOS); the site
  does not use Dynamic Type (`-apple-system-body`). Known limit.
- **Text-only zoom:** Firefox "Zoom Text Only" scales the `rem` parts only,
  so `vw` text other than headings does not reach 2x that way. Under
  [F94](https://www.w3.org/WAI/WCAG22/Techniques/failures/F94) one working
  method is enough.

The lowest zoom each token needs, per browser and width, is the spec's "lowest
zoom reaching 2x" annotation in the Playwright report.

## 5. Color and contrast

Every token, ratio and color rule is in [docs/STYLEGUIDE.md](docs/STYLEGUIDE.md).
The [contrast table](docs/STYLEGUIDE.md#contrast) there is generated from the
CSS and `tests/contrast-table.spec.ts` fails when it drifts.

### Dark surfaces

- `text`, `subtle`, `gold`, `cyan` and `pink-text` clear 7:1 on `background`
  and `surface`.
- `border` carries every boundary and clears SC 1.4.11.
- `pink` is non-text only; `pink-text` carries every pink glyph.
- The focus ring clears every shadow it could touch
  ([Focus](docs/STYLEGUIDE.md#focus)).

### The gold surface

A full or thin PageHero slab, the closing band on `/contact`, the quote on
`/about`, the close row card, the homepage hero window and any
`Section surface="gold"` are `#FFC000`. Every dark
token fails on it, so `.surface-gold` swaps in a near-black set, links stay
underlined (SC 1.4.1) and the dark buttons are replaced by gold ones:
[Gold surface](docs/STYLEGUIDE.md#gold-surface).

### Blocks

Every card, the plain hero slab and the post contents are gold or light blocks
with a 4px ink edge. Inside, the color tokens are remapped, so text is ink at
7:1 or more and the focus ring is `gold-link` (`tests/blocks.spec.ts`,
[Colors](docs/STYLEGUIDE.md#color-tokens)).

### Light mode

With JavaScript, `<main>`, the header and the footer turn light when the
header's Theme menu is on Light, or on System (the default) while
`prefers-color-scheme` is `light`; System follows a device change at once.
Light and Dark are remembered. Without JavaScript the page stays dark and the
switch is hidden. Every text color clears 7:1 on white:
[Light mode](docs/STYLEGUIDE.md#light-mode).

## 6. How it is tested

### Automated

Playwright runs the production build in Chromium and Firefox, and WebKit in
CI, on every pull request and every push to `main`. Any failure blocks the
merge.

| Check                               | WCAG                                                             | Notes                                                                                                                                                                                                                                                                                                           |
| ----------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/a11y.spec.ts`                | 2.2 A and AA                                                     | axe on every route, at 320px, menu open, open states; decides `incomplete` contrast                                                                                                                                                                                                                             |
| `tests/reading-tab.spec.ts`         | 1.4.4, 1.4.10, 1.4.11, 2.1.1, 2.4.3, 2.4.11, 2.5.5, 4.1.2        | Text size control: names and descriptions, 44px targets, axe open in each placement, Escape, outside press and Tab out, forced-colors edges, reduced motion, no sideways scroll at 400% zoom, nothing covered at rest                                                                                           |
| `tests/let-it-fall.spec.ts`         | 2.3.3, 2.4.11, 2.5.5, 4.1.3                                      | One press drops the blocks above the button, which stays the hit target and keeps focus; axe on the landed pile; no sideways scroll; the button, Esc or focus elsewhere restores; announced; no animation under reduced motion; no button without JavaScript or on talk decks                                   |
| `tests/light-mode.spec.ts`          | 2.2 A and AA, 1.4.11, 2.1.1, 2.4.7, 2.5.5, 4.1.2                 | axe in light mode on every route and at 320px; control edges at 3:1; Theme menu: its names, keys and Escape, a pick closing it with focus back on the button, choices across a reload, System following the device live, on screen at 320 and 1280px, its ring and forced colors; the theme set before `<body>` |
| `tests/gold-surface.spec.ts`        | 1.4.3, 1.4.11                                                    | Text on gold and control edges on every gold section; the `/contact` ring at 305px                                                                                                                                                                                                                              |
| `tests/gold-link.spec.ts`           | 1.4.1, 1.4.3                                                     | Links on gold at rest and under the pointer                                                                                                                                                                                                                                                                     |
| `tests/blocks.spec.ts`              | 1.4.3, 1.4.6, 1.4.11, 2.4.7, 1.4.10                              | Every block's fill or edge 3:1 and its text 7:1, dark and light; links in blocks through hover and focus, ring inside the block; no sideways scroll at 1280, 390, 305; forced colors keep block edges                                                                                                           |
| `tests/contrast-table.spec.ts`      |                                                                  | STYLEGUIDE.md contrast table matches the tokens                                                                                                                                                                                                                                                                 |
| `tests/focus.spec.ts`               | 2.4.7, 2.4.11, 2.4.12, 2.4.13, 1.4.11                            | Tab and Shift+Tab on every page at two widths, listings sampled; no stop under the header; ring contrast and area                                                                                                                                                                                               |
| `tests/ring-clearance.spec.ts`      | 1.4.11                                                           | A focus ring outside its control never starts inside that control's own shadow, at rest or hovered                                                                                                                                                                                                              |
| `tests/focus-obscured.spec.ts`      | 2.4.12                                                           | Every stop in the open cat card, photo viewer and menu, each About cat control, and every stop reached from an open trick list, wholly uncovered                                                                                                                                                                |
| `tests/sticky-header.spec.ts`       | 2.4.11                                                           | Header static under 30rem; no focused control under it                                                                                                                                                                                                                                                          |
| `tests/edge-contrast.spec.ts`       | 1.4.11                                                           | Every drawn edge 3:1 against its ground unless its fill is, every route, dark and light, 390px and 1280px; at rest only                                                                                                                                                                                         |
| `tests/edges.spec.ts`               | 1.4.11                                                           | One edge role per ground on `/`; a card is a block with an ink edge and no paper; gold-fill edges against the fill                                                                                                                                                                                              |
| `tests/states.spec.ts`              | 1.4.1, 1.4.6, 1.4.11                                             | Hover drawn; dark-mode hovered text at 7:1 on every route; current page is a shape; chip rings clear neighbors                                                                                                                                                                                                  |
| `tests/nav-current.spec.ts`         | 1.3.1, 4.1.2                                                     | `aria-current` in every nav                                                                                                                                                                                                                                                                                     |
| `tests/link-purpose.spec.ts`        | 2.4.9                                                            | One link name, one destination, on every route; hidden text keeps the visible words first                                                                                                                                                                                                                       |
| `tests/unusual-words.spec.ts`       | 3.1.3                                                            | Each listed term a `<dfn>` at first use, defined in its sentence; every `<dfn>` listed; replaced jargon stays out; `/404` links its idioms                                                                                                                                                                      |
| `tests/abbreviations.spec.ts`       | 3.1.4, 1.4.13                                                    | First use of each listed abbreviation described by its expansion, which opens without JavaScript; focus and tap show it, Escape and a second tap hide it, the pointer can cross onto it, it opens with no gap to cross and inside 320px; no unlisted abbreviation on functional pages; no "min read"            |
| `tests/text-resize.spec.ts`         | 1.4.4                                                            | Lowest page zoom, up to 500%, at which each viewport-sized text token reaches 2x, at four widths                                                                                                                                                                                                                |
| `tests/target-size.spec.ts`         | 2.5.5                                                            | Every target's 44px square, on pages and in open dialogs, at 305px and 1280px                                                                                                                                                                                                                                   |
| `tests/reflow.spec.ts`              | 1.4.10, 1.4.12                                                   | No sideways scroll; content box; heading word fit                                                                                                                                                                                                                                                               |
| `tests/visual-presentation.spec.ts` | 1.4.8                                                            | Line length, line height and paragraph spacing at three widths, open cat card included                                                                                                                                                                                                                          |
| `tests/zoom-lines.spec.ts`          | 1.4.8                                                            | Every line of text on screen and no sideways scroll at 200px and 256px, the 500% zoom widths; code blocks and photo strips scroll in their own region                                                                                                                                                           |
| `tests/hero-fit.spec.ts`            | 1.4.10, 1.4.11, 1.4.12, 2.2.2, 2.4.11                            | Hero name unclipped and uncovered; no visible sticker over text in a window too short for it; pause control on the first screen beside the first name, every point of it reachable, clear of the name, edge and ring 3:1 on the page                                                                            |
| `tests/close-row.spec.ts`           | 1.4.10                                                           | The close row's sticker never covers its text                                                                                                                                                                                                                                                                   |
| `tests/mobile-menu.spec.ts`         | 2.1.1, 2.4.3                                                     | Menu opens, takes focus, returns it; widened from 320px it closes, leaves one Primary navigation and no dialog                                                                                                                                                                                                  |
| `tests/no-script.spec.ts`           | 2.1.1, 1.3.1                                                     | Navigation with scripting off                                                                                                                                                                                                                                                                                   |
| `tests/forced-colors.spec.ts`       | 1.4.11, 2.4.7                                                    | Forced colors, listings sampled; every focus stop on /; not WebKit                                                                                                                                                                                                                                              |
| `tests/motion.spec.ts`              | 2.2.2, 2.3.3                                                     | Hero field pauses; nothing moves under reduced motion                                                                                                                                                                                                                                                           |
| `tests/about-cats.spec.ts`          | 1.4.1, 1.4.3, 1.4.10, 1.4.11, 2.2.2, 2.4.11, 2.5.5               | Cat buttons, card dialog, focus return, sleep controls, trick lists, reduced motion; a moving cat never scrolls the page; on a stepped wall a cat stands on, and is clickable on, the brick under it                                                                                                            |
| `tests/headings.spec.ts`            | 1.3.1, 2.4.6                                                     | One `h1`, no skipped level, no heading under 19px                                                                                                                                                                                                                                                               |
| `tests/structure.spec.ts`           | 1.3.1, 2.4.1, 2.4.6                                              | The accessibility tree: one banner, main and contentinfo in order, named unique landmarks, one `h1` opening main, an `h2` opening each region, the home link named for the site                                                                                                                                 |
| `tests/titles.spec.ts`              | 2.4.2                                                            | Titles distinct and descriptive                                                                                                                                                                                                                                                                                 |
| `tests/site-language.spec.ts`       | 3.1.1                                                            | One declared language everywhere                                                                                                                                                                                                                                                                                |
| `tests/alt-text.spec.ts`            | 1.1.1                                                            | Every image named or decorative on purpose                                                                                                                                                                                                                                                                      |
| `tests/card-click.spec.ts`          | best practice (Intopia Card)                                     | A blog card follows its title link on a click and keeps its teaser selectable on a drag                                                                                                                                                                                                                         |
| `tests/list-semantics.spec.ts`      | 1.3.1                                                            | Every list drawn without markers outside `<nav>` carries `role="list"`, which Safari needs to keep it a list                                                                                                                                                                                                    |
| `tests/failed-images.spec.ts`       | 1.1.1                                                            | A failed photo shows its alt text; its name is exposed once, with and without JavaScript                                                                                                                                                                                                                        |
| `tests/print.spec.ts`               | 1.3.1, 1.3.2                                                     | On paper the talk prints one slide per page, the cover included, and a post prints its In This Post list open                                                                                                                                                                                                   |
| `tests/contact.spec.ts`             | 3.3.1, 3.3.2, 3.3.3, 3.3.5, 3.3.6, 2.4.12                        | 422 and 503 in a browser: input kept, hints beside errors, no focus covered; honeypot, rate limit                                                                                                                                                                                                               |
| `tests/contact-sending.spec.ts`     | 4.1.3                                                            | Status text, no busy ancestor, no second submit                                                                                                                                                                                                                                                                 |
| `tests/slideshow.spec.ts`           | 1.4.4, 1.4.10, 1.4.11, 1.4.12, 2.1.1, 2.3.3, 2.4.7, 2.5.6, 4.1.3 | Buttons, keys, live region, focus, full screen (keys, the pointer and touch bar, focus ring, 200% zoom clipping, text spacing), page-view titles and text 2x by page zoom, title words fit 305px; below `lg`: no controls, the PDF link, every slide once, in order, no JS                                      |
| `tests/word-spacing.spec.ts`        | 1.3.1                                                            | No word glued to an inline element                                                                                                                                                                                                                                                                              |
| `tests/wave-alerts.spec.ts`         |                                                                  | WAVE's possible-heading, redundant-link and noscript alerts                                                                                                                                                                                                                                                     |
| `tests/console.spec.ts`             |                                                                  | No console error, CSP violation or failed request on any route                                                                                                                                                                                                                                                  |
| `tests/not-found.spec.ts`           |                                                                  | An unknown path returns 404, not 200; Follow Me leads to the page a mistyped address meant, or home without a match or JavaScript, with that title under it and hidden from assistive technology; Or Ask the Cat opens the sections without JavaScript                                                          |
| `tests/accessibility-page.spec.ts`  |                                                                  | `/accessibility` linked from every page and matches section 1                                                                                                                                                                                                                                                   |
| `scripts/check-pdf.mjs`             | PDF/UA-1                                                         | veraPDF on every PDF under `public/` (`npm run check:pdf`)                                                                                                                                                                                                                                                      |
| `tests/talk-pdf.spec.ts`            |                                                                  | The talk PDF was printed from the current slides                                                                                                                                                                                                                                                                |
| `tests/media-alternatives.spec.ts`  | 1.2.6, 1.2.7, 1.2.8, 1.4.7                                       | Fails any video or audio without its captions, transcript, sign language and description links; no embeds                                                                                                                                                                                                       |
| `tests/change-on-request.spec.ts`   | 3.2.5, 2.2.4                                                     | No new windows, automatic refresh, script navigation, alerts or assertive live regions                                                                                                                                                                                                                          |
| `tests/input-mechanisms.spec.ts`    | 2.5.6                                                            | No pointer, hover or touch detection that could turn an input off                                                                                                                                                                                                                                               |
| `npm run typecheck`                 |                                                                  | Templates, scripts and the Vue islands type-check                                                                                                                                                                                                                                                               |

Limits:

- Only rules in the WCAG A and AA tags, experimental ones included, and
  `best-practice` run. A green suite says nothing about AAA rules.
- A contrast rule measures a label against its own control, not the control
  against the ground: a control with no visible edge passes axe.
  `tests/gold-surface.spec.ts` checks fill or border against the ground.
- `overflow-wrap: break-word` hides a heading floor that is too large: the
  heading breaks mid-word instead of overflowing. The heading word fit check
  covers this.
- `tests/forced-colors.spec.ts` skips all but one test on WebKit, which
  reports `forced-colors: active` and paints the author palette anyway. The
  remaining test fails if that changes in any engine.
- Headless WebKit is not Safari and says nothing about VoiceOver.
- Some checks run in one engine: `tests/forced-colors.spec.ts` skips WebKit;
  the contact server error pages, layout shift, `@engine-invariant` specs and
  the WAVE alerts run in Chromium only; `tests/text-resize.spec.ts` records
  WebKit without asserting. Specs tagged `@node` read the build with no
  browser.
- `tests/contact.spec.ts` needs the Worker and runs in Chromium only
  (`playwright.worker.config.ts`). Specs tagged `@node` read the build with no
  browser.

### Manual

[docs/MANUAL_TESTING.md](docs/MANUAL_TESTING.md) is the checklist. The
template ships with none of it run; record your own results. Not automated:

- Whether the focus order makes sense and the ring is easy to find.
- Screen reader announcements, including how CSS-uppercased names are read
  (Chromium exposes `"ABOUT"` for markup `About`).
- Reduced motion, 400% zoom and text-only zoom, by hand.
- Firefox and Safari, by hand.
- Plain language, cognitive load and reading order.
- Jargon or idioms not yet listed (SC 3.1.3): no machine tells a term of art
  from an ordinary word, so a person reads the functional pages for them.

## 7. Known gaps

1. **The contact form's error path is untested by a person.** Asserted over
   HTTP: labels, a 422 keeping typed values, `aria-invalid`, summary links,
   "(required)" in each label, honeypot, rate limit, the summary's
   `autofocus`. Asserted in the browser: `aria-disabled` and "Sending" on the
   button, the status text, no busy ancestor, no second submit, the
   back-forward cache reset. Asserted in Chromium only, on the 422 and 503
   pages: focus lands on the summary, axe finds no WCAG 2.2 AA violation,
   typed values stay, each hint and error stays tied to its field, and no
   focused control is covered at 320px and 1280px, walking Tab from the summary
   and Shift+Tab from the last footer link. In markup only: `novalidate`, the
   summary's `tabindex="-1"` (no `role="alert"`, to avoid a double read), and
   the inset pink error ring.
   `/contact/send/` is outside `tests/routes.ts`, so the route-level suites
   never render the error state and Firefox and WebKit never see it. Nobody
   has judged whether the messages help (SC 3.3.1, 3.3.3) or heard them with a
   screen reader. SC 3.3.7 and 3.3.8 do not apply.
2. **No screen reader testing.** No NVDA, JAWS, VoiceOver or Orca run.
   [MANUAL_TESTING.md](docs/MANUAL_TESTING.md) §6 is an Orca pass in Firefox,
   with §6.4 in Chrome for the uppercase question. An Orca pass narrows this
   gap; it does not close it.
3. **The gold surface has been measured, not looked at.**
   `tests/gold-surface.spec.ts` measures every route at desktop width, and
   the `/contact` button at 305px:

   | Measured                                    | Result                                     |
   | ------------------------------------------- | ------------------------------------------ |
   | `.btn-gold-primary` on `/contact`, at 305px | its fill delimits it on gold               |
   | its focus ring                              | inner `#FFFFFF` ring, at least 3:1 on fill |
   | every string on a gold ground, every route  | nothing below 4.5:1                        |

   `.btn-gold-secondary` (on `/` and `/career`) is measured by its border edge
   on gold, in the same spec.
   Nobody has tabbed, zoomed or listened to a gold band.
   [MANUAL_TESTING.md](docs/MANUAL_TESTING.md) §5 checks the ring on gold by
   eye; nothing there covers zooming or listening to a gold band.

4. **Fixture and in-situ gold tests cover different mistakes.** Fixtures can be
   broken on purpose; only the in-situ test catches a mistake in a shipped
   route. Both stay.
5. **Prose has not been judged.** Reading order, heading usefulness and link
   text out of context have not been assessed by a person on any page.
6. **The talk PDF has not been read with a screen reader.**
   `public/talks/sample-talk.pdf` passes PDF/UA-1 in `npm run check:pdf`:
   tagged, a bookmark and heading per slide, a description on every link.
   `tests/talk-pdf.spec.ts` fails when `slides.md` changes without a reprint.
   Reading order across cards, how capitalized slide labels are spoken, and
   whether viewers expose the structure are unchecked
   ([MANUAL_TESTING.md](docs/MANUAL_TESTING.md) §13). The HTML slideshow at
   `/talks/sample-talk/` passes the route suites; nobody has heard it (§13.5).
7. **Some talk slide text reaches 2x only above 200% zoom.** Met by page
   zoom ([Text resize](#text-resize-sc-144)). Lowest zoom measured in Chromium:
   - Page-view slide titles: 200% at 1280 and 1920, 250% at 305 and 320, 300%
     at 390, 500% at 1000. They follow the screen so every title word fits a
     305px slide.
   - Cover title: 500% at 1280.

   Worked out from the size tokens, not measured by a spec:
   - Full-screen titles: 500% (1280x720, 1920x1080).
   - Full-screen text: 300% (1280x720), 400% (1920x1080).

8. **Keyboard use is reached, not pressed.** `tests/focus.spec.ts` proves
   every control is reached and its ring visible. Activation by Enter or Space
   is tested only for the menu (`tests/mobile-menu.spec.ts`), the skip link,
   the slides, the cat buttons, the theme switch, the hero pause control, the
   photo viewer and the contact form.

## 8. Reporting a barrier

If something on this site blocks you, report it. You do not need to know the
WCAG criterion or say anything about yourself.

- **Public:** <https://github.example/robin-ohara/example-site/issues>
- **Private:** <hello@example.com>

Useful, never required: the page address, the problem, steps to reproduce,
severity, your browser and device, any assistive technology, and screenshots or
recordings.

Replies aim to arrive within the number of days set as
`accessibility.responseDays` in `src/site.config.ts`.

Content that does not work for someone is sent another way on request, for
example as plain text.

| Severity | Meaning                                                  | Priority                 |
| -------- | -------------------------------------------------------- | ------------------------ |
| Blocker  | You cannot complete a task (read, navigate, send a form) | Above everything else    |
| Serious  | You can complete it only with a workaround or with help  | Next, before new work    |
| Moderate | It works but is confusing, slow or tiring                | Scheduled with new work  |
| Minor    | Cosmetic or best practice; nothing is blocked            | When the area is touched |

## 9. Contributor checklist

Rules this repository follows. Values and reasons:
[docs/STYLEGUIDE.md](docs/STYLEGUIDE.md).

- **Contrast.** Measure a new color on every ground it can meet
  ([Adding a color](docs/STYLEGUIDE.md#adding-a-color)). Never `pink` on
  text; never `pink-text` on non-text.
- **Gold.** Build gold grounds with `.surface-gold` only. Never the dark
  tokens, `.btn-primary` or `.btn-secondary` on gold.
- **Focus.** Never remove an outline. A focusable element that casts a shadow
  sets `lift-control` or `lift-object`. A new ground gets its ring measured
  against the ground and the element's edge. Never `outline-offset: 0`.
- **Keyboard.** Check tab order in both directions: Shift+Tab is the direction
  that goes under the sticky header.
- **Targets.** A 44x44px pointer area of its own, never overlapping another.
- **Motion.** [STYLEGUIDE Motion](docs/STYLEGUIDE.md#motion).
- **Semantics.** Native elements first: `<button>`, `<dialog>`, `<details>`.
  One `h1`, no skipped level. Name a `<section>` only with its visible
  heading. No "navigation" in a nav label.
- **Case.** Follow the [case rule](docs/STYLEGUIDE.md#uppercase) and uppercase with CSS.
- **Images.** Alt describes the content, never the type or filename; `alt=""`
  when decorative. Never text over a photograph; the axe scans fail it. Photos
  sit in an `.aspect-frame`.
- **Links.** Underlined in running text. Link text makes sense on its own.
  Current page: `aria-current` plus a shape change, never color alone.
- **SVG.** Decorative SVG is `aria-hidden="true" focusable="false"`.
- **ARIA.** Only where no native element works, with a comment saying why.
  No `aria-label` over visible text, except one that repeats it exactly: the
  logo link, where a `<wbr>` splits Chromium's computed name. Below 48rem the
  name is not drawn and the `aria-label` is the link's only name. A toggle with
  `aria-expanded` or `aria-pressed` keeps a constant name; the hero's transport
  control is named for its action, "Pause the hero animation" or "Play the
  hero animation".
- **Media.** No embedded players: an `<iframe>` hides its media from
  `tests/media-alternatives.spec.ts`. A `<video id>` has a captions track
  (1.2.2) and links with `data-media-for="<id>"` and `data-media-alternative`
  of `transcript` (1.2.8), `sign-language` (1.2.6) and `extended-description`
  (1.2.7). An `<audio id>` has a `transcript` link (1.2.1) and
  `data-background-audio-checked` once a person has heard background sound
  stay 20 dB under speech (1.4.7).
- **Forms.** Visible labels with "(required)" in words, `autocomplete` on
  personal fields, `aria-invalid` and `aria-describedby` on errors, a focused
  error summary. `aria-disabled`, never `disabled`, on buttons.
- **Forced colors.** A control bounded only by a shadow has no edge in forced
  colors: give it a border or an opaque fill.
- **Reflow.** Never add horizontal padding to a page container. A display
  heading word over twelve characters takes a soft hyphen.
- **Conflicting needs.** When one group's need works against another's, name
  both groups, choose, and record the choice and its reason in this file. A
  W3C note, opinion here, gives an example:
  [low vision needs](https://www.w3.org/TR/low-vision-needs/), high contrast
  against light sensitivity.
  Choices made:
  - A dark page against a light one: the Theme menu in the header offers
    System, Light and Dark. System, the default, follows the device and is dark
    when the device states no preference; a choice is remembered.
  - High contrast against light sensitivity: text keeps 7:1 in both modes;
    the dark default carries the light-sensitive need.
  - Capitals against dyslexia: uppercase only on headings, labels and
    buttons of a few words, never on running text
    ([why](ARCHITECTURE.md#rejected-findings)).
- **Scripts.** Never hold content back behind a script. What a page says is in
  its HTML; a script only adds to it. Tested for navigation, the About
  cats' names and lines and the homepage hero's still frame
  (`tests/no-script.spec.ts`) and the talk slides
  (`tests/slideshow.spec.ts`).
- **Sources.** WCAG 2.2 and the specifications it relies on (HTML, WAI-ARIA,
  CSS) are normative; the Understanding documents are informative W3C
  guidance. Mark any other source cited here, an article, checklist or tool, as
  opinion.
- **Unusual words.** On a functional page, write jargon in plain words. Where
  the term is needed, define it in the sentence of its first use, mark it with
  `<dfn>`, and list it in `tests/unusual-words.spec.ts`.
- **This file.** Update it in the same commit as the change. A gap is removed
  when it has been tested, not when it was fixed in passing.

## 10. Criteria that do not apply

| Criterion                       | Why                                                                                                             |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| 1.2.x Time-based media          | No video or audio is published; `tests/media-alternatives.spec.ts` fails the first one without its alternatives |
| 2.5.7 Dragging Movements        | Nothing drags                                                                                                   |
| 3.3.7 Redundant Entry           | Nothing is asked twice                                                                                          |
| 3.3.8 Accessible Authentication | No authentication                                                                                               |
