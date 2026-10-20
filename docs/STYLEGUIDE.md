# Styleguide

The design reference for this template: every visual rule, token and value.
Neo-brutalist, dark by default: heavy borders, hard offset shadows with zero
blur, uppercase headings, tilted marks.

- Tokens are defined in `@theme static` in `src/styles/global.css`. Where this
  file and the stylesheet disagree, the stylesheet is right.
- How tokens are enforced and how light mode is switched:
  [ARCHITECTURE.md](../ARCHITECTURE.md#design-system).
- The agent checklist, `.claude/skills/design-system/SKILL.md`, links
  here.

## Tokens only

- Never an arbitrary value: no raw hex, no `text-[32px]`, no
  `shadow-[8px_8px_0]`. A missing value is a new token in `@theme`.
- Keep `static` on `@theme`: without it an unused token is tree-shaken and
  `var(--color-…)` resolves to nothing.
- `npm run check:tokens` fails on anything else:
  [Token enforcement](../ARCHITECTURE.md#token-enforcement).

## Principles

### The gold register

- `cyan` is what you are touching: hover and focus, never at rest. Inside a
  block that job goes to `gold-link` (11.38 on gold, 14.49 on light), new with
  blocks: cyan is 1.01 on gold.
- `pink` is depth and error: hard shadows, the invalid edge.
- `border` is boundary. `text` is words.
- Gold is the single accent, held by a register rather than one job. A review
  checks the rendered page against the register, not a count. Do not "reduce
  gold to one job".
- **A gold use not on this list adds a row, with its argument, in the same
  change.**

| #   | Where gold is spent                                                                                                                | Measured on                            |
| --- | ---------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| 1a  | Ground, full slab: `/about`, `/career`, `/contact`, `/blog`, `/credits`, `/brand`                                                  | 6 routes                               |
| 1b  | Ground, thin slab: `/contact/sent`, every post                                                                                     | 6 routes                               |
| 1c  | Ground, mid-page: a `Section surface="gold"`, the About quote, `/contact`'s closing band                                           | `/career`, `/about`, `/`, `/contact`   |
| 2   | The primary action: `.nav-cta`, `.btn-primary`                                                                                     | 11 routes, 4 routes                    |
| 3   | the logo marks: the roundel, the homepage sticker; the logo cat is Hela's coat, not gold                                           | 9 routes, `/`                          |
| 4   | Card labels, `.label text-gold`; a form's field labels are `text`                                                                  | `/about`, `/accessibility`, `/contact` |
| 4a  | A talk slide's label, bold words, part number and lead-in term before a colon; its text links, still underlined                    | `/talks/<deck>/`                       |
| 5   | Category: the blog label and the homepage glyph tiles, ink-edged on gold                                                           | 3 routes                               |
| 6   | Display words: the homepage family name                                                                                            | `/`                                    |
| 7   | List markers in `.bullet-list`                                                                                                     | wherever a bulleted list is            |
| 8   | The `gold` swatch and the contrast samples on gold; fills, hex in both modes                                                       | `/brand`                               |
| 9   | Edges in dark mode: `border` on fields, controls, chips, rules and the outer edge of a gold area                                   | every route                            |
| 10  | The header bar, a gold ground in both modes; its current-page brick, theme switch and call to action read on it by their ink edges | every route                            |

- 9 is the edge because the only two colors are ink and gold: an ink edge
  vanishes on the dark page and a light one adds a third color. Gold reads as
  structure there (10.60 or more on both dark grounds), and inside gold every edge
  is ink.

- 4a's lead-in terms and links make a projected slide's key words readable at
  a glance; light mode turns them ink, like bold words.
- A use with a replacement takes it: a `/career` date is `subtle`; the
  homepage stat numbers are ink on a wall of light blocks (gold on gold is
  1.00).

### The grid is visible where it is structural

- Drawn only where it carries content: the hero slab's 6/6 split, the four
  3-column spans of the `/accessibility` fact strip (divided by `border`
  rules), a post's reading column beside its contents rail.
- No cast-block wall.

### At most two light areas, and never two of a kind

- No two light areas in view at once as areas.
- No two of the same kind on one page: one gold band (a whole section) and
  one light block outside a `.card-block` may share a page; two bands may
  not.
- Judged per screen, not per document: `/career` has a slab, a block and a
  band, and at 1280 by 900 no two share a screen as areas.

### Where brutalism and accessibility pull apart

| Tension                             | Resolution                                                                                                                                                                                      |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Heavy uppercase, tight tracking     | Uppercase on headings, labels and buttons only. Tracking -0.05em on h1 and h2, -0.02em on h3 and titles; labels +0.1em. A heading word over 12 characters takes a soft hyphen.                  |
| Loud accents against 4.5:1          | `pink` `#FF007A` never sets text. `pink-text` `#FF79B6` carries every pink glyph ([Contrast](#contrast)).                                                                                       |
| Hard shadow looks like a focus ring | The ring is cyan, which appears only on interaction, offset past the element's shadow by `--lift`, so it only touches ground (11.86).                                                           |
| Error signaled by color             | `pink` against `border` or gold is 2.31. An error is a shape change (a 4px pink inset ring inside the edge, which stays ink in a block), a ✕ mark and words.                                    |
| Tilt hurts reading                  | Tilt only marks (tile, roundel, stickers), at 3deg. Text and headings never rotate; a sticker's label of one to three words turns with it (close row eyebrow, post tags; `tests/tilt.spec.ts`). |
| Grayed-out disabled fails SC 1.4.11 | Dashed edge, no shadow. Label stays 9.34; control stays focusable (`aria-disabled`).                                                                                                            |
| Density against 320px reflow        | Spacing tokens are fluid; every border is counted in the 288px content box before any heading floor changes.                                                                                    |

## Color tokens

| Token        | Hex       | Job                                                            |
| ------------ | --------- | -------------------------------------------------------------- |
| `background` | `#0B0B0B` | Page ground; header, footer, bands                             |
| `surface`    | `#1A1A1A` | Inputs and controls off a block                                |
| `border`     | `#FFC000` | Every boundary on the page: the gold edge                      |
| `card-edge`  | none      | Card and plain slab edge; `#131313` in light mode              |
| `fill-edge`  | `#131313` | Edge of a gold or light fill: buttons, roundel                 |
| `text`       | `#E5E2E1` | Words                                                          |
| `subtle`     | `#9EB6C7` | Captions, meta, helper text                                    |
| `gold`       | `#FFC000` | The accent, only where the style guide allows                  |
| `cyan`       | `#00DCFD` | Hover and focus only                                           |
| `pink`       | `#FF007A` | Depth and error; never text                                    |
| `pink-text`  | `#FF79B6` | Every pink glyph; never non-text                               |
| `mark`       | `#FF007A` | Logo marks; same in both modes                                 |
| `tile-edge`  | `#5A87A8` | Logo tile copies' edge; both modes                             |
| `cat-*`      | 14 fills  | About cat drawings and props; decoration, never a boundary     |
| `hero-*`     | 6 values  | Homepage canvas ground, veil, floor and glyph glow; decoration |

The gold-ground set is in [Gold surface](#gold-surface), light values in
[Light mode](#light-mode).

- Two dark grounds: `background` (page, header, footer, bands) and `surface`
  (cards, inputs). Measure every foreground against both.
- Blocks: every card, the plain hero slab and the post contents are a gold
  `block-gold` or light `block-light` fill with a 4px `block-ink` edge
  (`--block-edge`) and the pink throw. Cards are gold; every second card in a
  `.card-block`, `.card-solid`, the plain hero slab and the post contents are
  light. Inside a block the color tokens are remapped, so `text-text` and
  `text-gold` are ink (11.32 on gold, 14.42 on light), `subtle` is `gold-muted`
  (7.88) or `light-subtle` (7.40), and a badge inverts. Gold fills use
  `block-gold`, which never remaps. `tests/blocks.spec.ts`.
- Walls: blocks in a `.card-block` share 4px walls with no gap, and the wall
  casts the one throw along its outline, so it shows on outer edges only.
- The Step Up: the throw falls down and right, so a wall only climbs right.
  Bricks in one row rise by `--step-y` (48px from 1120px; half for the second
  of three or more); stacked rows bring their right edge in by `--step-x`, at
  most twice. A drop would end the throw against a brick face. The
  post contents juts right and the contact submit and talk slides jut left
  by `--step-x` (24px).
  Both are 0 below 640px. Juts are translates or margins that never widen
  the page.
- `text` for words, `subtle` for captions and meta. Links are `text`, cyan on
  hover; in running text underlined at 2px, 4px on hover.
- `cyan` never at rest: a cyan label, fill or shadow reads as a control under
  the pointer.
- `pink` never sets text, at any size. `pink-text` never sets a border, shadow
  or fill. Do not merge them. Utilities: `bg-pink`, `border-pink`,
  `text-pink-text`.
- A gold or light fill takes the `fill-edge`, never `border`: the fill is
  what meets the page. A dark fill (a `.sticker`, a chip, a disabled button)
  keeps `border`: an ink edge would vanish on it.
- `tests/edge-contrast.spec.ts`: on every route, both modes, 390 and 1280px,
  a drawn edge reaches 3:1 on its ground unless its fill does.
- `border` is the SC 1.4.11 floor and `subtle` is set by contrast:
  re-measure before changing either.
- "Where you are" is a shape, not a color: see [Navigation](#states).
- Never signal state by color alone (SC 1.4.1).

### Adding a color

1. Add it as a token in `@theme`.
2. Measure it on `#0B0B0B` and `#1A1A1A`, on `#FFC000` if it can appear on
   gold, and its light value on `#ffffff`. A color with alpha is measured as
   it paints: composite it over each ground first, then take the ratio.
3. Meet 4.5:1 for text (7:1 where achievable), 3:1 for large text, borders,
   focus rings and icons.
4. Add it to the table above and run `node scripts/contrast-table.mjs --write`.
   A token that can sit on gold also goes in the checked gold tables
   ([Gold surface](#gold-surface)).

## Contrast

Every approved pairing, measured from the live tokens. Text needs 7.0 at
every size (SC 1.4.6, as /accessibility claims); non-text needs 3.0 (SC
1.4.11). "Kept apart" rows must never touch.

<!-- contrast-table:start -->

<!-- Generated by scripts/contrast-table.mjs --write from src/styles/global.css. tests/contrast-table.spec.ts fails if it drifts. -->

| Foreground                | Background            | Job        | Used for                                         | Needs | Ratio | Result     |
| ------------------------- | --------------------- | ---------- | ------------------------------------------------ | ----- | ----- | ---------- |
| `text` #E5E2E1            | `background` #0B0B0B  | text       | Reading text, headings                           | 7.0   | 15.28 | pass       |
| `text` #E5E2E1            | `surface` #1A1A1A     | text       | Text in inputs and controls                      | 7.0   | 13.51 | pass       |
| `subtle` #9EB6C7          | `background` #0B0B0B  | text       | Captions, meta, helper text                      | 7.0   | 9.34  | pass       |
| `subtle` #9EB6C7          | `surface` #1A1A1A     | text       | Meta text on a surface                           | 7.0   | 8.26  | pass       |
| `gold` #FFC000            | `background` #0B0B0B  | text       | Card labels                                      | 7.0   | 11.99 | pass       |
| `gold` #FFC000            | `surface` #1A1A1A     | text       | Labels on a surface                              | 7.0   | 10.60 | pass       |
| `pink-text` #FF79B6       | `background` #0B0B0B  | text       | Error text, pink glyphs                          | 7.0   | 8.12  | pass       |
| `pink-text` #FF79B6       | `surface` #1A1A1A     | text       | Error text on a surface                          | 7.0   | 7.18  | pass       |
| `cyan` #00DCFD            | `background` #0B0B0B  | text       | Hover text; the focus ring (needs 3)             | 7.0   | 11.86 | pass       |
| `cyan` #00DCFD            | `surface` #1A1A1A     | text       | Hover text and focus ring on a surface           | 7.0   | 10.49 | pass       |
| `border` #FFC000          | `background` #0B0B0B  | non-text   | Every boundary on the page                       | 3.0   | 11.99 | pass       |
| `border` #FFC000          | `surface` #1A1A1A     | non-text   | Input and chip edges on a surface                | 3.0   | 10.60 | pass       |
| `pink` #FF007A            | `background` #0B0B0B  | non-text   | Error edge; action shadow                        | 3.0   | 5.19  | pass       |
| `pink` #FF007A            | `surface` #1A1A1A     | non-text   | Error edge on a field off a block                | 3.0   | 4.59  | pass       |
| `background` #0B0B0B      | `gold` #FFC000        | text       | Label on a gold fill                             | 7.0   | 11.99 | pass       |
| `background` #0B0B0B      | `cyan` #00DCFD        | text       | Label on a hovered button                        | 7.0   | 11.86 | pass       |
| `background` #0B0B0B      | `text` #E5E2E1        | text       | Badge; the current page block                    | 7.0   | 15.28 | pass       |
| `gold-text` #131313       | `gold` #FFC000        | text       | Text on the gold surface                         | 7.0   | 11.32 | pass       |
| `gold-muted` #3A3020      | `gold` #FFC000        | text       | Secondary text on gold                           | 7.0   | 7.88  | pass       |
| `gold-link` #1E0D16       | `gold` #FFC000        | text       | Links on gold                                    | 7.0   | 11.38 | pass       |
| `gold` #FFC000            | `gold-link` #1E0D16   | text       | A link filled under the pointer                  | 7.0   | 11.38 | pass       |
| `gold-bud` #00363F        | `gold` #FFC000        | decoration | The canvas buds on gold                          | n/a   | 8.00  | decoration |
| `gold-border` #131313     | `gold` #FFC000        | non-text   | Boundaries on gold                               | 3.0   | 11.32 | pass       |
| `fill-edge` #131313       | `gold` #FFC000        | non-text   | Edge of a gold fill                              | 3.0   | 11.32 | pass       |
| `fill-edge` #131313       | `text` #E5E2E1        | non-text   | Edge of a light fill                             | 3.0   | 14.42 | pass       |
| `surface` #1A1A1A         | `background` #0B0B0B  | decoration | A surface; its edge sets it apart                | n/a   | 1.13  | decoration |
| `surface` #1A1A1A         | `gold` #FFC000        | non-text   | Chip fill on the hero slab                       | 3.0   | 10.60 | pass       |
| `gold-btn-label` #FFFFFF  | `gold-text` #131313   | text       | Label on the dark button on gold                 | 7.0   | 18.58 | pass       |
| `gold` #FFC000            | `background` #0B0B0B  | decoration | Object shadow                                    | n/a   | 11.99 | decoration |
| `cyan` #00DCFD            | `background` #0B0B0B  | decoration | Hovered card shadow                              | n/a   | 11.86 | decoration |
| `cat-minerva` #A57A4D     | `background` #0B0B0B  | decoration | About cat fill; the `text` edge is the boundary  | n/a   | 5.15  | decoration |
| `cat-hela` #F4EFE8        | `background` #0B0B0B  | decoration | About cat fill; the `text` edge is the boundary  | n/a   | 17.21 | decoration |
| `cat-rudra` #211E1D       | `background` #0B0B0B  | decoration | About cat fill; the `text` edge is the boundary  | n/a   | 1.19  | decoration |
| `cat-minerva-eye` #A4C94A | `cat-minerva` #A57A4D | decoration | Minerva’s green eyes; the pupil carries the look | n/a   | 2.01  | decoration |
| `text` #E5E2E1            | `surface` #1A1A1A     | non-text   | About cat sticker edge on a card                 | 3.0   | 13.51 | pass       |
| `pink` #FF007A            | `gold` #FFC000        | decoration | Shadows on gold                                  | n/a   | 2.31  | decoration |
| `text` #E5E2E1            | `gold` #FFC000        | never      | Dark-surface text is never used on gold          | n/a   | 1.27  | never used |
| `subtle` #9EB6C7          | `gold` #FFC000        | never      | Dark-surface meta is never used on gold          | n/a   | 1.28  | never used |
| `pink-text` #FF79B6       | `gold` #FFC000        | never      | Error text is never used on gold                 | n/a   | 1.48  | never used |
| `border` #FFC000          | `gold` #FFC000        | never      | A gold area’s outer edge, never inside gold      | n/a   | 1.00  | never used |
| `gold-btn-label` #FFFFFF  | `gold` #FFC000        | never      | Only on the dark button fill                     | n/a   | 1.64  | never used |
| `cyan` #00DCFD            | `pink` #FF007A        | apart      | A ring never touches a pink shadow               | n/a   | 2.29  | kept apart |
| `cyan` #00DCFD            | `gold` #FFC000        | apart      | A ring never touches a gold shadow or fill       | n/a   | 1.01  | kept apart |
| `cyan` #00DCFD            | `border` #FFC000      | apart      | A ring never touches a neighbor edge             | n/a   | 1.01  | kept apart |
| `pink` #FF007A            | `border` #FFC000      | apart      | An error is a shape change, not a recolor        | n/a   | 2.31  | kept apart |
| `pink` #FF007A            | `gold` #FFC000        | never      | An invalid edge in a block stays ink             | n/a   | 2.31  | never used |
| `text` #E5E2E1            | `subtle` #9EB6C7      | apart      | The two text colors never carry a state          | n/a   | 1.63  | kept apart |

<!-- contrast-table:end -->

## Gold surface

`#FFC000` as a ground: the grounds in [the gold register](#the-gold-register),
rows 1a to 1c. L(`#FFC000`) is 0.5896, so AAA needs a foreground luminance of
0.0414 or less: only near-blacks read on it. Every dark token (`border`,
`text`, `subtle`, `pink-text`, `pink`, `cyan`) fails on gold. Use the inverted
set; hex values and ratios are in the generated [Contrast](#contrast) table:

| Token            | Job                                                     |
| ---------------- | ------------------------------------------------------- |
| `gold-text`      | Body copy, headings, button borders, the focus ring     |
| `gold-muted`     | Secondary copy                                          |
| `gold-border`    | Structural rules, dividers, card edges and shadows      |
| `fill-edge`      | Edge of a gold or light fill, on gold or off it         |
| `gold-link`      | Links, underlined; the block on hover                   |
| `gold-bud`       | The canvas buds on gold. Decoration                     |
| `gold-btn-label` | Label and inner ring on `.btn-gold-primary`'s fill only |

- Build gold with `.surface-gold`, never `bg-gold` by hand. It repaints text,
  `.lead`, `.panel-lead` and `.standfirst` (`gold-text`), links (`gold-link`,
  underlined), the focus ring (`gold-text`) and default borders
  (`gold-border`); the area's own outer edge keeps `border`, gold on gold,
  since it meets the page. A card inside turns transparent with
  `shadow-hard-gold-border-4`; a `.card-block` wall on gold is light blocks
  with the ink edge (`/career`); a linked chip keeps its dark fill with a
  `gold-text` edge.
- A whole gold section (hero slab, gold band) is also a `.gold-column`.
- Keep the link underline: `gold-link` is 1.01 against `gold-text`, so the
  underline carries SC 1.4.1.
- `gold-btn-label` sits only on `.btn-gold-primary`'s `#131313` fill (18.58),
  never on gold.
- No `gold-subtle`: a third step would be indistinguishable from `gold-text`.
  Below `gold-muted`, hierarchy is weight and size.
- No `cyan`, `pink` or `pink-text` on gold, not even a shadow, except the pink
  shadow on buttons, chips and photos, which is decoration and never delimits
  a control. A `.sticker` carries its own dark ground.
- A utility written inside a gold section (`border-border`, `text-subtle`)
  beats the subtree default and is a bug. axe misses it;
  `tests/gold-surface.spec.ts` catches it.
- No single line of text crosses the gold's edge: nothing clears 4.5 on both
  grounds. The homepage name breaks on the rule, `text` above and `gold-text`
  below; `tests/hero-fit.spec.ts` keeps it two lines.

### Buttons on gold

- Never `.btn-primary` (a 1.00 fill on gold) or `.btn-secondary` (a light
  block on a gold one: two accents in one block, pink shadow 2.31).
- `.btn-gold-primary`: `gold-text` fill, `gold-btn-label` label, 4px
  `gold-text` border, `shadow-hard-mark-4`, the two-tone ring
  ([Focus](#focus)).
- `.btn-gold-secondary`: transparent, `gold-text` label and 4px border, no
  shadow, single ring.
- Borders are `gold-text`, matching the fill, not `gold-border`.
  `tests/gold-surface.spec.ts` asserts every control on gold has a visible
  edge: a fill that differs from the ground, or a border of at least 3:1.
- Both are scoped to `.surface-gold` and render unstyled elsewhere.
- Both `text-button`, 900, 0.1em, uppercase, `px-8 py-4`. No underline on the
  label.

## Light mode

The switch and what it scopes: [ARCHITECTURE.md](../ARCHITECTURE.md#light-mode).

- The header's theme switch offers System, Light and Dark. System follows
  `prefers-color-scheme`, live, and is the default; Light and Dark are
  remembered.
- A click, Enter or Space on a choice picks it, closes the menu and returns
  focus to the switch (SC 2.4.3). Arrow keys move the choice and keep it open.

| Token                                               | Light     | on `#ffffff` |
| --------------------------------------------------- | --------- | ------------ |
| `background`, `surface`, `hero-ground`              | `#ffffff` | ground       |
| `text`, `border`, `pink`, `gold-border`, `gold-bud` | `#131313` | 18.58        |
| `card-edge`                                         | `#131313` | 18.58        |
| gold as text, `.text-gold`                          | `#131313` | 18.58        |
| `subtle`                                            | `#3f4650` | 9.53         |
| `pink-text`                                         | `#b00054` | 7.06         |
| `cyan` (focus ring and hover text)                  | `#0047b3` | 8.23         |

- Every hard shadow and edge turns `#131313`.
- Hover fills are dark mode's `#00dcfd` under `#131313` (11.20).
- `.surface-gold` and `.v-column` go white. Buttons, tiles and stickers keep
  their `#FFC000` fill, always under `#131313` (11.32).
- Gold text turns ink; a `.label.text-gold` and a slide label gain a gold
  square before the word.
- Blocks stay gold or light in light mode, with the `#131313` edge (18.58 on white).
- The header bar keeps its `#FFC000` fill and `#131313` edge; its throw
  turns `#131313`.
- The footer follows the mode like `<main>`: white in light mode, its words
  7:1 or more and its tiles apart from it (`tests/footer.spec.ts`).
- Logo marks use `mark`, `tile-edge`, the `cat-hela*` coat and
  `shadow-hard-mark-*` or `drop-shadow-hard-mark-*`, never `pink` or `border`:
  they do not change with the mode.
- The label on a gold fill is `gold-text`, never `background` (white in
  light).
- The homepage's second sticker and `.sticker` are black blocks.
- `tests/light-mode.spec.ts` scans every route in light at WCAG 2.2 AA.

## Type scale

Lexend Variable, weights 400 and 900 only. Heading sizes are fixed so 200%
zoom doubles them (SC 1.4.4); other sizes are `clamp()` tokens; the
copyright and contents list are fixed, and `text-code` is `max(1rem, 0.92em)`,
0.92 of the text around it with a 16px floor.

| Token                     | Min px | Max px | Line height | Weight | Use                                   |
| ------------------------- | ------ | ------ | ----------- | ------ | ------------------------------------- |
| `text-hero-h1`            | 36     | 36     | 0.94        | 900    | Homepage name only                    |
| `text-h1`                 | 48     | 48     | 0.94        | 900    | Page title                            |
| `text-deck-cover`         | 33     | 80     | 0.94        | 900    | Talk cover title                      |
| `text-reading-h1`         | 40     | 40     | 0.94        | 900    | Privacy, Accessibility title          |
| `text-h2`                 | 28     | 28     | 0.96        | 900    | Section and panel heading             |
| `text-h3`                 | 22     | 22     | 1.1         | 900    | Third-level heading, card title       |
| `text-display`            | 20     | 32     | 1.1         | 900    | Links, values and stats, not headings |
| `text-lead`               | 24     | 24     | 1.55        | 400    | Lead; card paragraph                  |
| `text-post-title`         | 32     | 32     | 1.06        | 900    | Post title, in its own case           |
| `text-post-h2`            | 28     | 28     | 1.02        | 900    | Post section; `.reading-layout`       |
| `text-post-h3`            | 22     | 22     | 1.15        | 900    | Post subsection, last level           |
| `text-post-card`          | 24     | 24     | 1.15        | 900    | Post card title (an `h2`)             |
| `text-post-card-feature`  | 28     | 28     | 1.02        | 900    | Featured post card title              |
| `text-contents`           | 16     | 16     | 1.35        | 400    | A post's contents list                |
| `text-standfirst`         | 20     | 36     | 1.55        | 400    | Slab aside, `.standfirst`             |
| `text-post-teaser`        | 21     | 26     | 1.55        | 400    | Post and plain-tier aside             |
| `text-body`               | 18     | 19     | 1.62        | 400    | Reading text                          |
| `text-code`               | 16     | none   | 1.5         | 400    | Code, `--font-mono`; tracks body      |
| `text-button`             | 14     | 16     | 1.2         | 900    | Buttons; same as `text-label`         |
| `text-label`              | 14     | 16     | 1.2         | 900    | Labels; 16 to 40rem, 14 at 48rem      |
| `text-hero-sticker`       | 18     | 30     | 1.02        | 900    | Homepage hero stickers                |
| `text-menu`               | 34     | 56     | 1           | 900    | Mobile menu links                     |
| `text-slide`              | 17     | 34     | 1.35        | 400    | Slide text: full screen, print        |
| `text-slide-title`        | 26     | 65     | 1           | 900    | Talk slide title, its own case        |
| `text-slide-title-page`   | 24     | 56     | 1           | 900    | Slide title on the page               |
| `text-slide-number`       | 72     | 160    | 1           | 900    | Talk part number                      |
| `text-slide-frame`        | 17     | 34     | 1.35        | 400    | Slide text in full screen, by frame   |
| `text-slide-title-frame`  | 26     | 65     | 1           | 900    | Slide title in full screen, by frame  |
| `text-slide-number-frame` | 72     | 160    | 1           | 900    | Part number in full screen, by frame  |
| `text-copyright`          | 20     | 20     | 1.2         | 900    | Footer copyright                      |
| `text-footer-name`        | 32     | 40     | 1           | 900    | Footer name                           |
| `text-section-number`     | 21     | 28     | 1           | 900    | Category glyph tile                   |
| `text-quote-mark`         | 64     | 144    | 0.75        | 900    | About quote mark                      |

- Lexend, self-hosted from `@fontsource-variable/lexend` (OFL-1.1), family
  `'Lexend Variable'`. Only the latin subset is declared, in the `@font-face`
  at the top of `global.css`: importing the package CSS ships all three
  subsets. Never the Google Fonts CDN.
- `font-display: optional`: Lexend is preloaded, and a page that paints
  before it arrives keeps a `Lexend Fallback` family for its lifetime, so no
  line moves after first paint; the next page has Lexend from cache. The
  fallback is a local Arial or Roboto face with `size-adjust` and the ascent,
  descent and line-gap overrides set to Lexend's mean advance and line box.
  Each face keeps Lexend's `unicode-range`, so nothing changes for the
  characters Lexend has. A
  character in the range that Lexend lacks (a prime, a per mille sign) takes
  the fallback face: one wider glyph on the same line box.
  `scripts/font-fallback-metrics.mjs` prints the numbers;
  `tests/font-fallback.spec.ts` holds the faces to Lexend's metrics and
  checks that a font arriving after first paint is not swapped in.
- `--font-mono` is the platform monospace stack, nothing downloaded.
- A paragraph of more than one sentence (SC 1.4.8): line height 1.5 or more
  (`--leading-paragraph` at display size) and at most 80 characters a line
  (`max-w-measure` on body text outside `.prose`).
- Two paragraphs in a row: `--spacing-paragraph` under the first when its own
  leading and margin leave less than 2.5em between line tops (a lead, a
  standfirst, two `text-body` lines `mt-2` apart).
  `tests/visual-presentation.spec.ts` measures every route.
- 400 for reading text; 900 for headings, card titles, labels, buttons, names
  and quoted text. Never 300 or `font-bold`.
- Every size is a token. No breakpoint steps.
- Nothing renders under 16px on a phone: `text-label` and `text-button` are
  16px to 40rem (`tests/text-size.spec.ts`).
- Headings never skip levels; one `<h1>` per page. No heading is larger than
  the level above it (`tests/headings.spec.ts`); a /brand example, shown at
  another page's size, is exempt.
- `text-hero-h1` is 36px so the homepage name stays two lines.
- `text-reading-h1` is for the Privacy and Accessibility titles only.
- The talk cover keeps the fluid `text-deck-cover`; the deck has its own
  rule ([ACCESSIBILITY.md](../ACCESSIBILITY.md) gap 7).
- Posts use `text-post-*`. Do not raise them to the page scale.
- The footer motto's 32px floor keeps about 11 characters on one line at 288px.
- Tracking: `--tracking-heading` -0.05em on h1 and h2, `--tracking-title`
  -0.02em on h3, post and slide titles and the footer name, `--tracking-label`
  0.1em on labels and buttons.
- The standfirst is `max-w-2xl`, `--spacing` step 8 under the title.

### Heading floors

Set by reflow, not taste. `.page-gutter` leaves a 273px content box at 305px
(400% zoom) and 288px at 320px. Each fixed heading size is the largest whose
longest word fits there; `tests/reflow.spec.ts` holds them.

- `text-h1` 48px: `CREDITS` fits 273px.
- `text-reading-h1` 40px: `ACCES-SIBILITY` breaks at its soft hyphen.
- `text-hero-h1` 36px: a ten-letter family name fits the name's 241px window.
- `text-h2` 28px: `ARCHAEOLOGY` fits. `text-h3` 22px, 0.8 of it.
- `text-post-title` 32px.
- A longer word in a heading fails `reflow.spec.ts`'s heading-word fit on
  every built route. The fix is a soft hyphen in the source, not a smaller
  token.
- Never zero the gutter below `sm`; move the floors instead.
- Headings set `hyphens: auto` and `overflow-wrap: break-word`. Never
  `hyphens: none` on a heading.

### Uppercase

- Write headings and labels in Chicago title case and sentences in sentence
  case. The lower-case words are in `TITLE_CASE_SMALL_WORDS`
  (`src/lib/labels.ts`); the first and last word are always capitalized, and
  each part of a hyphenated compound counts as a word ("One-Keeper Problem").
  `npm run check:title-case` scans the built headings, titles and summaries.
  It cannot see server-rendered `/contact/send` or the dev-only presenter;
  check their headings and buttons by hand.
- `.label`, `.badge`, the buttons and every heading apply
  `text-transform: uppercase`. A post title and a talk slide title keep their
  written case (`.post-title`, `.slide-title`).
- Chromium exposes the uppercased string in the accessible name (`About`
  becomes `"ABOUT"`); Firefox and WebKit do not. Real case in the markup is the
  one input correct under both, and keeps copy, search and previews in real
  case.
- How a screen reader announces caps is untested
  ([MANUAL_TESTING.md](MANUAL_TESTING.md) §6). Do not claim caps are spelled
  out letter by letter.

### Soft hyphens

- A word over twelve characters in an `h1` or `h2` takes a soft hyphen
  (U+00AD) at a syllable boundary. Chromium's hyphenation dictionary misses
  uppercased words; a soft hyphen survives `text-transform`.
- Width, not count, is the real test: measure against 273px at the heading's
  size (`WOODWORKING`, eleven letters, overflows at 33px).

| Path                                     | Write                         |
| ---------------------------------------- | ----------------------------- |
| `.astro` template text                   | `<h1>Acces&shy;sibility</h1>` |
| Markdown body heading                    | `## Announce&shy;ments`       |
| Frontmatter, or any interpolated `{...}` | the literal U+00AD character  |

Interpolated `&shy;` is escaped and renders as `&SHY;`. Mark a literal U+00AD
with a comment beside it.

## Spacing scale

- Base unit 4px. Allowed Tailwind steps: **0, 1, 2, 3, 4, 6, 8, 12, 16, 24**
  (4 to 96px).
- Banned: half steps (0.5, 2.5, 3.5), odd steps (5, 7), and 10, 14, 20, 28.
- `scripts/check-tokens.mjs` fails on any other step in a margin, padding, gap
  or inset utility.

| Token                                     | Value                                          | 390px  | 1200px and up |
| ----------------------------------------- | ---------------------------------------------- | ------ | ------------- |
| `--spacing-section`                       | section to section                             | 56     | 96            |
| `--spacing-head`                          | heading or lead to content; content to actions | 32     | 48            |
| step 6                                    | heading to lead                                | 24     | 24            |
| `--spacing-grid`                          | card to card                                   | 28     | 40            |
| `--spacing-inline`; step 6                | inline controls; chips                         | 16; 24 | 24; 24        |
| `--spacing-card-tight` / `--spacing-card` | card padding                                   | 24     | 40 from 640px |
| `--spacing-paragraph`                     | under a paragraph followed by another          | 1.1em  | 1.1em         |

### Gutter and column

- The gutter is `.page-gutter` (`px-4 sm:px-6`) on the header, `<main>` and
  `<footer>` only. Never add or remove horizontal padding on a page
  container: it breaks the 273px box the heading floors are calibrated to.
- `.band` breaks out of the gutter with negative margins that duplicate
  `.page-gutter`'s four values; change them together.
- The column is `max-w-page` (80rem) on the element inside the gutter, never
  the gutter inside the column: it drifts by one gutter above 80rem.
- Decorations position against the layout they sit in, never the viewport.
  On small screens move a decoration rather than deleting it.

### The roundel's size

- `--spacing-roundel` is `2 × --spacing-section − 56px`: 56px on a phone,
  128px from about 1150px.
- Derived so the disc keeps at least 24px to the hero's last line and 32px to
  the next content; it is lifted `--spacing(1)` above the edge to split the
  space 24 and 32.
- `--spacing-roundel-mark` is half the disc.
- `tests/page-hero.spec.ts` checks the roundel and the photo cover no text at
  320, 640, 768, 1023, 1024 and 1280px.

## Borders, shadows and radius

- Two edge weights, by choice. `--edge` (6px) is the width of every card,
  panel, popover, form field, gold area, table, topic tile, the
  `/accessibility` fact-strip rules, a prose `hr` and blockquote: the `edge`,
  `edge-t`, `edge-b` and `edge-l` utilities. Photos, controls, chips, the theme
  switch, stickers and code blocks keep `border-4`. The roundel keeps
  an 8px edge, a logo mark. No rule between sections.
- The default border color is `border`, set in the base layer (Tailwind 4
  defaults to `currentColor`); `gold-border` inside `.surface-gold`.
- Each ground has one edge role. Dark page: `border` (gold). A block,
  the header bar included: `block-ink`, 4px. Inside gold: `gold-border` (ink). A
  gold or light fill: `fill-edge` (ink). Light mode: ink everywhere.
  `tests/edges.spec.ts` asserts each in both modes.
- Shadows are hard offsets, no blur. Gold casts none (gold on gold is 1.00).
- A tilted box with a drawn edge clips its fill to the padding box when the
  edge and fill differ, or the fill shows outside the softened edge as a
  fringe; when they match, the fill runs under the edge, or the ground shows
  between them as a seam (`tests/tilt.spec.ts`, every route, both modes).

| Utility                     | Casts it                                                                                                              |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `shadow-hard-pink-object`   | Cards, post contents, gold areas, popovers, slide cards, the header bar; `--hard-throw` (8px)                         |
| `shadow-hard-pink-4`        | The PageHero photo, `.btn-primary`, `.btn-secondary`, link chips, footer stickers, slide cards                        |
| `shadow-brick`              | The header's brick rows (in `block-ink`), the menu's links, call to action and Close; `--brick-throw` (6px) in `text` |
| `shadow-hard-cyan-object`   | A hovered linked card, in place of pink; a contact link brick fills cyan instead, its ring inside in ink              |
| `shadow-hard-gold-border-4` | A card on gold                                                                                                        |
| `shadow-hard-mark-4`        | `.sticker`, `.btn-gold-primary`                                                                                       |
| `shadow-hard-mark-8`        | The roundel, the homepage stickers                                                                                    |
| `drop-shadow-hard-mark-8`   | The logo tile, following its ears                                                                                     |
| `drop-shadow-hard-mark-12`  | The logo tile's larger copy on `/about`                                                                               |

- `mark` is `pink`'s hex but stays pink in light mode, where `pink` turns
  ink.
- Anything focusable with a shadow sets its lift: [Focus](#focus).
- Radius is 0 everywhere (base layer). `rounded-full`: the roundel. No pills;
  any other rounded corner is a bug.
- The logo tile is an eared tile: a cat's head in the tile's shape, with
  rounded ears and corners, its 4px `tile-edge` edge and 3deg tilt
  (`src/lib/brand-mark.ts`, `CatMark.astro`). It is a mark, not a radius: the
  rule above does not apply to it, and its shadow is a `drop-shadow-*`.

## Components

Component classes live in `@layer components` in `src/styles/components/`, one
file per area.

| Class                                   | What                                                                                                                                                                                                                                                                 |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.btn-primary`                          | Gold fill, `gold-text` label, `border-4`, pink 4px shadow, `text-button` 900                                                                                                                                                                                         |
| `.btn-secondary`                        | Light block: `block-light` fill, `block-ink` label and `border-4`, pink 4px shadow                                                                                                                                                                                   |
| `.actions`                              | Button row; its 32px row gap clears shadow and ring when buttons wrap                                                                                                                                                                                                |
| `.card`                                 | A gold block: `block-gold`, 4px `block-ink` edge, pink 8px shadow, padding 24px, 40px from `sm`                                                                                                                                                                      |
| `.card-title`                           | Every card heading, `text-h3` 900                                                                                                                                                                                                                                    |
| `.card-link`                            | Title link; a short press on the card follows it, text stays selectable (`card-click.ts`); inline-block, 44px min; card hover turns title and shadow cyan                                                                                                            |
| `.card-solid`                           | A light block outside a `.card-block`, where alternation does not reach it                                                                                                                                                                                           |
| `.card-block`                           | A wall: blocks share 4px walls, alternate gold and light, and step up to the right (`card-rise-*`, `card-step-*` from `src/lib/wall.ts`); the wall casts the one throw                                                                                               |
| `.lead`                                 | Paragraph under a section heading, `text-lead` 400, 24px under it                                                                                                                                                                                                    |
| `.standfirst`                           | Line beside PageHero's title, `text-standfirst` 400                                                                                                                                                                                                                  |
| `.bullet-list`                          | Bulleted list, gold markers                                                                                                                                                                                                                                          |
| `.chip`                                 | Tags, jump links, filters, pager. Always a link. `border-4`, 44px target; a chip list is `gap-6`. The blog filter and pager are a `.chip-row`: joined light bricks, one throw, the current one gold with an ink marker (`tests/chip-row.spec.ts`)                    |
| `.badge`                                | A non-link fact or state. Flat `bg-text`, `background` label, no border or shadow                                                                                                                                                                                    |
| `.nav-cta`                              | Nav call to action: gold, `border-4` in `text`; a brick in the header row, its own 6px throw in the menu; current takes `--inset-shadow-current`                                                                                                                     |
| `.label`                                | `text-label` 900 uppercase, 0.1em                                                                                                                                                                                                                                    |
| `.link`                                 | Running-text underline for a classed standalone link                                                                                                                                                                                                                 |
| `.abbr-trigger`, `.abbr-tip`            | An abbreviation's first use (`src/components/Abbr.astro`): dotted underline; the expansion is a popover in a `surface` box flush below it; inline in brackets where popovers are missing. Punctuation right after it goes in `after`, so a line never starts with it |
| `.page-gutter`, `max-w-page`, `.band`   | [Gutter and column](#gutter-and-column)                                                                                                                                                                                                                              |
| `.skip-link`                            | Skip link, visible on focus                                                                                                                                                                                                                                          |
| `.motion-toggle`                        | 44px SC 2.2.2 pause control; position from a second class                                                                                                                                                                                                            |
| `.theme-switch`, `.theme-menu`          | 44px gold brick showing the theme in use (moon, sun), named "Theme"; opens a popover `surface` box, 6px `border` edge, pink throw, a "Theme" fieldset of System, Light and Dark radios in 44px rows, `text` accent                                                   |
| `.prose`                                | Rendered Markdown (no typography plugin)                                                                                                                                                                                                                             |
| `.aspect-frame`                         | Every photo: [Photo frames](#photo-frames-and-the-failed-photo-state)                                                                                                                                                                                                |
| `.surface-gold`, `.btn-gold-*`          | [Gold surface](#gold-surface)                                                                                                                                                                                                                                        |
| `.hero*`, `.post-layout`, `.footer-*` … | Page-specific, documented in place                                                                                                                                                                                                                                   |

### Control states

- Hover: `.btn-primary`, `.btn-secondary` and `.nav-cta` fill cyan with a
  `background` label (11.86).
- Lifted: under a hovering pointer the same controls rise `--press-lift` (2px)
  off their shadow, which grows by as much, so its far corner stays put. Not
  on touch screens, where hover sticks after a tap, and not under reduced
  motion.
- Pressed: buttons, `.btn-gold-primary`, linked chips and footer stickers drop
  their shadow and move 4px into it; the menu's bricks 6px; the logo tile 8px.
  The header's joined bricks and a chip row's chips share their row's throw
  and hold still. No move under reduced motion. `tests/press.spec.ts` presses
  each.
- Travel: the press lands at once; the lift and the release slide at an even
  speed in `--press-travel` (80ms). The shadow is one layer in every state, so
  it slides instead of fading (`buttons-nav.css`).
- Unavailable: `aria-disabled="true"`, never `disabled`. Dashed `border`
  (the dash says unavailable, the gold keeps the shape), `bg-background`,
  `subtle` label, no shadow; still focusable.
- Sending: the contact submit is `aria-disabled` in a `data-sending` form but
  drawn pressed and gold, not unavailable (`src/scripts/contact-sending.ts`).
- Current: [Navigation states](#states).

### Markup

- Native elements before ARIA: a modal is `<dialog>` + `showModal()`, a
  disclosure `<details>`/`<summary>`, a click target `<button type="button">`,
  navigation `<a href>`, grouped fields `<fieldset>`/`<legend>`. No
  focus-trap libraries.
- ARIA, alt text and text over photographs:
  [ACCESSIBILITY.md §9](../ACCESSIBILITY.md#9-contributor-checklist).
- Photos: a 4px `border` frame, no shadow or tilt, except the PageHero photo
  (4px pink shadow).
- A block's focus ring is its remapped `cyan`, `gold-link` (11.38 on gold,
  14.49 on light); the block's own ring and hover throw keep the page's cyan.
  Focusable content sits at least 8px inside. `tests/blocks.spec.ts`.
- Breadcrumbs stop at the parent; JSON-LD `BreadcrumbList` adds the page
  (`tests/breadcrumbs.spec.ts`).
- An abbreviation's expansion is a `<button popovertarget>` described by its
  popover, not a focusable `<abbr>`: a tap opens it with no script, and the
  WAI-ARIA tooltip pattern covers no touch. Flush below, so the pointer can
  cross onto it (SC 1.4.13). Never inside a link: write the word out there.

## Sections, rhythm and grid

The grid rule in `scripts/check-tokens.mjs` enforces the grid;
`tests/headings.spec.ts` holds section headings to one size.

### Section types

| Type    | Build                                                                                                                                                                                                                                                                                                                                |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Hero    | First section on every page except a post; a `.gold-column`. See [Hero](#hero).                                                                                                                                                                                                                                                      |
| Open    | `Section`: `text-h2` heading, optional `.lead` 24px under it, content at `--spacing-head`, `max-w-page` in `.page-gutter`.                                                                                                                                                                                                           |
| Panel   | `Section panel`: the same box, the whole section in one `.card`, its h2 `text-h2` inside the card.                                                                                                                                                                                                                                   |
| Listing | Grid of cards, 1 to 3 columns, `--spacing-grid` gaps: blog index, categories, tags, Home's two grids.                                                                                                                                                                                                                                |
| Reading | One `.prose` column, `max-w-measure` (36rem): Privacy, Accessibility, a post's body.                                                                                                                                                                                                                                                 |
| Surface | The gold band (Home, Career, Contact), a `.gold-column`. With the hero slab, the only change of ground.                                                                                                                                                                                                                              |
| Close   | `CloseRow`, its own band, always last, never nested.                                                                                                                                                                                                                                                                                 |
| Brand   | `BrandFrame`: the sections list (`BrandMenu`, `--container-rail` wide; sticky from `lg` under the header, scrolling inside itself when the screen is shorter than the list, and static under 30rem tall, and a closed details box under `lg`) beside the content. Plain numbered links; the section you jumped to is the gold block. |

### One treatment per type

`tests/section-types.spec.ts` compares instances across pages.

- **Text section** (heading and short paragraphs): a panel, heading inside at
  `text-h2`, including "Summary" on `/career` and the message on
  `/contact/sent`.
- **Panel heading:** `text-h2` on every page. A page with panels opens on the
  full slab.
- **Cross-links between two sections:** a chip.
- **The quote sentence:** `text-h2` at 900, on `/about` and on `/contact`'s
  closing band. On `/about` it sits on a gold card under a decorative
  `text-quote-mark`, beside the photo.
- **A name with a line saying what it did** (`/credits`): each entry on an
  inset `bg-background` tile inside the card. No rule between entries. On a
  full-width card (Guides), each tile is a row from `lg`: name in 3 of 12
  columns, text in 9 at `max-w-measure`; stacked below.
- **Photo captions:** none on People and places; the alt text names who is in
  each photo. Where a photo carries a caption, it starts at the photo's left edge.
- **Form fields:** a 6px edge. A failing field adds a 4px pink inset ring
  inside the 6px edge, which turns pink on the page and stays ink in a block.

### How sections separate

- Everything after the hero is a `Section`, one `--spacing-section` from the
  next.
- A gold band's padding is inside its own ground, so the section after it
  keeps its own top: two `--spacing-section` across that join. `CloseRow` is
  `py-section`, not `pb-section`, for this reason.
- The slab's edge separates the hero from the first section; no line under it.
- The only ground change is gold (hero slab and gold surface), 11.99 against
  the page, never color alone.
- Panels and the closing row are cards: `card-edge` and 8px shadow.
- No rules or dividers between sections or before the footer.

### Section headers

- `<section aria-labelledby="{id}-heading">` with `<h2 id="{id}-heading">`.
- Heading: `text-h2`, 900, uppercase, `--tracking-heading`, `text` (15.28). No
  eyebrow label; labels belong to cards.
- Lead: `.lead`, `text-lead` (24px) at 400, 24px under the heading.
- Content: `--spacing-head` under the heading or lead.
- `Section headless` when the heading sits beside a picture: the slot renders
  the `h2` with id `<id>-heading`. No rule above a heading.

### First and last

- First: the hero, owning the page's h1. A post opens on its article header.
- Last: `CloseRow` on pages that end on links (`/`, `/about`, `/career`,
  `/blog`, `/credits`, `/contact/sent`, `/brand`); otherwise the last section's bottom
  padding. The footer follows with no separator.

### Grid

- **Below 640px:** one column; 16px gutter.
- **640 to 1023px:** listings in two columns; splits stack; 24px gutter.
- **1024px and up:** listings up to three columns; splits on one 12-column
  grid with `--spacing-grid` gaps: 7/5, 6/6, 5/7 or 3/9.
- **May break the grid, and nothing else:** the hero slab and gold surface
  (right edge reaches toward the screen), a photo strip (scrolls sideways in
  its card as a focusable region), a tilted mark's corners and any hard shadow
  (up to 12px past the column).
- **Reflow:** every type is one column below 640px, on the 288px content box
  at 320px. At 200% zoom a 1280px window is 640 CSS px. Only photo strips
  and wide tables scroll sideways, each in its own region.
- **Below 305px:** `below-reflow:` (under 19rem) is for 500% zoom only: words
  break anywhere and the header name is visually hidden. `stickers-wrap:`
  (under 17.5rem) wraps the footer stickers. Nothing changes from 305px up.
- **Short windows:** `short:` (under 30rem of height) makes the header static,
  and in the photo viewer the photo takes the viewer's width, up to the
  window's height or 20rem if that is more, while the dialog scrolls. From
  30rem up the photo fits the window whole.

### Page compositions

| Page                   | Order (type)                                                   |
| ---------------------- | -------------------------------------------------------------- |
| Home                   | Hero, Surface, Listing, Listing, Close                         |
| About                  | Hero, Open, Open, Open, Open, Open, Open, Close                |
| Career                 | Hero, Panel, Open (with the solid block), Open, Surface, Close |
| Contact                | Hero, Open, Surface                                            |
| Contact sent           | Hero, Panel, Close                                             |
| Credits                | Hero, Open (panels) x3, Close                                  |
| Privacy, Accessibility | Hero (reading measure), Reading                                |
| Blog index             | Hero, Listing, Close                                           |
| Blog category, tag     | Hero, Listing                                                  |
| Post                   | Article header, Reading (contents box from 1280px), Tags nav   |
| 404                    | Hero (starfield) only                                          |
| Brand                  | Hero (full), Facts, Brand (sections list), Close               |

- About's last Open, Sources, is there only while the sample persona is set.
- Contact ends on its gold surface, not a closing row: the band is its call to
  action.
- The blog listing has no section heading: each card's title is its h2.
- `/brand`: one page of sections from `src/lib/brand-sections.ts`.
  - The fact strip counts the Foundations and Components sections from their group sizes.
  - Sections list: numbered, sticky from `lg` under the header, scrolls inside itself when shorter than the list.
  - Under 30rem tall (a landscape phone, 400% zoom) the list stays in the flow and each section links back to it (SC 1.4.10, 2.4.11).
  - No script: a link landed on from outside can sit out of view in the list's own scroll.
  - A section: number and name, lead, then parts. A part: h3 name, use, rule, and a stage.
  - Stage: the live example on the dark ground beside an inert, `aria-hidden` copy on the light one (`mirror.ts`).
  - Each half wears the page's 4px edge, so dark on the dark page or light on the light page stays visible; halves that touch share one edge (`tests/brand.spec.ts`).
  - The guide above the first section says how to read the page.
  - A part lists what it keeps for accessibility from `src/lib/brand-a11y.ts`.
  - Two rules show as a Do and Don't pair: one primary per section, and cyan only on hover and focus (`DoDont.astro`).
  - With a script, a Search field above each sections list (wide and narrow) shows the sections whose title, group, lead, tokens, hex values, rules or accessibility lines hold every typed word, ignoring case and accents (`brand-filter.ts`). It counts the matches and Escape clears it.
  - Each part with a live example shows its markup under it, wrapped, never scrolling (`sourceOf` in `mirror.ts`). With a script each block gets an icon Copy button (`src/scripts/copy.ts`) pinned in its top-right corner, named "Copy markup for <part>". A "Copy" tip shows on hover and focus (SC 1.4.13, Escape hides it); a press shows a check and "Copied" for 2 s and announces it, or selects the code and says the copy failed. With no script, no button is drawn.
  - Button parts show rest, hover, focus, pressed and unavailable side by side (`StateRow.astro`, `.state-*` in `brand.css`), with the real tokens; the lift and the transition are not shown.
  - A still state sample on `/brand` may show its hover color; `cyan` at rest stays banned everywhere else.
- Color is one part per role in `src/lib/brand-roles.ts`.
  - Tokens are rows of one swatch size: fills as fills, text colors as "Aa", cyan unpainted.
  - Each role ends in the one pair it is read on; the ratio is computed from the tokens.
  - Any text color under 7 or edge under 3 on either ground fails the build.
- Each section is an id'd anchor; the retired `/brand/<section>/` routes redirect to it in `public/_redirects`.
  - Part ids `ink-and-accents`, `edges-and-focus`, `color-grounds` and `on-gold` are gone.

## Hero

`src/components/PageHero.astro`. Enforced by `tests/page-hero.spec.ts` and
`tests/gold-surface.spec.ts`.

Four openings, no fifth: Home's canvas hero, a talk's cover slide, a post's
`.post-slab`, and `PageHero` everywhere else.

### The slab tiers

Set by `PageHero`'s `slab` prop. The tier follows what is under the title, not
how important the page is.

| Tier  | `slab`   | Routes                                                                                            | Ground   | Title                                                       | Aside              | Padding              |
| ----- | -------- | ------------------------------------------------------------------------------------------------- | -------- | ----------------------------------------------------------- | ------------------ | -------------------- |
| Full  | `"full"` | `/about`, `/career`, `/contact`, `/blog`, `/credits`, `/brand`; `/contact/send`, `/blog/page/<n>` | gold     | `text-h1`; `text-h2` on the last two                        | `.standfirst`      | `py-section`         |
| Thin  | `"thin"` | `/contact/sent` and a post's own `.post-slab`                                                     | gold     | `text-post-title`                                           | `text-post-teaser` | `pt-head pb-section` |
| Plain | `"none"` | `/privacy`, `/accessibility`, category and tag listings, `/404`                                   | the page | `text-reading-h1`; `text-h2` on categories, tags and `/404` | `text-post-teaser` | `pt-head pb-section` |

- **Full:** the opening is a statement and the other half of the composition
  has content.
- **Thin:** one short line and no section headings after it. A 32px thin title
  over 28px panel headings is not a 0.8 step, so a page with panels is never
  thin. `/blog` is not thin: its featured title is `text-post-card-feature`.
- **Plain:** a document, or a page whose chips and cards say what it is. Takes
  `.reading-layout` in the same change, which sets `.prose h2` to
  `text-post-h2` (40px title over a 28px first heading).
- The plain tier is a dark slab in the gold column's shape holding the title
  and roundel; the breadcrumb sits above it and everything else under it, on
  the page body's column (the measure on a reading page, the page column on a
  listing).
- `/404` sets `starfield`: stars across the whole slab on an `aria-hidden`
  layer; `.star-clear` puts the slab's ground behind the kicker and title, so
  no star shows behind text. `tests/not-found.spec.ts` checks it.

### Variants

| Variant  | Where                                                                | Title                            | Column                             |
| -------- | -------------------------------------------------------------------- | -------------------------------- | ---------------------------------- |
| Home     | `/` only                                                             | its own hero, `HeroField.vue`    | its own composition                |
| Standard | About, Career, Contact, Blog, Credits, Brand                         | `text-h1`                        | `max-w-page`; 6 of 12 with a photo |
| Reading  | Privacy, Accessibility (`measure="reading"`)                         | `text-reading-h1`                | `max-w-measure`, the prose column  |
| Compact  | category and tag listings, `/contact/send`, `/blog/page/<n>`, `/404` | `text-h2`, still the page's `h1` | `max-w-page`                       |
| Thin     | `/contact/sent`                                                      | `text-post-title`                | `max-w-page`                       |

A post opens on its article header, not PageHero, but its slab is the thin
tier and takes its padding.

### Semantics

- One `<section class="page-hero">`, first child of `<main>`, holding the only
  `h1`.
- Breadcrumbs go in the `eyebrow` slot above the `h1`, as a named `nav`,
  with `tone="gold"` on a slab.
- The photo is a `<figure>`; its credit, if any, a `figcaption`.
- The roundel is decoration: `alt=""`, no role, no focus.

### Layout

- Shape: `.gold-column`. Left edge on the page column; right edge reaches past
  it until the pink shadow is 48px from the screen edge, never short of the
  page column. Below 40rem it sits in the page gutter.
- Edge: one 6px `border` and the 8px pink shadow, as a card. Text inset by
  `--hero-column-pad-inline`.
- PageHero and `.post-slab` stand `--hero-pad-block` below the header.
- With a photo, from 1024px: text on 6 of 12 columns, centered; photo on
  columns 8 to 12, 4:5, on the slab's bottom. Below that the photo follows the
  text at `max-w-sm`, 48px under it.
- The photo hangs `--spacing-head` past the slab's bottom edge, and the hero
  keeps `--spacing-head` below it so the next section clears the photo.
- On a landscape window from 1024px the slab fills the window less the
  overhang, so the photo's shadow ends on the fold.
- No line, fill, card or separator strip between the hero and the first
  section.
- Two `--spacing-section` (112 to 192px) between the hero's last line and the
  next content. In forced colors the slab paints Canvas and drops shadows,
  so this gap and the `h1` set the hero apart. `tests/page-hero.spec.ts`
  checks the slab keeps a bottom border in forced colors at 320px.

### The roundel rule

**Every hero carries exactly one mark: the photo if it has one, otherwise the
roundel.**

- `PageHero` renders the roundel whenever it has no `image`. There is no prop.
- About and every post with a `cover` have a photo, so no roundel.
- The homepage is not a PageHero and has no roundel on its window.
- `variant="hero"`: a gold disc of `--spacing-roundel` with a `gold-text` ring
  (4px, 8px from `lg`), `mark` 8px shadow, 3deg tilt. The page variant's 8px
  ring is `fill-edge`, so it holds on a gold band.
- Its center sits `--spacing(1)` above the slab's bottom edge; its right side
  on the column's text edge (`.hero-roundel`).
- On a plain tier it straddles the dark slab's bottom edge too, and is never
  left off. The slab's bottom padding is half the disc plus 24px; the text
  under it starts 32px past the disc's lower half.
- The disc sets a slab's minimum bottom padding: half the disc plus its lift
  plus 24px, 92px at 1280. Only `--spacing-section` clears it, so a thin slab
  is thin at the top only.
- `tests/page-hero.spec.ts` lists each route's tier and holds it to the build:
  a roundel on every gold or plain slab without a photo, none on
  `PHOTO_ROUTES` or a post with a cover, and over no text on a gold or plain
  slab. A new PageHero photo adds its route there.

### Color roles and ratios

| What                        | Color on ground                 | Ratio | Needs      |
| --------------------------- | ------------------------------- | ----- | ---------- |
| Title, standfirst, body     | `gold-text` on gold             | 11.32 | 4.5        |
| Breadcrumb separators       | `gold-muted` on gold            | 7.88  | 4.5        |
| Links (breadcrumbs, mailto) | `gold-link` on gold, underlined | 11.38 | 4.5        |
| Chip fill against the slab  | `surface` on gold               | 10.60 | 3          |
| Chip label                  | `text` on `surface`             | 13.51 | 4.5        |
| Focus ring                  | `gold-text` on gold             | 11.32 | 3          |
| Photo border                | `gold-text` on gold             | 11.32 | decoration |
| Roundel ring on the slab    | `gold-text` on gold             | 11.32 | decoration |
| Roundel disc off the slab   | gold on `background`            | 11.99 | decoration |
| Photo and chip shadows      | pink on gold                    | 2.31  | decoration |

- Pink never delimits anything on the slab: every control has its fill or a
  `gold-text` border.
- The page's own colors fail here: `subtle` 1.28, `border` 1.00, the page
  link color, `text`, 1.27.

### Calls to action

- Gold buttons only: [Buttons on gold](#buttons-on-gold).
- Career is the one hero with actions: the CV download when `person.cv` is
  set, then Get in Touch (primary when there is no CV), `--spacing-head`
  under the standfirst.
- Career is also the one hero with a line of fact: `mt-4 text-body
text-gold-muted` under the standfirst. Color
  and size both differ, because forced colors flattens the color.

### Media

- Portrait photo: `aspect-portrait` (4:5), `object-cover`, 4px `gold-text`
  border, pink 4px shadow.
- Eager, `fetchpriority="high"`: it is the largest paint.
- A failed load keeps the 4:5 frame and shows its alt text; see
  [Photo frames and the failed-photo state](#photo-frames-and-the-failed-photo-state).
- Never text over a photo.

### Header relation

- The header is a gold bar on the hero's column, 12px below the top, with the
  logo tile and name at its left end ([Navigation](#navigation)).
- The logo tile keeps its `mark` shadow.
- The sticky header covers the top of the slab on scroll; nothing on the slab
  is fixed.

### Hero motion

None. Gold buttons lift and press like every control
([Control states](#control-states)). The roundel's tilt is static.

### The hero pause control

- Beside the first name at every size (`.hero-motion-toggle`): right edge on
  the window's, `--spacing(4)` above its top rule. The window can be too low to
  hold it clear of the name.
- It sits on the page, not the gold, so its focus ring is the page's `cyan`.
- A first name long enough to reach it would sit under it:
  `tests/hero-fit.spec.ts` measures the letters against its box.
- It is the first stop in `<main>` at every size.

## Posts

Enforced by `tests/post-page.spec.ts`.

### Structure

- One `<article>`: `section.post-slab` (thin gold opening), then
  `.band.py-section` holding `.post-layout`. `BaseLayout` adds no
  element, so articles never nest.
- Source order: the `<header>` in the slab (breadcrumb, `h1`, teaser, date and
  reading time, then the cover when the post has one), contents list,
  `.prose`, tags.
- A cover takes [Media](#media) in PageHero's photo layout, in its own ratio
  (`.aspect-sizer`): text in the left half, the photo in columns 8 to 12
  crossing the slab's bottom edge, no roundel. `tests/post-page.spec.ts`.
- A cover is never cropped: the file keeps its full frame, and the hero and
  the `/blog` feature card show it in its own ratio, and so does the post's
  sharing card ([ARCHITECTURE](../ARCHITECTURE.md#assets)).
- `coverCredit` puts "Photo: name" in the date line, `text-gold-muted`, linked
  when the name is in `PHOTOGRAPHERS`. Not under the cover: the photo hangs
  below the slab, off the gold ground.
- Below `xl` they stack at `--spacing-head`; from `xl` the contents list sits
  right of the text, capped at `--container-rail`.
- Outline: one `h1`; `h2` per section; `h3` only under an `h2`. The contents
  list and tags carry labels, not headings.

### Measure

- `--container-measure`, 36rem (576px), for the post, its opening, contents
  and tags, and for Privacy and Accessibility. At most 75 characters per line
  at the 18px body floor.
- In rem, not `ch`: Firefox measures Lexend's `ch` wider than Chromium.
- `text-reading-h1` is 40px; ACCESSIBILITY breaks at its soft hyphen at
  305px.
- Body figures break out of the measure; the text does not. A landscape
  takes the page column, and from `xl` the measure plus the track right of it,
  from the text's left edge toward the page column's right edge like the hero
  photo; a height-capped one ends short. A portrait stays
  on the measure, centered.
  Both stop at 80vh tall, uncropped, caption on the image's left edge.
  Placement is design, not tested; the spec checks uncropped, inside the
  viewport and column, under 80vh and off the contents list.
- Figure `sizes`, from `post-figure.mjs`: that slot, capped by the file's width
  and by 80vh times its ratio. Markdown images take `MARKDOWN_WIDTHS`, to 2400.

### The opening

| Relationship              | Value         | Same as                      |
| ------------------------- | ------------- | ---------------------------- |
| Breadcrumb to title       | `mb-6` (24px) | every breadcrumb             |
| Title to teaser           | `mt-6` (24px) | a post card, title to teaser |
| Teaser to date            | `mt-8` (32px) | a post card, teaser to date  |
| A label to what it labels | `mt-4` (16px) | a card's label to its title  |

### Rhythm inside `.prose`

| Element     | Treatment                                                                                                                                               |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Paragraph   | `mt-6`, `text-body` (18 to 19px, line height 1.62), `text`                                                                                              |
| `h2`        | `mt-16`, `text-post-h2` (28px); its text follows at the next `mt-6`                                                                                     |
| `h3`        | `mt-12`, `text-post-h3` (22px). The last level                                                                                                          |
| Inline code | `.prose code`: the mono stack at `--text-code`, on a `surface` fill with `px-1` and no border                                                           |
| Code block  | `.prose pre`: mono, `border-4 border-border` on `surface`, `p-4`, scrolls sideways, a named tab stop while it overflows                                 |
| Lists       | `mt-6 pl-6`, items `mt-3`, gold markers; a link-only item is 44px tall                                                                                  |
| Blockquote  | `mt-6`, `edge-l border-border`, `pl-6`, its text at weight 900                                                                                          |
| Table       | `mt-6`, `edge`, fixed layout, cells `px-4 py-3`, headers on `surface`; Markdown headers get `scope="col"`, a table with row headers is HTML             |
| Figure      | `mt-8`, wider than the text ([Measure](#measure)), an `.aspect-frame` sized by the file with a 4px `border` ring; caption `mt-4 text-label text-subtle` |
| `hr`        | `mt-16`, a 6px `border` rule                                                                                                                            |

- A heading sits 24px above its own text and 48 to 64px below the text before
  it.
- Nested lists have no styles; no post uses them.

#### Syntax highlighting is off

- Shiki writes inline `style` attributes; `public/_headers` sets `style-src`
  without `'unsafe-inline'`, so the browser blocks them.
- `astro.config.mjs` sets `syntaxHighlight: false`; `tests/code-block.spec.ts`
  asserts the setting and the CSP directive together.
- Highlighting needs a palette first (five to ten new tokens, each 4.5:1 on
  `#1A1A1A`, added to [Color tokens](#color-tokens), with a forced-colors
  decision), then a class-emitting highlighter (Prism, or Shiki with a
  CSS-variables theme).
- Never widen `style-src` to `'unsafe-inline'`. Hashing Shiki's output is not
  an option: the hashes change with every code block edit.

#### A post stops at `h3`. There is no `h4`

- `tests/headings.spec.ts` holds a post at 1280px and 320px to a 19px floor
  (`HEADING_FLOOR`) and a 0.8 step (`STEP`) between levels.
- `--text-post-h3` is 22px, so an `h4` would need to be at most 17.6px and
  at least 19px. The spec fails it at 320px.
- The heading floor stays 19px and level 4 is not exempt from `STEP`.
- A post that needs a fourth level is reopened as a deliberate decision.

### Contents and tags

- The contents list is a `<nav aria-labelledby>` named by its `summary`, "In
  This Post", around a native `<details>`.
- Closed below `xl`. From `xl`, `src/scripts/post-contents.ts` opens it and
  follows width changes. Without JavaScript it stays closed.
- The summary: `text-label` 900 uppercase in `text` (13.51 on `surface`), cyan
  on hover, at least 44px tall, a plus or minus marker hidden from assistive
  technology.
- Tags follow the text under a 6px `border` rule: a label 16px above a row of
  `.chip` links.

## Empty, loading and error states

A heading, a sentence, one way on. Enforced by `tests/empty-states.spec.ts`,
`tests/contact.spec.ts` (Worker), `tests/contact-sending.spec.ts` and
`tests/failed-images.spec.ts`.

| State                   | Where                                   | Heading                                                                             | Sentence                                                         | Action                                 | Announced by                       |
| ----------------------- | --------------------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------- | -------------------------------------- | ---------------------------------- |
| Not found               | `/404`                                  | `h1` "These are not the droids…"                                                    | the page does not exist, and a link to report a broken one       | homepage (primary), blog (secondary)   | the page load                      |
| Empty category or tag   | not built: pages exist only with a post |                                                                                     |                                                                  |                                        |                                    |
| Empty blog              | `/blog` with no posts                   | `h2` "No Posts Yet"                                                                 | "Nothing has been published here yet."                           | "Go to the Homepage"                   | the page load                      |
| Invalid form            | `/contact/send`, 422                    | `h2` "There Is One Problem with This Form" or "There Are N Problems with This Form" | one linked entry per field                                       | each entry moves to its field          | focus on the summary on arrival    |
| Rate-limited or unsaved | `/contact/send`, 429 or 503             | `h2` "Your Message Was Not Sent"                                                    | the reason, and the email address as the way round it            | the form, still holding what was typed | focus on the summary on arrival    |
| Message over the cap    | `/contact/send`, 413                    | `h1` "Message Too Long"                                                             | nothing was sent, the 5000 character limit and the email address | "Back to the Contact Form"             | the page load                      |
| Offline                 | `/contact`, on submit                   | none: the form stays                                                                | "You are offline, so your message has not been sent…"            | the form, unchanged                    | the form's `role="status"` region  |
| Sending                 | `/contact`, while the post is in flight | none                                                                                | "Sending your message." and the button reads "Sending"           | a second submit is blocked             | the form's `role="status"` region  |
| Failed photo            | any `.aspect-frame`                     | none                                                                                | its alt text on the frame                                        | none                                   | not announced: the alt is its name |
| Loading a photo         | the photo viewer, past 200ms            | none: the previous photo stays                                                      | "Loading photo 4 of 12" in the count                             | the previous photo and its caption     | the viewer's count region          |
| Photo that never loads  | the photo viewer, on a failed decode    | none                                                                                | "This photo could not be loaded." on the frame                   | the caption still describes it         | the viewer's count region          |

- `.error-summary`: 6px `pink` edge on `surface`, `tabindex="-1"` and
  `autofocus`, no `role="alert"` (focus already announces it; some screen
  readers read an alert twice).
- A status region exists, empty, before anything is written to it.
- The only live regions: the contact form's status, the photo viewer's count
  and caption, the slideshow's status and the About cats' trick note. Every
  other state is its own page.
- The photo viewer decodes before it swaps, then writes `src`, caption and
  count together, so nothing is announced before it is painted.
- Loading holds: past 200ms the count reads "Loading photo 4 of 12" and the
  previous photo, caption and buttons stay. No blank frame. Under 200ms
  nothing is announced.
- A failed photo fades out; the frame reads "This photo could not be loaded."
  (`aria-hidden`), the count reads "Photo 4 of 12 could not be loaded", and the
  caption keeps the alt text.
- The message shows on the dialog's ground, never over the photograph.
- Each press takes a token; a decode holding an older token is discarded.

## Footer

`src/components/Footer.astro`, `src/styles/components/footer.css`.
Enforced by `tests/footer.spec.ts`.

### Footer structure

`<footer class="page-gutter">`, outside `<main>`, no headings:

- the motto, `site.motto` (a `div` with its `lang`, not a heading)
- `nav` "Site": Home, About, Career, Blog
- `nav` "About this site": the links in `POLICY_LINKS` in `Footer.astro`
- `nav` "Social": one sticker link per profile plus Email, each an
  `aria-hidden` icon and a visually hidden name
- the copyright, then "Cat Drawings and Text Made with AI", an underlined
  `subtle` link to `AI_DISCLOSURE.md` with a 44px-tall box (EU AI Act Art. 50)
- the `aria-hidden` tuft

### Footer layout

| Width       | Layout                                                                                                                                             |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| below 48rem | one centered column in source order; the stickers a 4-column grid, the fifth onward offset by `--spacing(8)`; copyright and AI label over the tuft |
| from 48rem  | three columns, name and stickers, Site, About this site, `column-gap` `--spacing(8)`; copyright and AI label, then the tuft, in one row            |
| from 64rem  | inset `--spacing(8)` either side; stickers `--size-sticker-lg`                                                                                     |

### Footer spacing

| Relationship                | Value                                                                     |
| --------------------------- | ------------------------------------------------------------------------- |
| Last section to footer      | that section's `--spacing-section`, then the footer's `--spacing(12)` top |
| Name to page links (phone)  | `--spacing(8)`                                                            |
| Stickers to copyright       | `--spacing(8)` at every width                                             |
| Between stickers            | `--spacing(6)`; `--spacing(4)` at 48rem; `--spacing(6)` at 64rem          |
| Copyright to the page's end | `--spacing(6)` from 48rem; the tuft sits on the edge below it             |

No rule or divider joins the footer to the page.

### Links and stickers

- Links are `.label`: Site in `text` (15.28), About this site in `subtle`
  (9.34), cyan on hover (11.86). Each row is 44px tall (`--spacing-target`).
- The current page has `aria-current` and the 2px text-link underline; hover
  changes color only, so the two never look alike.
- Stickers: `--size-sticker` 48px (`--size-sticker-lg` 56px from 64rem),
  a `--border-width-sticker` 4px transparent edge (drawn only in forced
  colors), so the throw meets the fill; 3deg tilt, 4px pink shadow with
  `lift-control`. They straighten on hover and focus.
- One colorway, the `.badge` inversion: `text` fill, `background` glyph
  (15.28). Not cycled by `nth-child`.
- Sizes are `@theme` tokens: `--size-sticker`, `--size-sticker-lg`,
  `--size-sticker-icon` (22px), `--border-width-sticker`, `--size-tuft` (220px),
  `--size-tuft-md` (266px).

## Navigation

`src/components/Header.astro`, `src/components/NavList.astro`,
`src/scripts/mobile-menu.ts`, `src/lib/nav.ts`.
Enforced by `tests/nav-current.spec.ts`, `tests/mobile-menu.spec.ts`,
`tests/no-script.spec.ts`, `tests/states.spec.ts`, `tests/focus.spec.ts`,
`tests/header-fit.spec.ts` and `tests/sticky-header.spec.ts`.

### By width

| Width       | Header                                                                                                                              |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| below 48rem | logo link, the theme switch, and the menu button that opens the menu dialog; without JavaScript, a nav row under the header instead |
| from 48rem  | logo link, the Primary nav (About, Career, Blog), the theme switch, and the call to action                                          |
| from 64rem  | the same on a three-track grid, the nav centered, wider gaps                                                                        |

- Links come from `NAV_LINKS` and `CTA` in `src/lib/nav.ts`; the desktop
  header uses `HEADER_LINKS` (no Home; the logo links to `/`).
- The header bar (`.header-slab`): `block-gold` fill in both modes, a 4px
  `block-ink` edge (`--block-edge`) and `shadow-hard-pink-object` (pink, ink
  in light mode). 80px tall in a 104px header. Inside it, bricks take
  `block-light` fills and `block-ink` lines; `.site-header` keeps the page's
  values as `--page-*` for the menu dialog.
- The logo tile and name sit inside the bar with no block, edge or throw of
  their own. The tile keeps its 8px `mark` shadow; the link pads it inside
  its box (`padding-block-end: var(--lift-mark)`), so the ring at the plain
  4px gap clears it and stays inside the bar, full and slim
  (`tests/header-bricks.spec.ts`).
- Nav links, the theme switch and the call to action are joined bricks
  (`.header-bricks`): 44px tall, the target (SC 2.5.5), sharing their 4px
  edges, one `shadow-brick` per row, in `block-ink` in both modes. Each row
  sits half its throw high: 11px above it and under its throw. The current
  page is `block-gold`, the rest `block-light`; a gold brick on the gold bar
  is set apart by its ink edge. A brick after another drops its left edge, so
  the two share one 4px wall and never overlap each other's target.
- Hover fills the site's `cyan` (`--hover-fill`) in both modes under a
  `gold-text` label (11.20). The ring is `gold-link` in both modes; on a
  hovered brick it takes the label's ink.
- The bar takes `.gold-column`'s margins, so it starts and ends where the gold
  hero does at every width (`tests/header-fit.spec.ts`).
- The menu follows the same rule on the page ground: `text` edges, each brick
  its own 6px throw, the current page gold.

### By height

- Sticky, 104px (`--spacing-header`): the 80px bar and 12px above and below;
  `tests/header-fit.spec.ts` holds both.
- Once the page scrolls past it, the header goes slim
  (`src/scripts/header-compact.ts`): 80px (`--spacing-header-compact`), a 68px
  bar, the logo tile at three quarters, bricks still 44px with their throw. A
  state, not an animation. Its flow box keeps 104px, so nothing below moves, and
  the full header's scroll padding still clears it. Not under `short`. `html` keeps focus and anchors
  `--spacing-header` and `--spacing(10)` below the top, so a focused field's
  label stays in view too.
- Under 30rem of viewport height (`short`: a landscape phone, any window under
  960px tall at 200% zoom) it scrolls away and the scroll padding drops to
  `--spacing(4)`.
- Offset with `scroll-padding-top` on `html`, never `scroll-margin-top` on
  elements: WebKit ignores the latter for focused inputs.
- `src/scripts/focus-into-view.ts` scrolls a keyboard-focused control into
  view: Firefox does not scroll one that is partly on screen.

### States

| Item                | Current                                                                                                                                                                                                        | Hover                                      | Focus                                                                               |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------- |
| Nav link, menu link | `aria-current`, `"page"` on the page and `"true"` inside its section: `block-gold` fill, `gold-text` label (11.32) and the 4px `--inset-shadow-current` ring; in the menu, pressed 6px into its shadow instead | cyan fill, `gold-text` label (11.20)       | in the header, the ring inside the brick (ink on gold); in the menu, past the throw |
| No-JavaScript link  | the same value, a flat `bg-text` block with a `border` edge, label in `background` (15.28)                                                                                                                     | cyan text (11.86), not on the current item | the 4px cyan ring at a 4px offset, on the current item too                          |
| Call to action      | `aria-current`, `"page"` or `"true"`, a 4px `gold-text` inset ring, no hover fill                                                                                                                              | cyan fill                                  | in the header, inside the brick in `gold-text`; in the menu, past the throw         |
| Logo link           | `aria-current="page"` on `/`, no visual state: the homepage hero says where you are                                                                                                                            | none                                       | `gold-text`, 4px off the link, inside its gold block (11.32)                        |

- `ariaCurrent` in `src/lib/nav.ts` decides the value.
- Inactive no-JavaScript links keep a `border-transparent` 4px edge so nothing
  reflows.
- A current chip is the same flat `bg-text` block, no shadow.
- Forced colors drop the fill, shadow and marker, so a current nav link, call
  to action and chip take a 4px underline there (`tests/forced-colors.spec.ts`).

### The menu

- `src/scripts/mobile-menu.ts` loads at every width. Never gate it on a media
  query: 400% zoom crosses the breakpoint.
- A native `<dialog>` opened with `showModal()`: traps focus, closes on
  Escape, returns focus to the menu button. The button has `aria-expanded`,
  `aria-controls` and the fixed name "Menu". Background scroll is locked.
- Widening past 48rem while open closes it: its root is `display: none`
  there, and an open modal nobody can see leaves the page inert. Focus goes to
  the first Primary nav link, since the menu button is hidden at that width.

## Motion

- Every animation respects `prefers-reduced-motion: reduce`.
- Anything moving automatically for over five seconds needs a pause control
  (SC 2.2.2): the homepage hero field and each About cat.
- Nothing flashes more than three times per second (SC 2.3.1).
- Controls lift off their shadow under a hovering pointer and press into it at
  once ([Control states](#control-states)); no movement under reduced motion.
- No marquee.
- Pattern (`src/components/ui/HeroField.vue`, its logic in
  `src/composables/use-hero-field.ts`): start the animation on mount,
  never in server HTML. Under reduced motion render one still frame and no
  button. The state lives in the accessible name ("Play the hero animation" /
  "Pause the hero animation"), no `aria-pressed`. Without JavaScript the hero
  shows that still frame as a WebP (`npm run hero-still` after a change to the
  field).
- `HeroField` loads `client:load`.
- The About cats (`src/components/ui/AboutCats.vue`) wake when their band is
  first on screen, play along it (games like the yarn and the fly carry them,
  leaps move them on), and sit still under reduced motion. Each cat's button
  ("Meet Minerva") opens its card and changes nothing else.
- Each cat's SC 2.2.2 control sits in its band's corner: Zz ("Put Minerva to
  sleep") while it plays, an eye ("Wake Minerva") while it sleeps.
  Hidden under reduced motion, where nothing moves.
- A paw button under Zz ("Choose a trick for Minerva") opens that cat's tricks:
  Random first, then its own moves, each an icon and a name
  (`src/lib/about-cats-tricks.ts`, fetched from its JSON after load, so `/about`
  stays within its script budget). A pick plays once, wakes a sleeping cat
  first, and trots the cat to room if the move needs it; the cat then plays on
  at random. The list leaves out moves that cannot fit the band's width.
- The list opens under the band, its right edge on the paw's. With no room
  below it opens beside the paw and Zz, never over them, and it closes when
  focus leaves it and its paw (SC 2.4.12). The paw shows only where the
  browser has popovers.
- A talk in full screen (`src/components/DeckBar.astro`,
  `src/styles/components/slides.css`) shows one slide, arrows named Previous
  and Next with the count at the foot, and ✕ named Exit Full Screen in the
  card's top right corner. No control there is named Full Screen. They show on
  a pointer move or a tap, hide with the pointer once it rests, and stay while
  the pointer is on one or one has keyboard focus. No transition. The foot row
  sits over the margin under the slide and the slide's foot padding, ✕ inside
  the card's border by `--focus-gap`, in its corner padding: clear of slide
  content on 16:9 and 4:3 screens. Exit is first in the DOM, so Tab goes from
  the top down.
- A cat naps after `NAP_AFTER_MS` of on-screen play (`src/lib/about-cats.ts`).
  Lying down, and the breaths and "z" after it, end within 5 s, then the cat is
  still.
- Pointing at a cat, or keyboard focus on it, holds it in place, so a target
  being aimed at never moves: a focused target that never moves suits keyboard
  and magnifier users.
- A drawing may reach `MAX_OVERHANG` (the phone gutter) past its band's end,
  never over text or a control (`src/lib/about-cats.ts`). A cat about to lie
  down near an end turns to face the band first.
- A cat stands on the brick under it. Where its wall steps up (Rudra's raised
  photo brick), the floor follows the brick tops, read from the laid-out wall
  on every resize, and Rudra springs up the step and stretches down it
  (`src/lib/about-cats-climb.ts`). Under reduced motion a cat sits on the brick
  it is on. The wall's empty top takes no clicks, so a cat on the lower brick
  stays a target.
- Games too long for a band are skipped: at a 320px viewport the yarn and fly
  games do not fit, and the cats play the others.
- Each cat lives in a `.cat-perch` band above its card, sized by
  `--spacing-cat-band`, which no move may rise above
  (`tests/about-cats.spec.ts`).
- A band is never a scroll anchor (`overflow-anchor: none` on `.cat-spot`):
  WebKit would scroll the page with a moving cat and carry a focused control
  out of view (SC 2.4.11).
- The hero's poneglyph is line art in the field's inks, drawn to match its
  grass lines; the About cats are stickers, flat fills with a hard edge, like
  the logo tile. Keep each in its own style.
- The poneglyph stands right of center, below the stickers and clear of the
  name: a broad block with a lit carved face, a shaded side and top, a plinth,
  a soft contact shadow and a short cast shadow. On a narrow frame it moves
  left to stay inside. Stems stand behind it and beside it, never in front.
- A slow light reads its script glyph by glyph, left to right and top to
  bottom, in a loop: each glyph's strokes thicken into a full-ink rim with the
  glow color inside, rising over 0.6 s and fading over 0.6 s as the next
  glyph rises, then wrapping to the start. The rim keeps 6.60:1 on the dark
  face and 16.43:1 on the light (SC 1.4.11). One glyph is far below the general
  flash area and makes one rise and fall a cycle (SC 2.3.1). The pause control
  freezes it; under reduced motion the script stays unlit.

## Focus

- One global `:focus-visible` rule: `--focus-width` 4px cyan outline, offset
  `--focus-gap` 4px plus `--lift`. Never style `:focus`; never remove an
  outline; never `outline-offset: 0`.
- A hard shadow is not a focus indicator.
- `html` `scroll-padding-bottom` is the ring's width, gap, the largest lift and
  `--scroll-rounding` (1px), so a control scrolled to the bottom edge keeps its
  whole ring on screen.
- On gold the ring is `gold-text`. Ratios: [Contrast](#contrast).
- The header's joined bricks draw the ring inside the brick, `--block-edge`
  plus `--focus-gap` in, so it never crosses the next brick: `gold-link` on
  a light brick (14.49), `gold-text` on gold (11.32), and `gold-text` on a
  hovered brick's cyan (11.20).
- `--lift-control` 4px beside a control's 4px shadow, `--lift-object` (the
  `--hard-throw`, 8px) beside an object's shadow, `--lift-mark` 8px beside the
  logo tile's 8px shadow, so the ring clears the shadow (cyan on pink is 2.29). The button,
  `.nav-cta` and `.chip` classes carry it. A current item with no shadow sets
  `--lift: 0px`. A new shadow without its lift is a bug.
- Chip lists and the no-JavaScript nav are `gap-6` so one chip's ring never
  meets the next chip's shadow. `tests/states.spec.ts` measures it.
- `.btn-gold-primary` has a two-tone ring, because its ring color equals its
  fill: `--inset-shadow-gold-btn-ring` and `shadow-hard-mark-4` in one
  `box-shadow`, so focus keeps the shadow. Use a two-tone ring only when the
  ring color equals the control's opaque fill.

| Layer                           | Against        | Ratio |
| ------------------------------- | -------------- | ----- |
| inner `#FFFFFF`, 3px, inset     | `#131313` fill | 18.58 |
| outer `#131313`, beyond the gap | gold `#FFC000` | 11.32 |

- A block's ring is `gold-link` ([Markup](#markup)).
- Any new surface measures its own ring twice: against the ground behind the
  element (the offset gap) and against the element's own edge.
- Native media controls: `:is(video, audio)[controls]:is(:focus, :focus-within)`
  gets the same 4px cyan ring at a 4px offset.

## Photo frames and the failed-photo state

Without the frame holding the shape, WebKit draws a failed photo square and
shows no alt text. Enforced by `tests/replaced-elements.spec.ts` and
`tests/failed-images.spec.ts` in Chromium, Firefox and WebKit.

### The frame

- Every photo sits in an `.aspect-frame` and fills it (`absolute inset-0
size-full object-cover`). Never put `aspect-ratio` on the image: WebKit
  drops it, and the ratio from `width` and `height`, when the image fails.
- A designed ratio is a class on the frame, only where every file already has
  it: `aspect-portrait` (4:5, hero photos), `aspect-photo` (4:3, the
  placeholder box), `aspect-square` (square photos). Never a ratio that crops.
- Two photos side by side are a `.photo-pair`: from `sm` flex shrinks them to
  one height, each in its own ratio; below `sm` they stack.
- A file's own ratio is an `.aspect-sizer`: an empty `aria-hidden` SVG whose
  viewBox is the file's width and height. PhotoTile reads it from image
  metadata; post photos get it at build time in `src/plugins/post-figure.mjs`.
  An inline style is refused by the CSP.
- The frame carries the border and shadow: `border` 4px on the page (11.99 on
  `background`, 10.60 on `surface`), `gold-text` on the hero slab (11.32).
- `min-w-0`: WebKit gives a grid item with an aspect ratio a minimum width
  wider than its track.

### Photo credits

- Outside `/credits` a credit is "Photo: Name" (`PHOTO_CREDIT_PREFIX`) in the
  caption's own tokens; `/credits` keeps the full attribution line.
- The name links the photographer's site (`PHOTOGRAPHERS`), else stays plain
  text.
- A Creative Commons photo (`licensedCaption`) links the name to the photo's
  page (`LICENSED_PHOTOS[x].source`) and adds its short license, "Photo: Name
  (CC BY 4.0)", as a plain link to `licenseHref`. No `Abbr`: the deed names
  the license in full (G55, SC 3.1.4). CC BY §4(a) asks for the license link
  with every copy.
- `titleInCaption` puts the title first, linked to `source`, and the name
  links the photographer's site: "Photo: Title by Name (CC BY 2.0)". Set it
  where the license asks for the title (CC BY 2.0 §4(b)); each link names
  where it goes (SC 2.4.9).
- No source site or changes in the caption. `tests/markdown-plugins.spec.ts`.

### The failed state

| Part     | Treatment                                                    | Ratio               |
| -------- | ------------------------------------------------------------ | ------------------- |
| Frame    | `surface` fill, its own border and shadow                    | border as above     |
| Image    | `opacity: 0`; stays in the accessibility tree with its alt   |                     |
| Alt text | a copy in `.aspect-frame-alt`, `aria-hidden`, `text`         | 13.51 on `surface`  |
| Size     | `text-body`, inset 16px; `text-label` inset 12px below 20rem | 13.51 at both sizes |
| Overflow | clamped to the whole lines the frame holds, then an ellipsis |                     |

- `markFailed` in `src/scripts/failed-frame.ts` sets `data-failed` on the
  frame. `src/scripts/failed-images.ts` calls it for the page's HTML on
  arrival (`complete` with no `naturalWidth`), on `error`, and again on
  `load`; a photo rendered later, like the About cat card's, calls it on
  `error`.
- It sets `--alt-lines` to the whole lines that fit between the insets and
  recounts on resize. Inset, not padding: `overflow` clips at the padding edge.
- A decorative photo (`alt=""`) is marked and shows the empty fill.
- No announcement: the alt is still the accessible name.
- Without JavaScript nothing is marked; the frame keeps its shape and fill and
  the browser's broken-image state shows (alt text in Chromium and Firefox,
  an icon in WebKit).
