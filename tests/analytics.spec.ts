import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from './test';
import { defined, itemAt } from '../src/lib/defined';
import {
  CLICK_EVENTS,
  filterPayload,
  PLAUSIBLE_ENDPOINT,
  withoutQuery,
} from '../src/lib/analytics';
import { ANALYTICS_ON } from '../src/lib/analytics-site';
import { CONTACT_EMAIL } from '../src/lib/contact';
import { SOCIAL_PROFILES } from '../src/lib/profiles';
import { captures } from './captures';
import { usePolicyServer } from './headers-fixture';
import { builtPages, DIST_DIR, PAIRED_TALKS } from './routes';
import { waitForHydration } from './settle';
import { NODE } from './tags';
import { configuredSite } from './source';
import { fakeCollector, type PlausibleSend } from './plausible';
import { REFLOW_VIEWPORT } from './wcag';

/**
 * Plausible, held to what /privacy discloses (PAYLOAD_DISCLOSED, EVENT_DATA_DISCLOSED).
 * The tracker sends only from the production host, so the build is served as `site`.
 */

const SITE = configuredSite().replace(/\/$/, '');
const HOST = new URL(SITE).hostname;

/** A workers.dev preview: not production, and not localhost, which the tracker skips itself. */
const PREVIEW = 'https://portfolio.example.workers.dev';

/** Each field the tracker may send, and the words /privacy discloses it in; null is not about the visitor. */
const PAYLOAD_DISCLOSED: Record<string, string | null> = {
  n: 'what kind of control it was',
  u: "the page's address",
  r: 'the address of the page that linked you here',
  p: 'its label',
  sd: 'how far down the page you scrolled',
  e: 'how long you had the page in view',
  /* Tracker version, site domain, interactive flag, hash routing. */
  v: null,
  d: null,
  i: null,
  h: null,
};
const EVENT_DATA_DISCLOSED: Record<string, string> = {
  label: 'its label',
  area: 'which part of the page it is in',
  target: 'where it goes',
};
const PAYLOAD_KEYS = Object.keys(PAYLOAD_DISCLOSED);
const EVENT_DATA_KEYS = Object.keys(EVENT_DATA_DISCLOSED);

const PAGEVIEW = 'pageview';
const ENGAGEMENT = 'engagement';

const SEND_TIMEOUT_MS = 10_000;

const ANALYTICS_OFF = 'analytics is off in src/site.config.ts';

/* A post that links its talk's PDF: tests/slides.spec.ts. */
const [PAIRED] = PAIRED_TALKS;

const policy = usePolicyServer();

/**
 * Serves the build at `origin`; stubs every other origin so outbound links never
 * hit the network. `__plausible` lifts the tracker's own skip under automation.
 */
const openAt = async (
  page: Page,
  origin: string,
  path: string,
  referer?: string,
): Promise<PlausibleSend[]> => {
  const context = page.context();

  await context.addInitScript(() => {
    (window as { __plausible?: boolean }).__plausible = true;
  });
  await context.route(
    (url) => url.origin !== origin && url.href !== PLAUSIBLE_ENDPOINT,
    (route) => route.fulfill({ status: 200, body: '' }),
  );
  await context.route(`${origin}/**`, async (route) => {
    const { pathname, search } = new URL(route.request().url());
    const response = await route.fetch({
      url: `${policy().origin}${pathname}${search}`,
    });
    await route.fulfill({ response });
  });
  const sent = await fakeCollector(context);

  await page.goto(`${origin}${path}`, referer ? { referer } : {});
  await waitForHydration(page);
  return sent;
};

const openAsProduction = (page: Page, path: string, referer?: string) =>
  openAt(page, SITE, path, referer);

type ClickEvent = { name: string; data: Record<string, unknown> };

const events = (sent: PlausibleSend[]): ClickEvent[] =>
  sent
    .filter(({ n }) => n !== PAGEVIEW && n !== ENGAGEMENT)
    .map(({ n, p }) => ({
      name: String(n),
      data: (p ?? {}) as Record<string, unknown>,
    }));

