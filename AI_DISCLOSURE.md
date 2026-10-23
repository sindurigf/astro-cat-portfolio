# AI disclosure

<!-- TODO(fork): Rewrite this file to say what AI made on your site: the tools, the text and the pictures. -->

How AI tooling was used to build this template, and how to keep the record
current once the site is yours.

## What was AI-assisted

| Item      | Detail                                                                                    |
| --------- | ----------------------------------------------------------------------------------------- |
| Model     | Claude (Anthropic)                                                                        |
| Tool      | Claude Code                                                                               |
| Code      | Components, scripts, design tokens, tests and docs, written with Claude Code and reviewed |
| Microcopy | Functional microcopy (labels, errors, alt text, empty states) and the policy pages        |
| Editorial | The sample persona's text: every page, every post, the talk and its slides                |
| Art       | Drawn by Claude as SVG and canvas code, or by Canva AI; see below                         |

AI-drawn art, all by Claude:

- The animated About cats, their sleep, wake and trick-list icons (`src/components/ui/AboutCats.vue`) and their trick icons (`src/lib/about-cats-tricks.json`).
- The poneglyph and its lighting script in the homepage field
  (`src/lib/hero-field-poneglyph.ts`), and its stills shown without JavaScript
  (`src/assets/hero-still-*.webp`).
- The box cat: an open cardboard box (`src/lib/box-cat.ts`, by Claude) with a
  cat sitting in it, drawn by Canva AI (`artwork/cats/*.png`) and set in the
  box by `scripts/make-box-cat.mjs`:
  - Minerva in the header logo and the 404 page (`src/assets/box-cat-logo.svg`).
  - Rudra in every roundel (`src/assets/box-cat-roundel.svg`).
  - Hela on the footer motto band (`src/assets/box-cat-footer.svg`).
- The logo cat, a calico head shaped like the logo tile (`src/lib/brand-mark.ts`,
  `src/assets/logo-cat.svg`), on `/about`.
- The favicons and app icons in `public/` and their frames in `artwork/`, drawn
  by `scripts/make-icons.mjs` from the logo cat.
- The sharing images, `public/images/og-default.png` and
  `public/images/og/*.jpg`, drawn by
  `scripts/make-og.mjs` with the logo cat.

Every page's footer says "Cat Drawings and Text Made with AI" and links this
file (`tests/ai-label.spec.ts` checks every route). The art is also listed
under Made with AI at the end of `/credits/`.

- The cat photos are real photographs, not generated or edited by AI.
- The sample persona and all her text are written by Claude:
  original prose, no text copied from One Piece. Replace it with your own and
  update the footer label.

## No AI at runtime

- The site is a static build plus a small Worker; no model runs, in the browser
  or on the server.
- No visitor data is sent to a model.

## EU AI Act, Article 50

- Article 50(4) requires a label on AI-made deep fakes (Art. 3(60): realistic
  enough to pass as authentic) and on AI text published to inform the public on
  matters of public interest, unless a person holds editorial responsibility.
- This template labels its AI-drawn art and AI-written text on every page, and
  lists them here.

## Keeping this current

- Update this file in the same commit when you change the model or tool, add
  AI-made images, video, audio or editorial text, or run any AI at runtime.
- List AI-made or AI-edited media under Made with AI on `/credits/`. Label a
  deep fake, or AI text no person has reviewed, on the page that shows it.
- The pull request template asks for this under "Content".

## Attribution

- Recorded here once for the repository, not per commit.
- Commits carry no AI trailer ([AGENTS.md](AGENTS.md#commits)).
