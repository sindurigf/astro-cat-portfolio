import { expect, test } from './test';
import { DEMO_ENV } from '../playwright.demo.config';
import { NODE } from './tags';
import { templateUseUrl } from '../src/lib/site';

/*
 * SEO and build correctness of a NOINDEX build with SITE_URL and
 * CONTACT_FORM=none: playwright.demo.config.ts. The default build's side is
 * tests/sitemap.spec.ts, tests/canonical.spec.ts and tests/headers-rules.spec.ts.
 */

const SITEMAP_PATH = '/sitemap-index.xml';
const CONVENTIONAL_SITEMAP_PATH = '/sitemap.xml';

/* A prerendered page, a static asset, and a path run_worker_first sends to the Worker. */
const RESPONSES = ['/', '/favicon.svg', '/contact/send/'] as const;

const CANONICAL_PAGES = ['/', '/about/', '/blog/'] as const;

test.describe('NOINDEX build', NODE, () => {
  for (const path of RESPONSES) {
    test(`${path} carries X-Robots-Tag: noindex`, async ({ request }) => {
      const response = await request.get(path, { maxRedirects: 0 });

      expect(
        response.headers()['x-robots-tag'],
        `${path} can be indexed.`,
      ).toBe('noindex');
    });
  }

  test('robots.txt lets crawlers reach the noindex header and names no sitemap', async ({
    request,
  }) => {
    const robots = await (await request.get('/robots.txt')).text();
    const groups = robots.split(/\n\s*\n/).map((group) => group.trim());

    // A crawler blocked by robots.txt never reads noindex, and Google indexes the bare URL.
    expect(
      groups.find((group) => group.startsWith('User-agent: *')),
      'robots.txt disallows every crawler, which hides the noindex header.',
    ).toBe('User-agent: *\nAllow: /');
    expect(robots, 'robots.txt still names a sitemap.').not.toMatch(
      /^Sitemap:/im,
    );
  });

  test('no sitemap is built or advertised', async ({ request }) => {
    expect(
      (await request.get(SITEMAP_PATH)).status(),
      `${SITEMAP_PATH} was built.`,
    ).toBe(404);
    expect(
      (
        await request.get(CONVENTIONAL_SITEMAP_PATH, { maxRedirects: 0 })
      ).status(),
      `${CONVENTIONAL_SITEMAP_PATH} still redirects to a sitemap that is not built.`,
    ).toBe(404);

    const home = await request.get('/');
    expect(
      home.headers()['link'],
      'the Link header still advertises the sitemap.',
    ).not.toContain(SITEMAP_PATH);
    expect(
      await home.text(),
      'the page head still links the sitemap.',
    ).not.toContain('rel="sitemap"');
  });

  for (const path of CANONICAL_PAGES) {
    test(`${path} names SITE_URL as its canonical and og:url`, async ({
      request,
    }) => {
      const html = await (await request.get(path)).text();
      const expected = new URL(path, DEMO_ENV.SITE_URL).href;

      expect(
        /<link rel="canonical" href="([^"]+)"/.exec(html)?.[1],
        `${path}'s canonical is not on SITE_URL.`,
      ).toBe(expected);
      expect(
        /<meta property="og:url" content="([^"]+)"/.exec(html)?.[1],
        `${path}'s og:url is not on SITE_URL.`,
      ).toBe(expected);
    });
  }
});

test('CONTACT_FORM=none: /contact offers the email address and no form', async ({
  page,
}) => {
  await page.goto('/contact/');
  const main = page.getByRole('main');

  await expect(
    main.locator('a[href^="mailto:"]').first(),
    '/contact has no email link.',
  ).toBeVisible();
  await expect(main.locator('form'), '/contact still has a form.').toHaveCount(
    0,
  );
});

test('REPOSITORY_URL: both /brand calls to action point at it', async ({
  page,
}) => {
  await page.goto('/brand/');
  for (const [name, href] of [
    ['View the source', DEMO_ENV.REPOSITORY_URL],
    ['Use this design', templateUseUrl(DEMO_ENV.REPOSITORY_URL)],
  ] as const) {
    const hrefs = await page
      .getByRole('link', { name, exact: true })
      .evaluateAll((all) => all.map((a) => a.getAttribute('href')));
    expect(hrefs.length, `/brand has no "${name}" link.`).toBeGreaterThan(0);
    expect(
      new Set(hrefs),
      `"${name}" does not point at REPOSITORY_URL.`,
    ).toEqual(new Set([href]));
  }
});
