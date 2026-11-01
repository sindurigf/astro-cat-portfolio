# Deployment

The site deploys to Cloudflare Workers with static assets, built from
[`wrangler.jsonc`](../wrangler.jsonc). Nothing in CI deploys: connect the
repository to Workers Builds, or run `npx wrangler deploy` yourself.

## Before the first deploy

1. Fill in [`src/site.config.ts`](../src/site.config.ts): name, URL, person,
   profiles, and the analytics, Bing verification and contact switches.
   While `site.url` is on an example host, the build warns and
   `npm run check:live` exits 2, even with a target passed: every canonical
   would name another domain.
   On a real `site.url` the build fails and the live check exits 2 while
   `ACCESSIBILITY.md` section 1 still names the template's maintainer in its
   owner or reporting rows.
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
- Published PDFs are kept out of search: `/*.pdf` in `public/_headers` sends
  `X-Robots-Tag: noindex`, so the page that links a PDF is the search result.
  To have them indexed, delete that rule and the two tests that assert it
  (`tests/headers-rules.spec.ts`, `tests/served-types.spec.ts`).
- Preview deployments run on workers.dev, outside the zone, so zone features
  (e.g. JavaScript Detections) only show on production.
- `preview_urls` is set in `wrangler.jsonc`; a dashboard toggle is reset by the
  next deploy. Previews are public to anyone with the URL and use production
  bindings: a message sent from one lands in the production D1 and inbox.

## After a deploy

- Run `npm run check:live` and `npm run check:live:console`. The live check
  compares the deployed headers, redirects and dashboard-dependent behavior
  with this repository. The console check stubs Plausible, so it counts no visits.
- To run `check:live` weekly from `.github/workflows/scheduled.yml`, set the
  repository variable `CHECK_LIVE` to `1`.
- After a change to the hero or to what a page loads, run Lighthouse (mobile)
  on the home page and the changed page. `tests/performance.spec.ts` covers
  script and CSS bytes and layout shift; load time depends on the runner, so CI
  does not test it.

## Run a demo

A second Worker built from the same source, kept out of search:
`env.demo` in `wrangler.jsonc`. Its hostname is not in the repository; the
deploy command's `--domain` attaches it, on every deploy.

| Build variable     | Effect                                                                       |
| ------------------ | ---------------------------------------------------------------------------- |
| `CLOUDFLARE_ENV`   | `demo`: the build writes `env.demo` into its deploy config                   |
| `SITE_URL`         | https origin; replaces `site.url` in canonicals, feeds, OG                   |
| `CONTACT_FORM`     | `none` or `cloudflare-d1`; replaces `contact.form`                           |
| `NOINDEX`          | `1`: `X-Robots-Tag: noindex` on every response, no sitemap                   |
| `REPOSITORY_URL`   | https repository URL; replaces `site.repository` in every link to the source |
| `SECURITY_CONTACT` | `mailto:` or `https:` URI; the `Contact` in `/.well-known/security.txt`      |

Unset, each leaves `src/site.config.ts` as it is; any other value fails the
build.

| Workers Builds setting | Value                                                     |
| ---------------------- | --------------------------------------------------------- |
| Worker name            | `name` in `env.demo`                                      |
| Build command          | `npm run build`                                           |
| Deploy command         | `npx wrangler deploy --env demo --domain <your-hostname>` |

```sh
CLOUDFLARE_ENV=demo SITE_URL=https://demo.example.com CONTACT_FORM=none NOINDEX=1 \
  REPOSITORY_URL=https://github.com/owner/site SECURITY_CONTACT=mailto:you@your-domain \
  npm run build && npx wrangler deploy --env demo --dry-run
```

- `CLOUDFLARE_ENV` is read at build time. Without it, `--env demo` deploys the
  production configuration and bindings; with a different value, wrangler
  refuses.
- `env.demo` has no D1, email or rate limit bindings, so it needs
  `CONTACT_FORM=none`. Wrangler warns that the bindings are not inherited:
  intended.
- `SECURITY_CONTACT` takes the place of `person.email` in `security.txt`
  only. Without it, and while `person.email` is on an example host, no
  `security.txt` is built. Its value stays in the build variables, not in the
  repository.
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

## Plausible

Off by default. To turn it on:

1. Add a site in Plausible Cloud with your domain as its name.
2. Set `analytics: true` in `src/site.config.ts`.
3. Add `https://plausible.io/api/event` to `connect-src` in `public/_headers`;
   `tests/headers-rules.spec.ts` fails until you do.
4. Check `/privacy`, which now describes the visit counting, and
   `PLAUSIBLE_RETENTION_YEARS` in
   [`src/lib/platform-facts.ts`](../src/lib/platform-facts.ts) against your
   plan.
5. In Plausible, add a custom event goal for each name in `CLICK_EVENTS`
   (`src/lib/analytics.ts`), and allow only your hostname under Shields >
   Hostnames.

- Click props (label, area, target) show only on the Business plan.
- `canSend` in [`src/lib/analytics.ts`](../src/lib/analytics.ts) keeps the
  tracker off on local, test and preview hosts and under Do Not Track;
  `filterPayload` strips query strings and fragments.
- The npm tracker takes its options from `init()` in
  [`src/scripts/analytics.ts`](../src/scripts/analytics.ts), not from the
  dashboard's tracking toggles.
