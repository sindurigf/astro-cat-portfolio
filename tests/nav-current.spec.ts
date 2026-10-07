import { expect, test, type Page } from './test';
import {
  CTA,
  HOME_HREF,
  NAV_LINKS,
  ariaCurrent,
  isActive,
} from '../src/lib/nav';
import { NON_TEXT, PAGE_HELPERS } from './contrast';
import { BLOG_PATH, indexPageHref } from '../src/lib/paths';
import { CATEGORY_ROUTES, NO_POST, POST_ROUTES, ROUTES } from './routes';
import { gotoSettled } from './settle';
import { DESKTOP_VIEWPORT, NARROW_WIDTH } from './wcag';
import { NODE } from './tags';
import { SITE_NAME } from '../src/lib/site';

const NARROW_VIEWPORT = {
  width: NARROW_WIDTH,
  height: DESKTOP_VIEWPORT.height,
};

/**
 * Which nav item is marked current. `isActive` is called directly with prefix
 * collisions no real route has; the rendered pages check all three navigations.
 */
/**
 * The header call to action sits outside the nav. The mobile dialog keeps a
 * copy in the DOM at every width, so it is excluded by name.
 */
const HEADER_NAV = 'header nav[aria-label="Primary"]';
const HEADER_CTA = `${HEADER_NAV} + div a[href="${CTA.href}"]:not(dialog a)`;

// The child combinator keeps out the mobile dialog's Home link.
const HEADER_LOGO = `header > div > a[href="${HOME_HREF}"]`;

/** The current header link's ground against a non-current one's. */
const currentFillContrast = (page: Page): Promise<number> =>
  page.evaluate(`(() => {
    ${PAGE_HELPERS}
    const current = document.querySelector('${HEADER_NAV} a[aria-current]');
    const rest = document.querySelector('${HEADER_NAV} a:not([aria-current])');
    if (!current || !rest) throw new Error('the header nav has no current or no other link');
    return ratio(effectiveBackground(current), effectiveBackground(rest));
  })()`) as Promise<number>;

