import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from './test';
import {
  CLICK_EVENTS,
  UMAMI_HOST_URL,
  UMAMI_SCRIPT_PATH,
} from '../src/lib/analytics';
import { ANALYTICS_ON, UMAMI_WEBSITE_ID } from '../src/lib/analytics-site';
import { CONTACT_EMAIL } from '../src/lib/contact';
import { SOCIAL_PROFILES } from '../src/lib/profiles';
import { usePolicyServer } from './headers-fixture';
import { builtPages, DIST_DIR, PAIRED_TALKS } from './routes';
import { waitForHydration } from './settle';
import { configuredSite } from './source';
import { fakeCollector, type UmamiSend } from './umami';
import { REFLOW_VIEWPORT } from './wcag';

/**
 * Umami, held to what /privacy discloses (PAYLOAD_DISCLOSED, EVENT_DATA_DISCLOSED).
 * The tracker sends only from the production host, so the build is served as `site`.
 */

const SITE = configuredSite().replace(/\/$/, '');

/** Each field the tracker may send, and the words /privacy discloses it in; null is not about the visitor. */
const PAYLOAD_DISCLOSED: Record<string, string | null> = {
  website: null,
  screen: 'your screen size',
  language: "your browser's language",
  title: "the page's address and title",
  hostname: "the page's address",
  url: "the page's address",
  referrer: 'the address of the page that linked you here',
  /* Set only by `data-tag` and `umami.identify()`, neither used here. */
  tag: null,
  id: null,
  name: 'what kind of control it was',
  data: 'its label',
};
const EVENT_DATA_DISCLOSED: Record<string, string> = {
  label: 'its label',
  area: 'which part of the page it is in',
  target: 'where it goes',
};
const PAYLOAD_KEYS = Object.keys(PAYLOAD_DISCLOSED);
const EVENT_DATA_KEYS = Object.keys(EVENT_DATA_DISCLOSED);

const SEND_TIMEOUT_MS = 10_000;

const ANALYTICS_OFF = 'analytics is off in src/site.config.ts';

/* A post that links its talk's PDF: tests/slides.spec.ts. */
const [PAIRED] = PAIRED_TALKS;

const policy = usePolicyServer();

// Closing the context mid route.fetch() fails a passed test ("Fetch response has
// been disposed"); `wait` instead can hit "Route is already handled!".
test.afterEach(async ({ context }) => {
  await context.unrouteAll({ behavior: 'ignoreErrors' });
});

/** Serves the build as production; stubs every other origin so outbound links never hit the network. */
const openAsProduction = async (
  page: Page,
  path: string,
): Promise<UmamiSend[]> => {
  const context = page.context();

  await context.route(
    (url) => url.origin !== SITE && !url.href.startsWith(UMAMI_HOST_URL),
    (route) => route.fulfill({ status: 200, body: '' }),
  );
  await context.route(`${SITE}/**`, async (route) => {
    const { pathname, search } = new URL(route.request().url());
    const response = await route.fetch({
      url: `${policy().origin}${pathname}${search}`,
    });
    await route.fulfill({ response });
  });
  const sent = await fakeCollector(context);

  await page.goto(`${SITE}${path}`);
  await waitForHydration(page);
  return sent;
};

const events = (sent: UmamiSend[]): Record<string, unknown>[] =>
  sent.filter(({ payload }) => 'name' in payload).map(({ payload }) => payload);

const expectOnlyDisclosedData = (recorded: Record<string, unknown>[]): void => {
  for (const event of recorded) {
    const extra = Object.keys(event.data as object).filter(
      (key) => !EVENT_DATA_KEYS.includes(key),
    );
    expect(extra, 'a click event sends data /privacy does not list').toEqual(
      [],
    );
  }
};

const PROBE_EVENT = 'silence-probe';

