# astro-cat-portfolio

A personal website template: Astro, Vue islands, Tailwind CSS and TypeScript on
Cloudflare Workers. Neo-brutalist, dark by default with a light mode, a blog
with feeds, a talk slideshow, a contact form, and animated cats on the About
page. Tested for WCAG 2.2 AA in Chromium, Firefox and WebKit.

## First steps

1. Create your repository with "Use this template", then clone it.
2. Install and run it:

   ```sh
   nvm use
   npm ci
   npx playwright install --with-deps chromium firefox
   npm run dev
   ```

3. Edit [`src/site.config.ts`](src/site.config.ts): site name and URL, your
   name, job title, email and profiles, the post your pages point to for the
   longer story (`journeyPost`), and the analytics and contact switches. The build fails on an invalid value.
4. Replace the sample persona: her copy on every page, the sample posts and
   talk, and the photos. Set `SAMPLE_PERSONA` in `src/lib/persona.ts` to
   `null`, which removes her notice from `/credits` and the homepage. Update
   [SECURITY.md](SECURITY.md), [ACCESSIBILITY.md](ACCESSIBILITY.md) and
   [AI_DISCLOSURE.md](AI_DISCLOSURE.md) to describe your site.
   `/brand` shows your design system and links to your `repository`; it is
   optional. To drop it, delete `src/pages/brand.astro`,
   `src/components/brand/` and `tests/brand.spec.ts`, the Brand link in
   `src/components/Footer.astro`, and every `'/brand'` under `tests/`.
5. Run the gate in [AGENTS.md](AGENTS.md#done-means): build, typecheck,
   check and every test suite. CI runs the same on every pull request and
   needs no secrets.
6. Deploy to Cloudflare:
   [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md#before-the-first-deploy).
   - The contact form answers 503 until its D1 database is created and
     migrated ([D1](docs/DEPLOYMENT.md#d1)).
   - To go without a form, set `form: 'none'` under `contact` in
     `src/site.config.ts`: `/contact` then shows your email address. Remove
     the `d1_databases` and `send_email` blocks from `wrangler.jsonc` too
     ([contact options](docs/DEPLOYMENT.md#contact-options)).

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

## Licence

| What                                                       | Licence                                                                |
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