test.describe('the current page, as the navigation reports it', () => {
  test('a route is its own current page', NODE, () => {
    for (const link of [...NAV_LINKS, CTA]) {
      expect(
        isActive(link.href, link.href),
        `${link.href} does not mark itself as the current page`,
      ).toBe(true);

      // Dev serves `/about` as well as `/about/`, so the unslashed path counts.
      const unslashed =
        link.href === HOME_HREF ? link.href : link.href.replace(/\/$/, '');
      expect(
        isActive(unslashed, link.href),
        `${unslashed} does not mark ${link.href} as the current page`,
      ).toBe(true);
    }
  });

  test('a route below a nav item is that nav item', NODE, () => {
    for (const href of ['/blog', '/blog/']) {
      for (const path of ['/blog/some-post/', '/blog/page/2', '/blog/travel']) {
        expect(
          isActive(path, href),
          `${path} does not fall under the Blog nav item (${href})`,
        ).toBe(true);
      }
    }
  });

  test(
    'a route below a nav item is announced as its section, not its page',
    NODE,
    () => {
      for (const href of ['/blog', '/blog/']) {
        for (const path of [
          '/blog/some-post/',
          '/blog/page/2',
          '/blog/travel',
        ]) {
          expect(
            ariaCurrent(path, href),
            `${path} would be announced as the ${href} page, which it is not`,
          ).toBe('true');
        }
        for (const path of ['/blog', '/blog/']) {
          expect(
            ariaCurrent(path, href),
            `${path} is ${href} itself and should be announced as the page`,
          ).toBe('page');
        }
      }
      expect(ariaCurrent('/careers/', '/career/')).toBeUndefined();
      expect(ariaCurrent('/about/', '/')).toBeUndefined();
    },
  );

  test(
    'a blog filter is the page on its own listing and the section past page 1',
    NODE,
    () => {
      expect(ariaCurrent(BLOG_PATH, BLOG_PATH)).toBe('page');
      expect(
        ariaCurrent(indexPageHref(2), BLOG_PATH),
        `"All Posts" would claim ${indexPageHref(2)}, which the page number is`,
      ).toBe('true');
      for (const route of CATEGORY_ROUTES) {
        const href = `${route}/`;
        expect(ariaCurrent(href, href), `${href} is its own filter`).toBe(
          'page',
        );
      }
    },
  );

  test(
    'a longer route with the same prefix is not the current page',
    NODE,
    () => {
      // Deliberately routes this site lacks: no page-driven test can catch these.
      const collisions = [
        { path: '/careers', href: '/career' },
        { path: '/blog-archive', href: '/blog' },
        { path: '/about-me', href: '/about' },
        { path: '/contact-form', href: '/contact' },
        { path: '/careers/', href: '/career/' },
        { path: '/blog-archive/', href: '/blog/' },
      ];

      for (const { path, href } of collisions) {
        expect(
          isActive(path, href),
          `${path} is being marked as ${href}.`,
        ).toBe(false);
      }
    },
  );

  test('Home is the only route that is Home', NODE, () => {
    // Every path starts with `/`, so a prefix match would light Home always.
    for (const path of ['/about', '/blog/some-post', '/contact']) {
      expect(isActive(path, '/'), `${path} is being marked as Home`).toBe(
        false,
      );
    }

    expect(isActive('/', '/'), '/ is not marking itself as Home').toBe(true);
  });

  // `NAV_LINKS` is hand-written, so check each href against the build.
  test('every navigation destination is a route this site builds', NODE, () => {
    const destinations = [...NAV_LINKS, CTA].map((link) => link.href);

    expect(
      destinations.length,
      'the navigation has no destinations, so the check below is vacuous.',
    ).toBeGreaterThan(0);

    // ROUTES names pages without the trailing slash the hrefs carry.
    for (const href of destinations) {
      const route = href === HOME_HREF ? href : href.replace(/\/$/, '');
      expect(
        ROUTES,
        `the navigation points at ${href}, which the site does not build`,
      ).toContain(route);
    }
  });

  test('/contact is marked as the current page in the header', async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT);
    await gotoSettled(page, CTA.href);

    await expect(
      page.locator(HEADER_CTA),
      'the call to action is not aria-current="page" on /contact.',
    ).toHaveAttribute('aria-current', 'page');
  });

  test('the current call to action is drawn as well as announced', async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT);
    await gotoSettled(page, CTA.href);

    const cta = page.locator(HEADER_CTA);

    // SC 1.4.1: the state is an inset ring, a shape, not only a color.
    const shadow = await cta.evaluate(
      (element) => getComputedStyle(element).boxShadow,
    );

    expect(shadow, 'the current call to action paints no ring.').not.toBe(
      'none',
    );
    expect(
      shadow,
      'the shadow is not inset, so it is the hover shadow, not the ring.',
    ).toContain('inset');

    const ringOnFill = (await page.evaluate(`(() => {
      ${PAGE_HELPERS}
      const cta = document.querySelector(${JSON.stringify(HEADER_CTA)});
      const style = getComputedStyle(cta);
      const fill = parse(style.backgroundColor);
      const ring = shadowLayers(style.boxShadow).find((layer) => layer.inset);
      return ring && ring.color && fill && fill.a === 1
        ? ratio(over(ring.color, fill), fill)
        : null;
    })()`)) as number | null;
    expect(ringOnFill, 'the ring or the fill is unmeasurable').not.toBeNull();
    expect(
      ringOnFill!,
      'the current-page ring against the call to action it marks (SC 1.4.11)',
    ).toBeGreaterThanOrEqual(NON_TEXT);
  });

  test('another route does not mark the call to action', async ({ page }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT);
    await gotoSettled(page, '/about');

    await expect(
      page.locator(HEADER_CTA),
      'the call to action is marked current on a route that is not it',
    ).not.toHaveAttribute('aria-current', 'page');
  });

  // Home is not in the desktop nav, so the logo alone marks `/` as current.
  test('the logo marks the homepage, which the desktop nav does not list', async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT);
    await gotoSettled(page, HOME_HREF);

    await expect(
      page.locator(`${HEADER_NAV} a[href="${HOME_HREF}"]`),
      'the desktop nav lists Home again beside the logo link.',
    ).toHaveCount(0);

    await expect(
      page.locator(HEADER_LOGO),
      'on / nothing in the desktop header announces the current page',
    ).toHaveAttribute('aria-current', 'page');
  });

  test('another route does not mark the logo', async ({ page }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT);
    await gotoSettled(page, '/about');

    await expect(
      page.locator(HEADER_LOGO),
      'the logo is marked current on a route that is not the homepage',
    ).not.toHaveAttribute('aria-current', 'page');
  });

  test('the dialog and the fallback agree with the header', async ({
    browser,
  }) => {
    // The dialog is server-rendered whole, so it is checked without opening it.
    const scripted = await browser.newContext({
      viewport: NARROW_VIEWPORT,
    });

    try {
      const page = await scripted.newPage();
      await gotoSettled(page, CTA.href);

      await expect(
        page.locator(`#mobile-menu-panel a[href="${CTA.href}"]`),
        'the mobile dialog does not mark the call to action as current.',
      ).toHaveAttribute('aria-current', 'page');
    } finally {
      await scripted.close();
    }

    const unscripted = await browser.newContext({
      javaScriptEnabled: false,
      viewport: NARROW_VIEWPORT,
    });

    try {
      const page = await unscripted.newPage();
      await page.goto(CTA.href);

      await expect(
        page.locator(`nav.noscript-nav a[href="${CTA.href}"]`),
        'the no-JavaScript fallback does not mark the call to action as current.',
      ).toHaveAttribute('aria-current', 'page');
    } finally {
      await unscripted.close();
    }
  });

  // On a post, Blog is the section (`aria-current="true"`), and keeps its box.
  test('on a post, every navigation marks Blog as the section, not the page', async ({
    page,
  }) => {
    test.skip(POST_ROUTES.length === 0, NO_POST);
    const blog = '/blog/';
    await page.setViewportSize(DESKTOP_VIEWPORT);
    await gotoSettled(page, POST_ROUTES[0]!);

    for (const selector of [
      `${HEADER_NAV} a[href="${blog}"]`,
      `#mobile-menu-panel a[href="${blog}"]`,
      `nav.noscript-nav a[href="${blog}"]`,
    ]) {
      await expect(
        page.locator(selector),
        `${selector} announces ${POST_ROUTES[0]} as the Blog page itself.`,
      ).toHaveAttribute('aria-current', 'true');
    }

    expect(
      await currentFillContrast(page),
      'on a post, the Blog fill is not 3:1 against the other links (SC 1.4.1, 1.4.11)',
    ).toBeGreaterThanOrEqual(NON_TEXT);
    await gotoSettled(page, blog);
    expect(
      await currentFillContrast(page),
      'on /blog/, the Blog fill is not 3:1 against the other links (SC 1.4.1, 1.4.11)',
    ).toBeGreaterThanOrEqual(NON_TEXT);
  });

  test('on /blog/, every navigation marks Blog as the current page', async ({
    page,
  }) => {
    const blog = '/blog/';
    await page.setViewportSize(DESKTOP_VIEWPORT);
    await gotoSettled(page, blog);

    for (const selector of [
      `${HEADER_NAV} a[href="${blog}"]`,
      `#mobile-menu-panel a[href="${blog}"]`,
      `nav.noscript-nav a[href="${blog}"]`,
    ]) {
      await expect(
        page.locator(selector),
        `${selector} does not mark /blog/ as the current page on /blog/ itself.`,
      ).toHaveAttribute('aria-current', 'page');
    }
  });
});

