# AI disclosure

How AI tooling was used to build this template, and how to keep the record
current once the site is yours.

## What was AI-assisted

| Item      | Detail                                                                                    |
| --------- | ----------------------------------------------------------------------------------------- |
| Model     | Claude (Anthropic)                                                                        |
| Tool      | Claude Code                                                                               |
| Code      | Components, scripts, design tokens, tests and docs, written with Claude Code and reviewed |
| Microcopy | Functional microcopy (labels, errors, alt text, empty states) and the policy pages        |
| Editorial | The sample persona's text: every page, both posts, the talk and its slides                |
| Art       | Drawn by Claude as SVG and canvas code, rendered in Chromium; see below                   |

AI-drawn art, all by Claude:

- The animated About cats, labelled on `/about`.
- The homepage hero: the courtyard ruins, skylines, carved stone and its
  invented script (`src/lib/hero-field-courtyard.ts`), the paving and
  flowers (`src/lib/hero-field-ruins.ts`) and the weeds (`src/lib/hero-field.ts`).
- The lying cat in the footer (`src/components/Footer.astro`).
- The logo mark (`src/assets/mark-dark.png`, `artwork/mark-dark.svg`), shown in
  the header, the roundels and on `/about`.
- The favicons and app icons in `public/` and their frames in `artwork/`.
- The sharing image, `public/images/og-default.png`, drawn by
  `scripts/make-og.mjs` with the mark.

Every page's footer says "Cat drawings and text made with AI" and links this
file (`tests/ai-label.spec.ts` checks every route). `/about` also labels its
moving cats where they play.

- The cat photos are real photographs, not generated or edited by AI.
- The sample persona and all her text are written by Claude:
  original prose, no text copied from One Piece. Replace it with your own and
  update the footer label.

## No AI at runtime

- The site is a static build plus a small Worker; no model runs, in the browser
  or on the server.
- No visitor data is sent to a model.

## EU AI Act, Article 50

- Article 50 requires that AI-generated or AI-manipulated images, video, audio
  and text published to inform the public are disclosed as such.
- This template labels its AI-drawn art and AI-written text on every page, and
  lists them here.

## Keeping this current

- Update this file in the same commit when you change the model or tool, add
  AI-made images, video, audio or editorial text, or run any AI at runtime.
- Label AI-made or AI-edited media and editorial text on the page that shows
  it, as `/about` does for the cats.
- The pull request template asks for this under "Content".

## Attribution

- Recorded here once for the repository, not per commit.
- Commits carry no AI trailer ([AGENTS.md](AGENTS.md#commits)).