const PROBE_EVENT = 'silence-probe';

// Silence after a probe means the tracker declined to send, not that it never
// loaded: the callback runs after the fetch, or at once when it declines.
const sendProbe = async (page: Page): Promise<void> => {
  await page.waitForFunction(
    () => typeof (window as { plausible?: unknown }).plausible === 'function',
    undefined,
    { timeout: SEND_TIMEOUT_MS },
  );
  await page.evaluate(
    (name) =>
      new Promise<void>((done) => {
        (
          window as unknown as {
            plausible: (
              name: string,
              options: { callback: () => void },
            ) => void;
          }
        ).plausible(name, { callback: done });
      }),
    PROBE_EVENT,
  );
};

// Closing the context mid route.fetch() fails a passed test ("Fetch response has
// been disposed"); `wait` instead can hit "Route is already handled!".
const unrouteAfterEach = () =>
  test.afterEach(async ({ context }) => {
    await context.unrouteAll({ behavior: 'ignoreErrors' });
  });

const expectOnlyDisclosedData = (recorded: ClickEvent[]): void => {
  for (const event of recorded) {
    const extra = Object.keys(event.data).filter(
      (key) => !EVENT_DATA_KEYS.includes(key),
    );
    expect(extra, 'a click event sends data /privacy does not list').toEqual(
      [],
    );
  }
};

/** Built scripts each page loads that send to Plausible. */
const trackersOn = (html: string): string[] =>
  captures(html, /<script\b[^>]*\bsrc="(\/_astro\/[^"]+\.js)"/g).filter((src) =>
    readFileSync(join(DIST_DIR, src), 'utf8').includes(PLAUSIBLE_ENDPOINT),
  );

/* Off production and under Do Not Track the tracker never starts, so there is no probe to send. */
const expectSilent = async (
  page: Page,
  sent: PlausibleSend[],
): Promise<void> => {
  const trackerLoaded = await page.evaluate(async (endpoint) => {
    const sources = [
      ...document.querySelectorAll<HTMLScriptElement>(
        'script[type="module"][src]',
      ),
    ].map((script) => script.src);
    const bodies = await Promise.all(
      sources.map((src) => fetch(src).then((response) => response.text())),
    );
    return bodies.some((body) => body.includes(endpoint));
  }, PLAUSIBLE_ENDPOINT);
  expect(
    trackerLoaded,
    'the page never loaded the tracker, so its silence proves nothing.',
  ).toBe(true);
  expect(
    await page.evaluate(() => 'plausible' in window),
    'the tracker started where it must stay off.',
  ).toBe(false);

  const link = 'footer a[href^="/"]';
  await holdNavigation(page, link);
  await page.locator(link).first().click();
  await page.waitForLoadState('networkidle');
  expect(sent, 'a page view or click was sent.').toEqual([]);
};

/* Runs after the document-level capture listener under test. */
const holdNavigation = async (page: Page, selector: string): Promise<void> => {
  await page
    .locator(selector)
    .first()
    .evaluate((link) =>
      link.addEventListener('click', (event) => event.preventDefault()),
    );
};

test.describe('analytics, either way', () => {
  test('a sent address drops its query and fragment', NODE, () => {
    expect(withoutQuery(`${SITE}/about/?utm_source=x&fbclid=y#top`)).toBe(
      `${SITE}/about/`,
    );
    expect(withoutQuery('not a url')).toBe('');
  });

  test('nothing is sent off production or under Do Not Track', NODE, () => {
    const payload = { n: PAGEVIEW, u: `${SITE}/`, d: HOST, r: null };
    const context = { hostname: HOST, productionHost: HOST, doNotTrack: null };

    expect(filterPayload(payload, context)).not.toBeNull();
    expect(
      filterPayload(payload, {
        ...context,
        hostname: new URL(PREVIEW).hostname,
      }),
      'a preview deploy would be counted.',
    ).toBeNull();
    expect(
      filterPayload(payload, { ...context, doNotTrack: '1' }),
      '/privacy says Do Not Track stops all sending.',
    ).toBeNull();
  });
});