// SC 2.5.3. Chromium's own tree is read too: a <wbr> splits Chromium's computed
// name, which Playwright's computation does not.
test('the home link is named by its wordmark and nothing else', async ({
  page,
  browserName,
}) => {
  await page.setViewportSize(NARROW_VIEWPORT);
  await gotoSettled(page, '/about');
  const home = page.locator(HEADER_LOGO);
  await expect(home.locator('img')).toHaveAttribute('alt', '');
  await expect(home).toHaveAccessibleName(SITE_NAME);

  if (browserName !== 'chromium') return;
  const cdp = await page.context().newCDPSession(page);
  const { root } = await cdp.send('DOM.getDocument');
  const { nodeId } = await cdp.send('DOM.querySelector', {
    nodeId: root.nodeId,
    selector: HEADER_LOGO,
  });
  const { nodes } = await cdp.send('Accessibility.getPartialAXTree', {
    nodeId,
    fetchRelatives: false,
  });
  expect(
    String(nodes[0]?.name?.value ?? ''),
    'Chromium names the home link differently',
  ).toBe(SITE_NAME);
});

/*
 * `page` on a link elsewhere tells a screen reader it is on that page. Walks
 * /blog/page/N too once ROUTES lists it, where the page number is the page.
 */
for (const route of ROUTES) {
  test(`${route}: every aria-current="page" link points at the page it is on`, async ({
    page,
  }) => {
    await page.goto(route);
    const here = new URL(page.url()).pathname;
    const claimed = await page
      .locator('a[aria-current="page"]')
      .evaluateAll((links) =>
        links.map((link) => new URL((link as HTMLAnchorElement).href).pathname),
      );
    expect(
      claimed.filter((path) => path !== here),
      `${here} announces another URL as the current page`,
    ).toEqual([]);
  });
}
