# astro-cat-portfolio

<!-- TODO(fork): Rewrite this file for your own site. -->

A personal website template: Astro, Vue islands, Tailwind CSS and TypeScript on
Cloudflare Workers. Neo-brutalist, dark by default with a light mode, a blog
with feeds, a talk slideshow, a contact form, and animated cats on the About
page. Tested for WCAG 2.2 AA in Chromium, Firefox and WebKit.

## What you get

A portfolio that ships with a sample theme: the persona Robin Ohara, an
archaeologist, and her three cats, so the site builds, passes its tests and
looks finished before you change anything. Making it yours means replacing
the theme with your own person, words and pictures. The animated cats on
`/about` are a feature you keep with your own cats, or remove.

## First steps

1. Create your repository with "Use this template", then clone it.
2. Install and run it:

   ```sh
   nvm use
   npm ci
   npx playwright install --with-deps chromium firefox
   npm run dev
   ```

## Make it yours

Work through the list in order. Most places in the code you need to change
carry a `TODO(fork):` comment saying what to do; delete the comment once
it is done.

1. **You**
   - Name, job title, email and profile links:
     [`src/site.config.ts`](src/site.config.ts). Each profile needs an icon
     in `src/assets/social-icons.svg`.
   - Your CV: a PDF in `public/`, named as `person.cv` in the same file, or
     leave it `null` ([Publishing a CV](docs/DEVELOPMENT.md#publishing-a-cv)).
2. **Your words**
   - Home, About, Career and Contact: `src/pages/index.astro`,
     `about.astro`, `career.astro`, `contact.astro`. Names and links come
     from the config; the text is Robin's.
   - Tagline and motto: `src/site.config.ts`. The motto's `meaning` is the
     translation `/about` gives after its language ("Latin for …"); `null`
     for a motto in the site's own language.
   - Category descriptions: `src/lib/categories.ts`.
   - Posts: replace the two in `src/content/blog/`
     ([writing a post](docs/DEVELOPMENT.md#writing-a-post)).
   - The talk: replace `src/content/talks/sample-talk/` with your own deck,
     then run `npm run publish:talk` for its PDF
     ([writing a talk](docs/DEVELOPMENT.md#writing-a-talk)). Two tests list
     the sample deck by name; their `TODO(fork)` comments say what to change.
   - Robin's notice: set `SAMPLE_PERSONA` in `src/lib/persona.ts` to `null`.
     It removes the fan-tribute notice from the homepage and `/credits`.
   - Credits: `src/lib/credits.ts` and `src/pages/credits.astro`. Keep the
     line that credits the template.
3. **Your pictures**
   - Photos: `src/assets/photos/` and `src/assets/blog/`, with their alt
     text where each is used. Update or remove `LICENSE-photos`.
   - Logo, favicon and app icons:
     [Replace the logo](docs/DEVELOPMENT.md#replace-the-logo).
   - Sharing image: `npm run og` redraws `public/images/og-default.png`
     from your name and tagline
     ([The sharing image](docs/DEVELOPMENT.md#the-sharing-image)); describe
     it in `src/lib/og-image.ts`.
4. **Your cats, or none**: [Your cats, or none](#your-cats-or-none).
5. **Your site**
   - Address and repository: `site.url` and `site.repository` in
     `src/site.config.ts`. The build warns while the address is still
     `example.com`.
   - Cloudflare: the Worker, domain, database, sender and rate limit in
     `wrangler.jsonc`, then
     [Before the first deploy](docs/DEPLOYMENT.md#before-the-first-deploy).
     For no contact form, set `form: 'none'` under `contact`
     ([contact options](docs/DEPLOYMENT.md#contact-options)).
   - Analytics and Bing: `analytics` and `bingSiteVerification` in the
     config, or leave them `null`.
   - Security contact: the two contacts in [SECURITY.md](SECURITY.md), and
     the one your site publishes in `/.well-known/security.txt`. That comes
     from the `SECURITY_CONTACT` build variable, written as a `mailto:` or
     `https:` address (`mailto:you@your-domain`, not `you@your-domain`), or
     else from `person.email` once it is off an example host
     ([build variables](docs/DEPLOYMENT.md#run-a-demo)).
   - Accessibility contact: the owner and both reporting rows in
     [ACCESSIBILITY.md](ACCESSIBILITY.md) section 1. A build for a real
     address fails while they are still the template maintainer's.
   - [AI_DISCLOSURE.md](AI_DISCLOSURE.md): what AI made on your site, and
     the footer label that links it.
   - `package.json` `name`, and `LICENSE`: keep the notice and add your own
     copyright line.

To see what is left:

```sh
npm run check:fork
```

It lists every `TODO(fork)` comment with its file and line, and the count
(`git grep -n "TODO(fork):"` finds the same lines).
`npm run check:fork -- --strict` fails while any is left. Then run the gate
in [AGENTS.md](AGENTS.md#done-means): build, typecheck, check and every test
suite. CI runs the same on every pull request and needs no secrets.

### Your cats, or none

`/about` has three animated cats, each with a card that opens on a click.
The drawings are code; the cards show a photo.

**Your own cats.** The page has three cat places; keep all three.

- `src/pages/about.astro`, the list of cats near the top: each cat's name,
  one-line role, photo and photo description. Put the photos in
  `src/assets/photos/` and import them at the top of the file.
- Coat colors: the `--color-cat-` colors in `src/styles/global.css`. The
  logo cat and the homepage hero's glow (`--color-hero-glow`) use the second
  cat's colors, so changing them changes both.
- The cats' names in tests: the list of names at the top of
  `tests/about-cats.spec.ts`, and the first cat's name in
  `tests/failed-images.spec.ts` and `tests/analytics.spec.ts`. The About
  tests fail until these match the page.
- The contact page's list of topics names the cats: `src/pages/contact.astro`.
- The drawings stay AI-made: keep their lines in `AI_DISCLOSURE.md` and on
  `/credits`.

A different number of cats means changing the drawing code in
`src/lib/about-cats-*.ts` and `src/components/ui/AboutCats.vue`; this guide
does not cover it.

**No cats.** `/about` keeps its photos and text.

- Delete `src/components/ui/AboutCats.vue`, every `src/lib/about-cats*`
  file, `src/styles/components/about-cats.css`, `tests/about-cats.spec.ts`
  and the three `src/assets/photos/cat-card-*.jpg` photos.
- `src/styles/global.css`: keep the `--color-cat-` colors: the logo cat
  uses them.
- `src/pages/about.astro`: remove the `about-cats.css`, `AboutCats`, `CatInfo`
  and cat photo imports, the cat list and the code under it that loads their
  photos, `getImage` from the `astro:assets` import, the three `cat-spot`
  elements, and the `<AboutCats>` element at the end. Change each `cat-perch` wrapper to a
  plain `<div>`, keeping `mt-head` on the first.
- `src/styles/light-mode.css`: remove `.cat-tricks-button` from the list of
  gold text turned to ink.
- Tests:
  - `tests/focus-obscured.spec.ts`: the cat card entry in the list of open
    dialogs, and the two groups of About cat tests with their loop.
  - `tests/target-size.spec.ts`: the cat card entry in its list of open
    dialogs.
  - `tests/failed-images.spec.ts`: the cat card test.
  - `tests/analytics.spec.ts`: the lines that open a cat card.
  - `tests/credits-ai.spec.ts`: the About cats entry.
- `/credits` and `AI_DISCLOSURE.md`: remove the About cats entry. The
  contact page's topic about the cats goes too.
- `ACCESSIBILITY.md`: remove every mention of the cats and the cat card, or
  the statement claims tests that no longer exist. They are in section 2
  (motion), the 1.4.8, 2.3.3 and 2.4.12 rows, the target size, focus ring,
  motion and forced colors lines in section 4, and the
  `tests/focus-obscured.spec.ts` and `tests/about-cats.spec.ts` rows in the
  test table. `git grep -n -i -w -e cat -e cats ACCESSIBILITY.md` lists them.
- If one is missed: typecheck names an import or variable left behind, and
  the focus, target size, analytics and failed-images tests fail on a cat
  they cannot find.

### Drop /brand

`/brand` shows your design system and links to your `repository`; it is
optional. To drop it:

- Delete `src/pages/brand.astro`, `src/components/brand/` and
  `tests/brand.spec.ts`. Keep `src/lib/brand.ts`: `scripts/check-tokens.mjs`
  names it.
- Remove the Brand link in `src/components/Footer.astro`.
- Point the logo entry of `MADE_WITH_AI` in `src/pages/credits.astro` at
  another page, and the same `href` in `tests/credits-ai.spec.ts`.
- Remove every `/brand` entry under `tests/` (`grep -rn "'/brand" tests`
  lists them), the `/brand` test in `tests/demo-env.spec.ts` and its
  `templateUseUrl` import.

### Deploy

[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md#before-the-first-deploy). The contact
form answers 503 until its D1 database is created and migrated
([D1](docs/DEPLOYMENT.md#d1)).

## Documentation

- [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md): requirements, commands, layout,
  posts, talks
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md): Cloudflare, D1, email, contact
  options, Umami, dashboard and repository settings
- [ARCHITECTURE.md](ARCHITECTURE.md): stack, site config, tokens, content,
  assets, headers
- [docs/STYLEGUIDE.md](docs/STYLEGUIDE.md): visual rules and page patterns
- [ACCESSIBILITY.md](ACCESSIBILITY.md): accessibility statement, automated
  coverage, known gaps, reporting a barrier
- [docs/MANUAL_TESTING.md](docs/MANUAL_TESTING.md): by-hand accessibility
  checklist
- [AGENTS.md](AGENTS.md): working rules, for people and agents
- [SECURITY.md](SECURITY.md): reporting a vulnerability
- [AI_DISCLOSURE.md](AI_DISCLOSURE.md): AI tooling used; none at runtime

## Contributing

Issues and pull requests are welcome. Report a security vulnerability privately
instead: [SECURITY.md](SECURITY.md). Pull requests use
[the template](.github/PULL_REQUEST_TEMPLATE.md) and the rules in
[AGENTS.md](AGENTS.md).

## License

| What                                                       | License                                                                |
| ---------------------------------------------------------- | ---------------------------------------------------------------------- |
| Source code, docs and everything not listed below          | MIT, [LICENSE](LICENSE)                                                |
| Photographs in `src/assets/photos/` and `src/assets/blog/` | CC BY 4.0, with the credit in [LICENSE-photos](LICENSE-photos)         |
| `src/assets/social-icons.svg`                              | Brand icon paths from [Simple Icons](https://simpleicons.org), CC0 1.0 |
| Lexend                                                     | SIL Open Font License 1.1, copyright 2019 The Lexend Project Authors   |

- The build writes `/licenses.txt` covering every third-party package,
  vendored script and font sent to a browser (`scripts/licenses.mjs`).
- When you replace the photos with your own, update `LICENSE-photos`, or
  remove it and its row.
- Sample persona based on Nico Robin from One Piece by Eiichiro Oda
  (Shueisha). A fan tribute used as a placeholder; not affiliated with or
  endorsed by Eiichiro Oda, Shueisha or Toei Animation. The sample text is written with AI
  ([AI_DISCLOSURE.md](AI_DISCLOSURE.md)).