- The tracker and the click tracker add about 7.8 KB of script to every
  page. `tests/performance.spec.ts` allows them `ANALYTICS_SCRIPT_BUDGET` on
  top of each route's own budget, which does not change.
- `@plausible-analytics/tracker` is pinned to an exact version and gets its
  own Dependabot pull request. Before a bump,
  read its changelog for new fields, storage or hosts:
  `tests/analytics.spec.ts` fails on an undisclosed field and
  `tests/privacy.spec.ts` on a storage write. Update `/privacy` if what is
  sent changed.

## Bing Webmaster Tools

Off by default. To verify the site:

1. Add the site in Bing Webmaster Tools and choose the HTML meta tag method.
2. Set `bingSiteVerification` in `src/site.config.ts` to the tag's `content`
   value, 32 hexadecimal characters.
3. Deploy, then select Verify in Bing Webmaster Tools.

- The homepage alone carries `<meta name="msvalidate.01">`. Removing the code
  unverifies the site.
- The tag loads nothing from Microsoft, so `/privacy` has nothing to add.

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
- CI runs on pushes to `main` and on every pull request, whatever its base
  branch, so a stacked pull request gets the full gate. Its commits are checked
  against its own base branch, not `main`.
- `Test weakening` (`.github/workflows/test-weakening.yml`) is a second
  status. GitHub blocks approving your own pull request, so the owner sets it
  up in this order, in both repositories:
  1. Create a machine account for agents and add it as a collaborator with
     write access.
  2. Give the agents a fine-grained token for it, scoped to both repositories
     with Contents and Pull requests set to read and write. Log the agents'
     `gh` in with it and remove the owner's token from their keyring.
  3. Require the status: Settings, Rules, Rulesets, the `main` ruleset,
     Require status checks to pass, Add checks, type `Test weakening`, pick
     the GitHub Actions source, Save. The name is offered once the check has
     run on a pull request. Before step 2, every flagged pull request blocks.
  4. Add `.github/CODEOWNERS` naming the owner for `/.github/` and
     `/scripts/check-test-weakening.mjs`, and turn on Require review from Code
     Owners in the `main` ruleset. A workflow could report a job also named
     `Test weakening`; this keeps such a change from merging.
- `.github/workflows/rerun-test-weakening.yml` re-runs `Test weakening` for a
  pull request's head when the owner comments with "approved" or submits an
  approving review, so the check reads the approval without a manual re-run.
  It runs the default branch's guard and checks out nothing from the pull
  request.
- Turn on Dependabot alerts, automated security fixes and private
  vulnerability reporting ([SECURITY.md](../SECURITY.md)).
- Optional Actions secret `CLOUDFLARE_API_TOKEN` and variable
  `CLOUDFLARE_ACCOUNT_ID`: let the weekly `check:live` count unsent
  notifications in production D1. Scope the token to D1 Read on your account.
  Without both, the workflow sets `CHECK_LIVE_SKIP_D1=1` and `check:live`
  prints a skip line for the D1 check.
- Optional variables `DISCOURSE_URL` and `DISCOURSE_CATEGORY_ID` and secrets
  `DISCOURSE_API_KEY` and `DISCOURSE_API_USERNAME` link issues and pull
  requests to a Discourse forum. Without both variables the jobs are skipped.
  - `issue-to-discourse.yml` opens a topic for each new issue and links it in
    a comment.
  - `pr-to-discourse.yml` does the same for each pull request once it is ready
    for review, skipping drafts and bots. It runs on `pull_request_target`
    from the default branch and never checks out the pull request's code.
  - Each topic has the `external_id` `github-issue-<n>` or `github-pr-<n>`. A
    re-run links the existing topic instead of opening a second one.
  - `discourse-comment-to-topic.yml` posts each new issue or pull request
    conversation comment as a reply. Review comments on code lines and review
    summary bodies (`pull_request_review`) are not mirrored.
  - `discourse-state.yml` mirrors a close, merge or reopen: it replies in the
    topic, closes or reopens it, and marks a completed issue's or merged pull
    request's reply as the solution, unless a person already chose one; a
    reopen unaccepts only close or merge replies. Marking needs Solved on the category: the
    Support category type, the site setting `allow_solved_on_all_topics`, or
    in older versions the category setting "Allow topic owner and staff to
    mark a reply as the solution".
    Without it the topic still closes.
  - The API user opens each topic, so it may mark the solution while the topic
    is open. Closing and reopening need it to be staff, trust level 4 or a
    category moderator.
  - Changing `DISCOURSE_API_USERNAME` leaves the old user's replies in place;
    they are not copied to GitHub again. A reopen still unaccepts the old
    user's close or merge reply, and a re-run reuses it.
  - `discourse-topic-to-issue.yml` copies forum replies from topics active in
    the last 48 hours to their issue or pull request, every 15 minutes.
    GitHub turns the schedule off after 60 days without repository activity.
  - Granular API key scopes: `topics` `write`, `read`, `read_lists` and
    `status`, and `solved` `answer`; a missing scope fails the job with its
    name.
  - Anyone can open an issue, a pull request from a fork, or a comment on a
    public repository, so anyone can open a topic or post to the forum.
    Mirrored text breaks `@mentions` on both sides.
  - Forum replies in `DISCOURSE_CATEGORY_ID` become public on GitHub, even on
    a forum that needs a login.
  - Edits and deletions are not mirrored.
  - Runs for one issue or pull request queue in order (`queue: max`), up to
    GitHub's 100 pending runs; a run beyond that is canceled and not retried.