test.describe('analytics off', () => {
  test.skip(ANALYTICS_ON, 'analytics is on in src/site.config.ts');

  test('no page loads the tracker', NODE, () => {
    const loading = builtPages()
      .filter(({ file }) => trackersOn(readFileSync(file, 'utf8')).length > 0)
      .map(({ route }) => route);

    expect(loading, 'these pages load the tracker').toEqual([]);
  });

  test.describe('in a browser', () => {
    unrouteAfterEach();

    test('nothing is sent from production either', async ({ page }) => {
      const sent = await openAsProduction(page, '/');
      await page
        .getByRole('contentinfo')
        .getByRole('link', { name: 'Privacy' })
        .click();
      await page.waitForURL(`${SITE}/privacy/`);

      expect(
        await page.evaluate(() => 'plausible' in window),
        'the tracker loaded',
      ).toBe(false);
      expect(sent, 'something reached the collector').toEqual([]);
    });
  });
});

test.describe('analytics', () => {
  test.skip(!ANALYTICS_ON, ANALYTICS_OFF);

  test(
    'every page loads the bundled tracker once, from this origin',
    NODE,
    () => {
      for (const { route, file } of builtPages()) {
        const html = readFileSync(file, 'utf8');
        expect(
          html,
          `${route} loads a script from Plausible; the tracker is bundled.`,
        ).not.toMatch(/<script\b[^>]*plausible\.io/);
        expect(
          trackersOn(html),
          `${route} should load the script that sends to Plausible exactly once`,
        ).toHaveLength(1);
      }
    },
  );

  test(
    'every field the tracker may send is disclosed in the /privacy text',
    NODE,
    () => {
      const privacy = readFileSync(
        join(DIST_DIR, 'privacy', 'index.html'),
        'utf8',
      )
        .replace(/<[^>]+>/g, ' ')
        .replace(/&#39;|&apos;/g, "'")
        .replace(/\s+/g, ' ');
      const phrases = [
        ...Object.values(PAYLOAD_DISCLOSED),
        ...Object.values(EVENT_DATA_DISCLOSED),
      ].filter((phrase) => phrase !== null);
      expect(
        phrases.filter((phrase) => !privacy.includes(phrase)),
        '/privacy no longer says it sends these',
      ).toEqual([]);
    },
  );

  test.describe('in a browser', () => {
    unrouteAfterEach();

    test('nothing is sent from any host but production', async ({ page }) => {
      const sent = await openAt(page, PREVIEW, '/');
      await page
        .getByRole('contentinfo')
        .getByRole('link', { name: 'Privacy' })
        .click();
      await page.waitForURL(`${PREVIEW}/privacy/`);
      await expectSilent(page, sent);
    });

    test('a page view is sent, with only the fields /privacy lists', async ({
      page,
    }) => {
      const sent = await openAsProduction(
        page,
        '/about/?utm_source=test#top',
        'https://example.com/post?id=1#comments',
      );

      await expect
        .poll(() => sent.length, { timeout: SEND_TIMEOUT_MS })
        .toBeGreaterThan(0);

      const [view] = sent;
      if (!view) throw new Error('No event was sent.');
      expect(view).toMatchObject({
        n: PAGEVIEW,
        d: HOST,
        u: `${SITE}/about/`,
        r: 'https://example.com/post',
      });

      const undisclosed = Object.keys(view).filter(
        (key) => !PAYLOAD_KEYS.includes(key),
      );
      expect(
        undisclosed,
        'the tracker sends field(s) /privacy does not list.',
      ).toEqual([]);
    });

    test('leaving a page sends scroll depth and time, with only the fields /privacy lists', async ({
      page,
    }) => {
      const sent = await openAsProduction(page, '/about/?utm_source=test#top');
      await expect
        .poll(() => sent.length, { timeout: SEND_TIMEOUT_MS })
        .toBeGreaterThan(0);

      /* What a tab switch or leaving the page reports; headless never hides the page itself. */
      await page.evaluate(() => {
        Object.defineProperty(document, 'visibilityState', {
          get: () => 'hidden',
        });
        document.dispatchEvent(new Event('visibilitychange'));
      });

      await expect
        .poll(() => sent.some(({ n }) => n === ENGAGEMENT), {
          timeout: SEND_TIMEOUT_MS,
        })
        .toBe(true);
      const engagement = sent.find(({ n }) => n === ENGAGEMENT)!;
      expect(engagement.u).toBe(`${SITE}/about/`);
      expect(
        Object.keys(engagement).filter((key) => !PAYLOAD_KEYS.includes(key)),
        'the engagement event sends field(s) /privacy does not list.',
      ).toEqual([]);
    });

    /* Control for the silence checks: a probe that never sends would pass both. */
    test('the silence probe is sent where sending is allowed', async ({
      page,
    }) => {
      const sent = await openAsProduction(page, '/');
      await sendProbe(page);

      await expect
        .poll(() => events(sent).map((event) => event.name), {
          timeout: SEND_TIMEOUT_MS,
          message:
            'the probe was never sent, so the silence checks prove nothing.',
        })
        .toContain(PROBE_EVENT);
    });

    test('Do Not Track sends nothing', async ({ page }) => {
      await page.addInitScript(() => {
        Object.defineProperty(Navigator.prototype, 'doNotTrack', {
          get: () => '1',
        });
      });
      const sent = await openAsProduction(page, '/');
      await expectSilent(page, sent);
    });

    test('a followed internal link is counted and still navigates', async ({
      page,
    }) => {
      const sent = await openAsProduction(page, '/');

      await page
        .getByRole('contentinfo')
        .getByRole('link', { name: 'Privacy' })
        .click();
      await page.waitForURL(`${SITE}/privacy/`);

      await expect
        .poll(() => events(sent), { timeout: SEND_TIMEOUT_MS })
        .toContainEqual({
          name: CLICK_EVENTS.internalLink,
          data: { label: 'Privacy', area: 'footer', target: '/privacy/' },
        });
    });

    test('outbound, email and button clicks are counted', async ({ page }) => {
      await page.setViewportSize(REFLOW_VIEWPORT);
      const sent = await openAsProduction(page, '/');

      const profile = itemAt(SOCIAL_PROFILES, 0);
      const outbound = `footer a[href="${profile.href}"]`;
      const email = 'footer a[href^="mailto:"]';
      for (const selector of [outbound, email]) {
        await holdNavigation(page, selector);
        await page.locator(selector).first().click();
      }
      await page.getByRole('button', { name: /menu/i }).click();

      const recorded = (): ClickEvent[] => events(sent);
      await expect
        .poll(() => recorded().length, { timeout: SEND_TIMEOUT_MS })
        .toBeGreaterThanOrEqual(3);

      const byName = (name: string) =>
        recorded().find((event) => event.name === name);

      expect(byName(CLICK_EVENTS.outboundLink)).toMatchObject({
        data: {
          area: 'footer',
          target: `${new URL(profile.href).origin}${new URL(profile.href).pathname}`,
        },
      });
      expect(
        byName(CLICK_EVENTS.email)?.data.target,
        'an email click should not send the address',
      ).toBeUndefined();
      expect(byName(CLICK_EVENTS.button)).toMatchObject({
        data: { area: 'header' },
      });
      expectOnlyDisclosedData(recorded());
    });

    test('a download click is counted', async ({ page }) => {
      test.skip(!PAIRED, 'no post links a talk PDF to download');
      const paired = defined(PAIRED, 'a post linking a talk PDF');
      const target = `${paired.talk}.pdf`;
      const sent = await openAsProduction(page, `${paired.post}/`);

      const download = `a[href="${target}"]`;
      await holdNavigation(page, download);
      await page.locator(download).first().click();

      await expect
        .poll(
          () =>
            events(sent).find((event) => event.name === CLICK_EVENTS.download),
          { timeout: SEND_TIMEOUT_MS },
        )
        .toMatchObject({ data: { target } });
      expectOnlyDisclosedData(events(sent));
    });

    test('only the mobile menu reports area menu; the photo viewer and cat card report main', async ({
      page,
    }) => {
      await page.setViewportSize(REFLOW_VIEWPORT);
      const sent = await openAsProduction(page, '/about/');

      await page.getByRole('button', { name: /menu/i }).click();
      const menuLink = '#mobile-menu-panel a[href]';
      const menuTarget = await page
        .locator(menuLink)
        .first()
        .getAttribute('href');
      await holdNavigation(page, menuLink);
      await page.locator(menuLink).first().click();
      await page.keyboard.press('Escape');
      await expect(page.locator('#mobile-menu-panel')).toBeHidden();

      const photos = page.locator('a[data-photo="people"]');
      await photos.first().click();
      const viewer = page.getByRole('dialog', { name: 'Photo' });
      await viewer.getByRole('button', { name: 'Next' }).click();
      await viewer.getByRole('button', { name: 'Close' }).click();
      await expect(viewer).toBeHidden();
      /* The viewer's close event, a task after Close, focuses the photo shown; a cat focused before it loses focus to it. */
      await expect(photos.nth(1)).toBeFocused();

      // TODO(fork): Use your first cat's name below, or delete these lines up to the card's Close with the cats.
      const cat = page.locator('#cat-spot-minerva .cat-button');
      await cat.focus();
      await expect(cat).toBeFocused();
      await page.keyboard.press('Enter');
      const card = page.getByRole('dialog', { name: 'Minerva' });
      await expect(card).toBeVisible();
      await card.getByRole('button', { name: 'Close' }).click();

      const areaOf = (label: string) =>
        events(sent)
          .filter(
            (event) =>
              event.name === CLICK_EVENTS.button && event.data.label === label,
          )
          .map((event) => event.data.area);

      await expect
        .poll(() => areaOf('Close').length, {
          timeout: SEND_TIMEOUT_MS,
        })
        .toBe(2);
      expect(
        events(sent)
          .filter((event) => event.data.target === menuTarget)
          .map((event) => event.data.area),
        'a menu link is not reported as menu',
      ).toEqual(['menu']);
      expect(
        [...areaOf('Next'), ...areaOf('Close')],
        'a click in the photo viewer or cat card is not reported as main',
      ).toEqual(['main', 'main', 'main']);
    });

    /* The /contact email card's text contains the address, so a text label would leak it. */
    test('no email click sends the address, in any field', async ({ page }) => {
      const sent = await openAsProduction(page, '/contact/');
      const email = 'a[href^="mailto:"]';
      const links = page.locator(email);
      const count = await links.count();
      expect(count, '/contact should carry mailto links').toBeGreaterThan(1);

      for (let index = 0; index < count; index += 1) {
        const link = links.nth(index);
        await link.evaluate((element) =>
          element.addEventListener('click', (event) => event.preventDefault()),
        );
        await link.click();
      }

      const emailEvents = (): ClickEvent[] =>
        events(sent).filter((event) => event.name === CLICK_EVENTS.email);
      await expect
        .poll(() => emailEvents().length, { timeout: SEND_TIMEOUT_MS })
        .toBe(count);

      expect(
        JSON.stringify(emailEvents()),
        '/privacy says an email click leaves the address out',
      ).not.toContain(CONTACT_EMAIL);
    });

    test('typing into the contact form sends nothing', async ({ page }) => {
      const sent = await openAsProduction(page, '/contact/');
      await expect
        .poll(() => sent.length, { timeout: SEND_TIMEOUT_MS })
        .toBeGreaterThan(0);
      const before = events(sent).length;

      const secret = 'do-not-send-this-text';
      await page.getByRole('textbox').first().click();
      await page.getByRole('textbox').first().fill(secret);
      await sendProbe(page);
      await expect
        .poll(() => events(sent).map((event) => event.name), {
          timeout: SEND_TIMEOUT_MS,
        })
        .toContain(PROBE_EVENT);

      expect(
        JSON.stringify(sent),
        '/privacy says what you type is never sent to Plausible',
      ).not.toContain(secret);
      expect(
        events(sent).length,
        'clicking into a field is not a click on a control',
      ).toBe(before + 1);
    });
  });
});
