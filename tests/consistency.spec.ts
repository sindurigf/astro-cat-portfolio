import { expect, test, type Browser, type Page } from './test';
import { HOME_HREF } from '../src/lib/nav';
import { ROUTES } from './routes';
import { gotoSettled } from './settle';
import { DESKTOP_VIEWPORT, PHONE_VIEWPORT, TAB_WIDTH } from './wcag';
import { ENGINE_INVARIANT } from './tags';

/**
 * SC 3.2.3 Consistent Navigation and SC 3.2.4 Consistent Identification: the
 * links and controls every page repeats outside <main>, compared with the homepage.
 */

/* The skip link, the report band, the header and the footer. */
const SITE_REGIONS = 'body > :is(aside, header, footer)';
const REPEATED_LINKS = `body > a[href], ${SITE_REGIONS} a[href]`;
const REPEATED_CONTROLS = `body > a[href]:visible, :is(${SITE_REGIONS}, body > [data-reading-tab]) :is(a[href], button):visible`;

/* The phone header shows Menu and Aa, the desktop one the nav and Theme and Text Size, the wide one the reading tab. */
const WIDTHS = [
  PHONE_VIEWPORT.width,
  DESKTOP_VIEWPORT.width,
  TAB_WIDTH,
] as const;

/** Each region's link destinations in document order, hidden menu copies included. */
const linkOrder = (page: Page): Promise<Record<string, string[]>> =>
  page.locator(REPEATED_LINKS).evaluateAll((links) => {
    const regions: Record<string, string[]> = {};
    for (const link of links) {
      const region =
        link.parentElement === document.body
          ? 'body'
          : (link.closest('body > *')?.localName ?? 'body');
      (regions[region] ??= []).push(link.getAttribute('href') ?? '');
    }
    return regions;
  });

/** `ours` kept to the entries `theirs` also has, so added or dropped links do not count. */
const shared = (ours: readonly string[], theirs: readonly string[]): string[] =>
  ours.filter((href) => theirs.includes(href));

/*
 * What a control does, so two controls compare only when they do the same thing:
 * a link by region and destination, a button by what it opens or marks, and a
 * popover button also by the groups inside, since Theme drops Text Size on a deck.
 */
const roleOf = (control: Element): string => {
  const landmark = control.closest(
    'nav[aria-label], aside, header, footer, [data-reading-tab]',
  );
  const region =
    landmark?.getAttribute('aria-label') ?? landmark?.localName ?? 'body';
  if (control instanceof HTMLAnchorElement)
    return `${region} link ${control.getAttribute('href')}`;
  const opens = control.getAttribute('popovertarget');
  if (opens) {
    const groups = [
      ...(document
        .getElementById(opens)
        ?.querySelectorAll('fieldset, [role="group"]') ?? []),
    ];
    return `${region} button opening #${opens} with ${groups.length} groups`;
  }
  const controls = control.getAttribute('aria-controls');
  if (controls) return `${region} button controlling #${controls}`;
  return `${region} button ${Object.keys((control as HTMLElement).dataset)
    .sort()
    .join(' ')}`;
};

const NAME = /^- [\w-]+(?: "((?:[^"\\]|\\.)*)")?/;

/** Each repeated control's accessible name, as Playwright's accessibility snapshot computes it. */
const controlNames = async (page: Page): Promise<Map<string, string>> => {
  const names = new Map<string, string>();
  for (const control of await page.locator(REPEATED_CONTROLS).all()) {
    const role = await control.evaluate(roleOf);
    let key = role;
    for (let n = 2; names.has(key); n += 1) key = `${role} #${n}`;
    names.set(key, NAME.exec(await control.ariaSnapshot())?.[1] ?? '');
  }
  return names;
};

const homeNames = async (
  browser: Browser,
  width: number,
): Promise<Map<string, string>> => {
  const page = await browser.newPage({
    viewport: { width, height: DESKTOP_VIEWPORT.height },
  });
  await gotoSettled(page, HOME_HREF);
  const names = await controlNames(page);
  await page.close();
  return names;
};

test.describe('SC 3.2.3: repeated links keep the homepage order', () => {
  let home: Record<string, string[]>;

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    await page.goto(HOME_HREF);
    home = await linkOrder(page);
    await page.close();
  });

  for (const route of ROUTES) {
    test(
      `${route} lists its skip, band, header and footer links in the homepage order`,
      ENGINE_INVARIANT,
      async ({ page }) => {
        await page.goto(route);
        const ours = await linkOrder(page);
        expect(
          Object.keys(ours),
          `${route} lacks a region the homepage has`,
        ).toEqual(Object.keys(home));
        for (const [region, hrefs] of Object.entries(ours)) {
          const theirs = home[region] ?? [];
          expect(
            shared(hrefs, theirs),
            `${route} orders its ${region} links unlike the homepage`,
          ).toEqual(shared(theirs, hrefs));
        }
      },
    );
  }
});

for (const width of WIDTHS) {
  test.describe(`SC 3.2.4: repeated controls keep the homepage names at ${width}px`, () => {
    test.use({ viewport: { width, height: DESKTOP_VIEWPORT.height } });
    let home: Map<string, string>;

    test.beforeAll(async ({ browser }) => {
      home = await homeNames(browser, width);
    });

    for (const route of ROUTES) {
      test(`${route} names each repeated link and control as the homepage does`, async ({
        page,
      }) => {
        await gotoSettled(page, route);
        const repeated = [...(await controlNames(page))].filter(([role]) =>
          home.has(role),
        );
        expect(
          repeated.length,
          `${route} repeats no control the homepage has`,
        ).toBeGreaterThan(0);
        const renamed = repeated
          .filter(([role, name]) => home.get(role) !== name)
          .map(
            ([role, name]) =>
              `${role}: "${name}", homepage "${home.get(role)}"`,
          );
        expect(
          renamed,
          `${route} names a repeated control unlike the homepage`,
        ).toEqual([]);
      });
    }
  });
}
