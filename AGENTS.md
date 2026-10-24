# AGENTS.md

Rules for anyone, human or agent, changing this repository. Stack, design
system and conventions: [ARCHITECTURE.md](ARCHITECTURE.md).

## Done means

```sh
npm run build
npm run typecheck
npm run check        # tokens, links, pins, classes, csp, images, title-case, format, commits, leaks, test-weakening
npm run test:a11y    # Chromium, Firefox; WebKit in CI or with WEBKIT=1
npm run test:webkit  # test:a11y in WebKit via Docker
npm run test:worker  # WORKER_SPECS through the Worker
npm run test:demo    # DEMO_SPECS against a NOINDEX demo build
```

- CI runs all of it; `Required checks` is the one required status.
- A suite passed only if its summary total matches `npx playwright test --list`.
- Green means the steps ran, not that the tests assert the right things.
- Report and fix every warning, hint, error and flaky test, pre-existing or
  not, in its own commit. A false positive is named with its reason.
- Two runs of unchanged code that disagree: suspect the environment first
  (a stray build or Astro process, memory pressure).

### What a test is for

Name what a test protects: function, WCAG 2.2 AA, SEO and feeds, performance,
security and privacy, or build correctness. "Looks as designed" is not one.

- Decoration is not tested for its look (canvas drawing, shadow hues, pixel
  gaps). A red decorative test is deleted or cut to its accessibility core.
- Accessibility rules about decoration are tested: reduced motion, pause
  control, hidden from assistive technology, never covering text.
- Interaction states (hover, focus, active, visited, current, disabled) are
  accessibility: SC 1.4.3, 1.4.11, 1.4.1.
- Assert the property ("at least 4.5:1 and differs from rest"), not the value
  (`rgb(0, 255, 255)`).
- A skip, an axe exclusion, fewer `expect` calls, a looser threshold or a new
  rejected finding needs the owner's review of the head commit with the line
  `Approved test change: <reason>` (`check:test-weakening`). Agents never
  write it.

### Which suites to run

CI runs the full gate in Chromium, Firefox and WebKit on every pull request.
It is the test of record. Locally:

- Every change: `build`, `typecheck` and `check`.
- A change to the Worker: also `test:worker`; to the demo build: `test:demo`.
- A major change to code, CSS or tests: the specs it touches, in Chromium only,
  while iterating: `npx playwright test <specs> --project=chromium`.
- No full suites and no other engines locally. Run
  `npm run test:webkit -- <specs>` only to debug a failure CI reported.

State what ran in the pull request.

## Review findings

