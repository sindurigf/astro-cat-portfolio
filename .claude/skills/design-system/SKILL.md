---
name: design-system
description: Design system rules for this site - which color, type, spacing, focus and component tokens to use and which to avoid, the gold surface, light mode and radius. Use on every task that writes or reviews markup, CSS or components in this repo, and before adding any color, animation or interactive element. General accessibility rules are in ACCESSIBILITY.md.
---

# Design system

A checklist. Every value and reason is in
[docs/STYLEGUIDE.md](../../../docs/STYLEGUIDE.md); read the linked section
before changing anything it covers.

## Never

- An arbitrary value: no raw hex, `text-[32px]` or `shadow-[8px_8px_0]`. Add a
  token to `@theme` instead ([Tokens only](../../../docs/STYLEGUIDE.md#tokens-only)).
- `pink` as text, at any size. `pink-text` as a border, shadow or fill.
- `cyan` at rest. It is hover and focus only.
- A gold ground without `.surface-gold`, or `.btn-primary`/`.btn-secondary`
  on gold.
- A removed outline, `outline-none`, `:focus` styles or `outline-offset: 0`.
- A shadow on a focusable element without its lift.
- State signaled by color alone.
- Text over a photograph, or `aspect-ratio` on an `<img>`.
- A radius other than `rounded-nav`, `rounded-full` or `rounded-none`.
- ARIA where a native element works; an `aria-label` over visible text
  ([ACCESSIBILITY.md §9](../../../ACCESSIBILITY.md#9-contributor-checklist)).
- Horizontal padding on a page container.
- A new gold use without a row in the gold register.

## Rules

- Tokens and enforcement: [Tokens only](../../../docs/STYLEGUIDE.md#tokens-only).
- Where gold may go: [The gold register](../../../docs/STYLEGUIDE.md#the-gold-register).
- Color jobs: [Color tokens](../../../docs/STYLEGUIDE.md#color-tokens).
- Every ratio: [Contrast](../../../docs/STYLEGUIDE.md#contrast).
- New color: [Adding a color](../../../docs/STYLEGUIDE.md#adding-a-color).
- Gold ground: [Gold surface](../../../docs/STYLEGUIDE.md#gold-surface),
  [Buttons on gold](../../../docs/STYLEGUIDE.md#buttons-on-gold).
- Light mode: [Light mode](../../../docs/STYLEGUIDE.md#light-mode).
- Type: [Type scale](../../../docs/STYLEGUIDE.md#type-scale),
  [Heading floors](../../../docs/STYLEGUIDE.md#heading-floors),
  [Uppercase](../../../docs/STYLEGUIDE.md#uppercase),
  [Soft hyphens](../../../docs/STYLEGUIDE.md#soft-hyphens).
- Spacing and layout: [Spacing scale](../../../docs/STYLEGUIDE.md#spacing-scale),
  [Gutter and column](../../../docs/STYLEGUIDE.md#gutter-and-column).
- Borders, shadows, radius:
  [Borders, shadows and radius](../../../docs/STYLEGUIDE.md#borders-shadows-and-radius).
- Classes, states, markup: [Components](../../../docs/STYLEGUIDE.md#components).
- Sections and grid: [Sections, rhythm and grid](../../../docs/STYLEGUIDE.md#sections-rhythm-and-grid).
- Page openings: [Hero](../../../docs/STYLEGUIDE.md#hero).
- Posts: [Posts](../../../docs/STYLEGUIDE.md#posts).
- Empty and failed states:
  [Empty, loading and error states](../../../docs/STYLEGUIDE.md#empty-loading-and-error-states).
- Header and menu: [Navigation](../../../docs/STYLEGUIDE.md#navigation).
- Footer: [Footer](../../../docs/STYLEGUIDE.md#footer).
- Animation: [Motion](../../../docs/STYLEGUIDE.md#motion).
- Focus rings: [Focus](../../../docs/STYLEGUIDE.md#focus).
- Photos: [Photo frames](../../../docs/STYLEGUIDE.md#photo-frames-and-the-failed-photo-state).
- A form posting to a new origin: [The CSP](../../../ARCHITECTURE.md#the-csp).

## Before calling it done

- Run the commands in `AGENTS.md`.
- Tab the page, zoom to 400% and toggle reduced motion.
- Never suppress an axe rule.
- A new color, animation or control usually needs a new assertion.
