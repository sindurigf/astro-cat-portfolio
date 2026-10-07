# Deployment

The site deploys to Cloudflare Workers with static assets, built from
[`wrangler.jsonc`](../wrangler.jsonc). Nothing in CI deploys: connect the
repository to Workers Builds, or run `npx wrangler deploy` yourself.

## Before the first deploy

1. Fill in [`src/site.config.ts`](../src/site.config.ts): name, URL, person,
   profiles, and the analytics and contact switches.
2. Replace the placeholders in `wrangler.jsonc`:
   - `name`: the Worker's name, which must match the dashboard's.
   - `routes`: your domain, as a custom domain.
   - `d1_databases`: `database_name` ([D1](#d1)). There is no
     `database_id` to fill in.
   - `send_email`: the sender, equal to `contact.notificationSender`.
   - `ratelimits`: `namespace_id` ([rate limit](#rate-limit)).
3. Log in with `npx wrangler login`, or set `CLOUDFLARE_API_TOKEN` and
   `CLOUDFLARE_ACCOUNT_ID`. The account never goes in a file.

| Workers Builds setting | Value                 |
| ---------------------- | --------------------- |
| Build command          | `npm run build`       |
| Deploy command         | `npx wrangler deploy` |
| Root directory         | `/`                   |

To check the configuration without deploying:

```sh
npm run build && npx wrangler deploy --dry-run
```

- Custom domains belong in `wrangler.jsonc`: a deploy replaces the Worker's
  routes, removing dashboard-only domains.
- Preview deployments run on workers.dev, outside the zone, so zone features
  (e.g. JavaScript Detections) only show on production.
- `preview_urls` is set in `wrangler.jsonc`; a dashboard toggle is reset by the
  next deploy. Previews are public to anyone with the URL and use production
  bindings: a message sent from one lands in the production D1 and inbox.

## After a deploy

- Run `npm run check:live` and `npm run check:live:console`. The live check
  compares the deployed headers, redirects and dashboard-dependent behavior
  with this repository. The console check stubs Umami, so it counts no visits.
- To run `check:live` weekly from `.github/workflows/scheduled.yml`, set the
  repository variable `CHECK_LIVE` to `1`.
- After a change to the hero or to what a page loads, run Lighthouse (mobile)
  on the home page and the changed page. `tests/performance.spec.ts` covers
  script bytes and layout shift; load time depends on the runner, so CI does
  not test it.

## Run a demo

A second Worker built from the same source, kept out of search:
`env.demo` in `wrangler.jsonc`. Its hostname is not in the repository; the
deploy command's `--domain` attaches it, on every deploy.

| Build variable   | Effect                                                                       |
| ---------------- | ---------------------------------------------------------------------------- |
| `CLOUDFLARE_ENV` | `demo`: the build writes `env.demo` into its deploy config                   |
| `SITE_URL`       | https origin; replaces `site.url` in canonicals, feeds, OG                   |
| `CONTACT_FORM`   | `none` or `cloudflare-d1`; replaces `contact.form`                           |
| `NOINDEX`        | `1`: `X-Robots-Tag: noindex` on every response, no sitemap                   |
| `REPOSITORY_URL` | https repository URL; replaces `site.repository` in every link to the source |

Unset, each leaves `src/site.config.ts` as it is; any other value fails the
build.

| Workers Builds setting | Value                                                     |
| ---------------------- | --------------------------------------------------------- |
| Worker name            | `name` in `env.demo`                                      |
| Build command          | `npm run build`                                           |
| Deploy command         | `npx wrangler deploy --env demo --domain <your-hostname>` |

```sh
CLOUDFLARE_ENV=demo SITE_URL=https://demo.example.com CONTACT_FORM=none NOINDEX=1 \
  REPOSITORY_URL=https://github.com/owner/site npm run build && npx wrangler deploy --env demo --dry-run
```

- `CLOUDFLARE_ENV` is read at build time. Without it, `--env demo` deploys the
  production configuration and bindings; with a different value, wrangler
  refuses.
- `env.demo` has no D1, email or rate limit bindings, so it needs
  `CONTACT_FORM=none`. Wrangler warns that the bindings are not inherited:
  intended.
- `NOINDEX` keeps `robots.txt` open: a crawler it blocks never reads the
  noindex header, and Google then indexes the bare URL.
- `NOINDEX` also drops the `/sitemap.xml` redirect from `_redirects`, so it
  answers 404 rather than redirect to a sitemap that is not built.
- Tested by `npm run test:demo` (`playwright.demo.config.ts`).

## Contact options

`contact.form` in `src/site.config.ts` picks the backend.

| Option                  | Setup                                                                                | Tradeoff                                                             |
| ----------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| Cloudflare Workers + D1 | `form: 'cloudflare-d1'` (default), [D1](#d1) and [email](#contact-form-email)        | Built in and tested; needs a D1 database, Email Routing and a secret |
| A hosted form service   | Point `ContactForm.astro`'s `action` at the service; add its origin to `form-action` | No server to run; a third party sees every message; not tested here  |
| `mailto:` link          | `form: 'none'`                                                                       | No backend and no stored data; the address is public and gets spam   |
| No contact page         | `form: 'none'`, then remove `/contact` from `src/lib/nav.ts` and delete the page     | Nothing to maintain; visitors can only use the footer profiles       |

- With `none`, `/contact` shows the email address, `/contact/send/` answers
  404, the daily job does nothing, and `/privacy`, `security.txt` and
  `llms.txt` stop mentioning the form. Also delete the `d1_databases` and
  `send_email` blocks from `wrangler.jsonc`, so the deploy needs no database.
- A hosted service changes the CSP's `form-action`:
  [ARCHITECTURE.md](../ARCHITECTURE.md#the-csp).

## D1

`wrangler.jsonc` names the database but carries no `database_id`. On
`wrangler deploy`, wrangler looks the database up by `database_name` and, if
none exists, creates it (automatic resource provisioning, wrangler 4.45.0 and
later) and writes the id back into `wrangler.jsonc`.

A database created that way has no jurisdiction, but `/privacy` says messages
are stored in the EU. So create it yourself first, in the EU, under the name in
`wrangler.jsonc`; the jurisdiction is fixed at creation:

```sh
npx wrangler d1 create <database_name> --jurisdiction eu
```

Deploy, then apply the schema. The migration commands resolve the database by
its name when `database_id` is absent:

```sh
npx wrangler deploy
npx wrangler d1 migrations apply MESSAGES_DB --remote
```

- Until the migrations run, the deployed form answers 503: the table it writes
  to does not exist yet.
- Run the migrations command before deploying any commit that adds a file to
  `migrations/`: the Worker reads the new schema as soon as it is live.
- A daily cron deletes messages older than the retention `/privacy` states,
  then resends any notification email that failed. `npm run check:live` counts
  messages still waiting.
- Local builds and `test:worker` use a local D1 and need neither the id nor an
  account.

## Rate limit

`CONTACT_RATE_LIMIT` in `wrangler.jsonc` limits form submissions per sender
(5 per 60 seconds). Details: [ARCHITECTURE.md](../ARCHITECTURE.md#the-contact-forms-honeypot).

- `namespace_id` is a string holding a positive integer that identifies the
  namespace within your Cloudflare account. Bindings that share one, across
  Workers too, share their counters.
- Keep the shipped `1001` unless another binding in the account already uses
  it; then pick an unused integer.
- `period` is `10` or `60` seconds. Counts are per Cloudflare location.
- Without the binding the form still works, unlimited: the Worker logs
  `CONTACT_RATE_LIMIT binding missing` and accepts the submission.
- Source: [Workers Rate Limiting](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/).

## Contact form email

Needs Email Routing on the zone, your inbox verified as a destination, and that
address as a runtime secret:

```sh
npx wrangler secret put CONTACT_NOTIFY_TO
```

In the dashboard it goes under the Worker's Settings > Variables and Secrets,
not Build (the runtime never sees Build). Without it, messages are still stored,
no email is sent, and the endpoint logs whether the binding or the secret is
missing.

## Umami

Off by default. To turn it on:

1. Create a website in Umami Cloud (EU region) for your domain.
2. Set `analytics: { umamiWebsiteId: '<id>' }` in `src/site.config.ts`.
3. Add `https://gateway.umami.is` to `connect-src` in `public/_headers`;
   `tests/headers-rules.spec.ts` fails until you do.
4. Check `/privacy`, which now describes the visit counting, and
   `UMAMI_RETENTION_MONTHS` in
   [`src/lib/platform-facts.ts`](../src/lib/platform-facts.ts) against your
   plan.

- A page view is one event; a click up to four (one per event data property).
- `data-domains` stops local, test and preview traffic being counted.
- The tracker is vendored at `public/vendor/umami.js`, so `script-src` stays
  same-origin. `npm run check:umami` compares it with upstream; exit 0 means
  it matches, otherwise it writes `tmp/umami-upstream.js` and prints the diff.
- To update the tracker, in one commit: read the diff for new storage, hosts,
  data sent or `data-*` settings; copy `tmp/umami-upstream.js` over
  `public/vendor/umami.js`; update `UMAMI_VENDORED_ON` and, if what is sent
  changed, `/privacy`; run the suite.

## Cloudflare settings

Dashboard settings that change what ships without a file change.
`npm run check:live` catches most.

| Setting                   | Required state | Why                                                        |
| ------------------------- | -------------- | ---------------------------------------------------------- |
| Web Analytics             | Off            | Injects a script from another domain                       |
| Email Address Obfuscation | Off            | Rewrites `mailto:` links into a script-dependent page      |
| JavaScript Detections     | On, forced     | Free plan; `no-transform` in `_headers` keeps it off pages |
| Compression               | Default        | Assets only; `no-transform` on pages switches it off there |
| Bot Fight Mode            | Off            | Challenges the search engine crawlers the site wants       |
| Zone HSTS                 | Off            | Replaces the `Strict-Transport-Security` in `_headers`     |
| Minimum TLS version       | 1.2            | 1.3 alone locks out older devices that cannot update       |
| Hotlink Protection        | Off            | Refuses images to link previews and feed readers           |

## Repository settings

- CI (`.github/workflows/a11y.yml`) needs no secrets and no Cloudflare
  account: it builds, checks and tests locally, with D1 and the rate limiter
  simulated by wrangler.
- CI reports one status, `Required checks`, which passes only when every job
  passes. A branch ruleset requires a status by its job `name`, so requiring
  this one covers every job, the test shards included. Rename it in the
  workflow and the ruleset together, or no pull request can merge.
- Turn on Dependabot alerts, automated security fixes and private
  vulnerability reporting ([SECURITY.md](../SECURITY.md)).
- Optional Actions secret `CLOUDFLARE_API_TOKEN` and variable
  `CLOUDFLARE_ACCOUNT_ID`: let the weekly `check:live` count unsent
  notifications in production D1. Scope the token to D1 Read on your account.
  Without both, the workflow sets `CHECK_LIVE_SKIP_D1=1` and `check:live`
  prints a skip line for the D1 check.