// Silence after a probe means the tracker declined to send, not that it never
// loaded. track() settles after its fetch, or at once when it declines.
const sendProbe = async (page: Page): Promise<void> => {
  await page.waitForFunction(
    () =>
      typeof (window as { umami?: { track?: unknown } }).umami?.track ===
      'function',
    undefined,
    { timeout: SEND_TIMEOUT_MS },
  );
  await page.evaluate(
    (name) =>
      (
        window as unknown as {
          umami: { track(name: string): Promise<unknown> };
        }
      ).umami.track(name),
    PROBE_EVENT,
  );
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

test.describe('analytics off', () => {
  test.skip(ANALYTICS_ON, 'analytics is on in src/site.config.ts');

  test('no page loads the tracker', () => {
    const loading = builtPages()
      .filter(({ file }) =>
        /<script\b[^>]*umami[^>]*>/.test(readFileSync(file, 'utf8')),
      )
      .map(({ route }) => route);

    expect(loading, 'these pages load the tracker').toEqual([]);
  });

  test('nothing is sent from production either', async ({ page }) => {
    const sent = await openAsProduction(page, '/');
    await page
      .getByRole('contentinfo')
      .getByRole('link', { name: 'Privacy' })
      .click();
    await page.waitForURL(`${SITE}/privacy/`);

    expect(
      await page.evaluate(() => 'umami' in window),
      'the tracker loaded',
    ).toBe(false);
    expect(sent, 'something reached the collector').toEqual([]);
  });
});

test.describe('analytics', () => {
  test.skip(!ANALYTICS_ON, ANALYTICS_OFF);

  test('every page loads the vendored tracker, configured as /privacy says', () => {
    const host = new URL(SITE).hostname;

    for (const { route, file } of builtPages()) {
      const html = readFileSync(file, 'utf8');
      const tags = [...html.matchAll(/<script\b[^>]*umami[^>]*>/g)].map(
        (match) => match[0],
      );

      expect(
        tags,
        `${route} should load the tracker exactly once`,
      ).toHaveLength(1);
      const tag = tags[0]!;

      expect(
        tag,
        `${route} loads the tracker from somewhere other than this origin`,
      ).toContain(`src="${UMAMI_SCRIPT_PATH}"`);
      expect(tag).toContain(`data-website-id="${UMAMI_WEBSITE_ID}"`);
      expect(tag).toContain(`data-host-url="${UMAMI_HOST_URL}"`);
      expect(
        tag,
        `${route}: without data-domains every localhost run and preview deploy is counted`,
      ).toContain(`data-domains="${host}"`);
      expect(
        tag,
        `${route}: /privacy says a browser with Do Not Track on sends nothing`,
      ).toContain('data-do-not-track="true"');
      expect(
        tag,
        `${route}: inbound query strings (utm, fbclid) would reach Umami`,
      ).toContain('data-exclude-search="true"');
    }
  });

  test('the served tracker is the vendored file, unmodified', () => {
    const vendored = readFileSync(join('public', UMAMI_SCRIPT_PATH));
    const built = readFileSync(join(DIST_DIR, UMAMI_SCRIPT_PATH));

    expect(
      built.equals(vendored),
      `${UMAMI_SCRIPT_PATH} in the build differs from public/.`,
    ).toBe(true);
  });

  test('every field the tracker may send is disclosed in the /privacy text', () => {
    const privacy = readFileSync(
      join(DIST_DIR, 'privacy', 'index.html'),
      'utf8',
    )
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ');
    const phrases = [
      ...Object.values(PAYLOAD_DISCLOSED),
      ...Object.values(EVENT_DATA_DISCLOSED),
    ].filter((phrase) => phrase !== null);
    expect(
      phrases.filter((phrase) => !privacy.includes(phrase)),
      '/privacy no longer says it sends these',
    ).toEqual([]);
  });

  test('nothing is sent from any host but production', async ({ page }) => {
    const sent = await fakeCollector(page.context());

    await page.goto(`${policy().origin}/`);
    await waitForHydration(page);
    await page.getByRole('link', { name: 'Privacy' }).first().click();
    await page.waitForURL('**/privacy/');
    await sendProbe(page);

    expect(
      sent,
      'the tracker sent from 127.0.0.1; data-domains should stop that.',
    ).toEqual([]);
  });

  test('a page view is sent, with only the fields /privacy lists', async ({
    page,
  }) => {
    const sent = await openAsProduction(page, '/about/');

    await expect
      .poll(() => sent.length, { timeout: SEND_TIMEOUT_MS })
      .toBeGreaterThan(0);

    const [view] = sent;
    expect(view!.type).toBe('event');
    expect(view!.payload.website).toBe(UMAMI_WEBSITE_ID);
    expect(String(view!.payload.url)).toContain('/about/');

    const undisclosed = Object.keys(view!.payload).filter(
      (key) => !PAYLOAD_KEYS.includes(key),
    );
    expect(
      undisclosed,
      'the tracker sends field(s) /privacy does not list.',
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
    await sendProbe(page);

    expect(sent, '/privacy says Do Not Track stops all sending').toEqual([]);
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
      .toContainEqual(
        expect.objectContaining({
          name: CLICK_EVENTS.internalLink,
          data: { label: 'Privacy', area: 'footer', target: '/privacy/' },
        }),
      );
  });

  test('outbound, email and button clicks are counted', async ({ page }) => {
    await page.setViewportSize(REFLOW_VIEWPORT);
    const sent = await openAsProduction(page, '/');

    const [profile] = SOCIAL_PROFILES;
    const outbound = `footer a[href="${profile.href}"]`;
    const email = 'footer a[href^="mailto:"]';
    for (const selector of [outbound, email]) {
      await holdNavigation(page, selector);
      await page.locator(selector).first().click();
    }
    await page.getByRole('button', { name: /menu/i }).click();

    const recorded = (): Record<string, unknown>[] => events(sent);
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
      (byName(CLICK_EVENTS.email)?.data as Record<string, unknown>)?.target,
      'an email click should not send the address',
    ).toBeUndefined();
    expect(byName(CLICK_EVENTS.button)).toMatchObject({
      data: { area: 'header' },
    });
    expectOnlyDisclosedData(recorded());
  });

  test('a download click is counted', async ({ page }) => {
    test.skip(!PAIRED, 'no post links a talk PDF to download');
    const target = `${PAIRED!.talk}.pdf`;
    const sent = await openAsProduction(page, `${PAIRED!.post}/`);

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

    const cat = page.locator('#cat-spot-pepper .cat-button');
    await cat.focus();
    await expect(cat).toBeFocused();
    await page.keyboard.press('Enter');
    const card = page.getByRole('dialog', { name: 'Pepper' });
    await expect(card).toBeVisible();
    await card.getByRole('button', { name: 'Close' }).click();

    const areaOf = (label: string) =>
      events(sent)
        .filter(
          (event) =>
            event.name === CLICK_EVENTS.button &&
            (event.data as { label?: unknown }).label === label,
        )
        .map((event) => (event.data as { area?: unknown }).area);

    await expect
      .poll(() => areaOf('Close').length, {
        timeout: SEND_TIMEOUT_MS,
      })
      .toBe(2);
    expect(
      events(sent)
        .filter(
          (event) => (event.data as { target?: unknown }).target === menuTarget,
        )
        .map((event) => (event.data as { area?: unknown }).area),
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

    const emailEvents = (): Record<string, unknown>[] =>
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
    const before = sent.length;

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
      '/privacy says what you type is never sent to Umami',
    ).not.toContain(secret);
    expect(
      sent.length,
      'clicking into a field is not a click on a control',
    ).toBe(before + 1);
  });
});