A finding is a claim until it holds against the code. Read the code, measure
the behavior, look for why it is written that way, and fix only what survives.
Record rejected findings beside the code so they are not raised again;
[ARCHITECTURE.md](ARCHITECTURE.md#rejected-findings) lists the current ones.

## Git and pull requests

- Branch per task from `main`, named for the task.
- Open a pull request with `gh pr create --base main --body-file <file>`, using
  [the template](.github/PULL_REQUEST_TEMPLATE.md). Never `--fill`.
- CI must pass. A maintainer reviews and merges.
- One commit per logical change.
- Update every credit, doc and claim page the change makes stale, in the same
  pull request. The places to check: `src/lib/credits.ts`,
  `src/pages/credits.astro`, README, ARCHITECTURE, ACCESSIBILITY,
  AI_DISCLOSURE, SECURITY, `docs/*`, `.claude/skills/design-system/SKILL.md`,
  /accessibility, /privacy, /brand, `llms.txt` and `robots.txt`.
- In this repository, a generic fix, upgrade, test, tooling or CI change also
  goes to the upstream site repository (linked on `/credits`) as a pull request
  there, or the pull request says why not on its "Upstream port:" line.
- Do not rename the `Required checks` job
  ([why](docs/DEPLOYMENT.md#repository-settings)).

### PR descriptions

- Short bullets of what the PR does, about 100 words. File or function name
  first, one fact per line.
- One "Tested:" line: the commands and totals.
- Clear and technical: no narrative, marketing words or restating the diff.
  Leave out sections that do not apply.
- No code blocks, no Claude links and no "Written for:" lines, in pull
  requests, commits or docs. The pull request is the record.

## Commits

`type: Full sentence with a full stop.` No scope; capital after the colon.

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `chore`, `perf`, `security`,
`config`, `revert`, `test`.

No AI attribution trailers in commits or PRs. [AI_DISCLOSURE.md](AI_DISCLOSURE.md)
covers attribution once. `scripts/check-commits.sh` enforces it in CI;
`.githooks/commit-msg` strips trailers locally once
[enabled](docs/DEVELOPMENT.md#setup).

## Code

- Idiomatic Astro, Vue, TypeScript and Playwright. Follow the framework's docs
  before inventing a pattern.
- Functional style, no classes without a reason.
- Named constants, no magic numbers.
- Validate external input at the boundary; never swallow errors.
- Reuse existing patterns and dependencies. Justify a new package in the pull
  request.
- UI: native elements with a visible focus indicator, targets outside a
  sentence at least 44x44 CSS px (SC 2.5.5), colors only as tokens from
  `src/styles/global.css`.
- Names, addresses, ids and switches live in `src/site.config.ts`; never
  repeat one as a literal.
- Vue only for components with real state (`HeroField.vue`). Small
  scripts are plain modules, e.g. `src/scripts/mobile-menu.ts`.

## Comments

Default: none. Rename or extract a function instead.

Write one only when the code cannot say it:

- why this approach and not the obvious one
- a browser bug or spec constraint, with a link
- units, ranges, or two places that must agree

Rules:

- One line. Three at most. Longer belongs in ARCHITECTURE.md or a test.
- Present tense. No history, dates, "used to", or narrative of what was tried.
- No restating the code, the signature, or the test name.
- No banners, no numbered essays in docblocks, no TODO comments.
- One exception: a fork marker, a one-line comment written exactly
  `TODO(fork): what to change`, where whoever forks the template must change
  or decide something. `npm run check:fork` fails on any other TODO comment
  in code and config.
- Tests: the test name says what is asserted. Assertion messages state the
  failure in one sentence.

## Docs

- Reference, not prose. Short bullets, tables for tabular facts, commands in
  code blocks.
- Say each fact once, in one file. Link instead of repeating.
- No dates or measurements unless the number is the rule (a budget, a ratio).

## Copy

- Functional microcopy (labels, errors, alt text, skip link, empty states) is
  written by whoever builds the UI. Plain, short, second person.
- Functional copy: sentences of 25 words or fewer
  ([GOV.UK](https://insidegovuk.blog.gov.uk/2014/08/04/sentence-length-why-25-words-is-our-limit/)).
  Active voice, everyday words, no "e.g." or "i.e.".
- An error message says what is wrong and how to fix it, without blame.
- Headings and labels use Chicago title case; sentences use sentence case
  ([rule](docs/STYLEGUIDE.md#uppercase)).
- Editorial copy (posts, About, Career, taglines, bios) belongs to the site's
  owner. An agent does not invent it: in a fork it stays the sample persona's
  until a person writes it.
- The sample persona's copy is the one exception: AI-written, labeled in the
  footer and listed in [AI_DISCLOSURE.md](AI_DISCLOSURE.md).
- New images, video, audio or editorial text: record whether AI made or edited
  it. If so, list it under Made with AI on `/credits/` and in
  [AI_DISCLOSURE.md](AI_DISCLOSURE.md#keeping-this-current). Only a deep fake
  (EU AI Act Art. 50(4)) also needs a label on its page.
- Photos are stripped of EXIF and XMP before commit; `npm run check` fails
  otherwise.

## Hard rules

- Never commit anything from `design/`.
- No PDF carries an author or creator in its metadata.
- Read `.claude/skills/design-system/` before UI, color or component
  work.

## Where things are

- Documentation: [README.md](README.md#documentation).
- `.claude/skills/design-system/`: design system for agents
- `design/`: comps, gitignored. `tmp/`: scratch, gitignored.
