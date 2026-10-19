import { expect, test } from './test';
import { builtHtml, POST_ROUTES, TALK_ROUTES } from './routes';
import { CTA, NAV_LINKS } from '../src/lib/nav';
import { NODE } from './tags';
import { DESKTOP_VIEWPORT, NARROW_WIDTH, PHONE_VIEWPORT } from './wcag';

/**
 * A <dialog> is display:none until showModal() runs, so below `md` with
 * scripting off the mobile menu is unusable. `@media (scripting: none)` shows
 * `.noscript-nav` instead. `javaScriptEnabled` is a context option, hence a context per test.
 */

/** Narrowest viewport measured, where the primary nav is hidden. */
const MOBILE = { width: NARROW_WIDTH, height: 800 };

/** `md` and `lg`: below `md` the header shows no action brick without JavaScript. */
const MD_WIDTH = 768;
const LG_WIDTH = 1024;

/** A width where the primary nav is visible, so the fallback can collide with it. */
const DESKTOP = DESKTOP_VIEWPORT;

/** Below `md`: narrowest, a common phone, and the last pixel before `md`. */
const FALLBACK_WIDTHS = [NARROW_WIDTH, PHONE_VIEWPORT.width, 767] as const;

/*
 * One route per layout the fallback renders in: the home page, the error page,
 * and a post and a talk when there are any. The build check below holds every
 * other page to the markup.
 */
const LAYOUT_ROUTES = ['/', '/404', POST_ROUTES[0], TALK_ROUTES[0]].filter(
  (route) => route !== undefined,
);

test(
  'every built page carries the fallback nav with every destination',
  NODE,
  () => {
    const pages = [...builtHtml()];
    expect(pages.length, 'no built pages').toBeGreaterThan(0);
    const missing = pages.flatMap(([route, html]) => {
      const nav = /<nav\b[^>]*\bnoscript-nav\b[\s\S]*?<\/nav>/.exec(html)?.[0];
      if (!nav) return [`${route}: no nav.noscript-nav`];
      return [...NAV_LINKS, CTA]
        .filter(({ href }) => !nav.includes(`href="${href}"`))
        .map(({ href }) => `${route}: no link to ${href}`);
    });
    expect(missing).toEqual([]);
  },
);

test.describe('navigation without JavaScript', () => {
  for (const route of LAYOUT_ROUTES) {
    test(`${route} is navigable without JavaScript`, async ({ browser }) => {
      const context = await browser.newContext({
        javaScriptEnabled: false,
        viewport: MOBILE,
      });

      try {
        const page = await context.newPage();
        await page.goto(route);

        // `toBeVisible`, not presence: the links are also in the closed <dialog>.
        const fallback = page.locator('nav.noscript-nav');
        await expect(
          fallback,
          `${route} renders no visible fallback nav with scripting off.`,
        ).toBeVisible();

        for (const { label } of [...NAV_LINKS, CTA]) {
          await expect(
            fallback.getByRole('link', { name: label, exact: true }),
            `${route} cannot reach ${label} without JavaScript`,
          ).toBeVisible();
        }
      } finally {
        await context.close();
      }
    });
  }

  test('the dead trigger is hidden rather than left inert', async ({
    browser,
  }) => {
    const context = await browser.newContext({
      javaScriptEnabled: false,
      viewport: MOBILE,
    });

    try {
      const page = await context.newPage();
      await page.goto('/');

      // An inert trigger announces aria-expanded="false" for a menu that cannot open.
      // Present first, so a renamed class cannot make "hidden" pass on nothing.
      await expect(page.locator('.mobile-menu')).toHaveCount(1);
      await expect(
        page.locator('.mobile-menu'),
        'The menu trigger is visible with scripting off, where it cannot open anything.',
      ).toBeHidden();
    } finally {
      await context.close();
    }
  });

  for (const width of [MD_WIDTH, LG_WIDTH, DESKTOP.width]) {
    test(`the header actions at ${width}px have one edge between bricks`, async ({
      browser,
    }) => {
      const context = await browser.newContext({
        javaScriptEnabled: false,
        viewport: { width, height: DESKTOP.height },
      });

      try {
        const page = await context.newPage();
        await page.goto('/');

        // SC 1.4.11: a hidden theme switch must not leave the first brick open on its left.
        const edges = await page
          .locator('header .header-bricks:has(.theme-switch)')
          .evaluate((row) =>
            [...row.children]
              .map((child) =>
                child.matches('a, button')
                  ? child
                  : child.querySelector(':scope > :is(a, button)'),
              )
              .filter(
                (brick): brick is Element =>
                  !!brick && brick.getBoundingClientRect().width > 0,
              )
              .map((brick) => {
                const style = getComputedStyle(brick);
                return {
                  left: style.borderLeftWidth,
                  right: style.borderRightWidth,
                };
              }),
          );
        expect(
          edges.length,
          'No visible header action bricks.',
        ).toBeGreaterThan(0);
        const [first, ...rest] = edges;
        expect(first.left, 'The first visible brick has no left edge.').toBe(
          first.right,
        );
        for (const brick of rest) {
          expect(brick.left, 'A following brick doubles the shared edge.').toBe(
            '0px',
          );
        }
      } finally {
        await context.close();
      }
    });
  }

  test('the fallback does not duplicate the primary nav above the breakpoint', async ({
    browser,
  }) => {
    const context = await browser.newContext({
      javaScriptEnabled: false,
      viewport: DESKTOP,
    });

    try {
      const page = await context.newPage();
      await page.goto('/');

      /*
       * Two visible navs named "Primary" fail landmark-unique (SC 1.3.1).
       * Page-wide, not `header nav`: the fallback renders after the header.
       */
      await expect(
        page.locator('nav[aria-label="Primary"]:visible'),
        'More than one visible navigation named "Primary" with scripting off.',
      ).toHaveCount(1);

      await expect(
        page.locator('nav.noscript-nav'),
        'The fallback is visible above the breakpoint instead of the primary nav.',
      ).toBeHidden();
    } finally {
      await context.close();
    }
  });

  /*
   * `toBeVisible` passes for a link above the document or pinned inside the
   * sticky header, so compare each link's top with the header's bottom at scrollY 0.
   */
  for (const width of FALLBACK_WIDTHS) {
    test(`every fallback link starts below the header at ${width}px`, async ({
      browser,
    }) => {
      const context = await browser.newContext({
        javaScriptEnabled: false,
        viewport: { width, height: MOBILE.height },
      });

      try {
        const page = await context.newPage();
        await page.goto('/');

        const measured = await page.evaluate(() => {
          const header = document.querySelector('header');
          const nav = document.querySelector('nav.noscript-nav');
          if (!header || !nav) return null;
          return {
            scrollY: window.scrollY,
            headerBottom: header.getBoundingClientRect().bottom,
            links: [...nav.querySelectorAll('a')].map((link) => ({
              name: link.textContent?.trim() ?? '',
              top: link.getBoundingClientRect().top,
            })),
          };
        });

        expect(
          measured,
          'no header or no fallback nav with scripting off',
        ).not.toBeNull();
        expect(measured!.scrollY).toBe(0);
        expect(
          measured!.links.length,
          'the fallback nav has no links, so nothing below measured anything',
        ).toBeGreaterThan(0);

        for (const link of measured!.links) {
          expect(
            Math.round(link.top),
            `"${link.name}" starts at ${Math.round(link.top)}px, above the ` +
              `header's bottom edge at ${Math.round(measured!.headerBottom)}px at ${width}px.`,
          ).toBeGreaterThanOrEqual(Math.round(measured!.headerBottom));
        }
      } finally {
        await context.close();
      }
    });
  }

  test('the fallback is hidden from a scripted browser', async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await page.goto('/');

    // At 305px with scripting on, the header nav is hidden and the dialog's nav is unnamed.
    await expect(
      page.locator('nav.noscript-nav'),
      'The fallback nav is on screen with JavaScript enabled.',
    ).toBeHidden();

    await expect(
      page.getByRole('navigation', { name: 'Primary', exact: true }),
      'A navigation named "Primary" is exposed at 305px with JavaScript enabled.',
    ).toHaveCount(0);
  });
});

/* A11Y.md "Content Held Hostage by JavaScript": the cats are drawn by a script, their words are not. */
test.describe('the About cats without JavaScript', () => {
  const NAMES = ['Minerva', 'Hela', 'Rudra'];

  test('each cat is named in text', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    try {
      const page = await context.newPage();
      await page.goto('/about/');
      const list = page.locator('.cats-noscript');
      await expect(
        list,
        'the cats text is not shown without JavaScript',
      ).toBeVisible();
      for (const name of NAMES) {
        await expect(list.getByText(`${name}.`, { exact: true })).toBeVisible();
      }
    } finally {
      await context.close();
    }
  });

  test('the cats text is hidden when the cats are drawn', async ({ page }) => {
    await page.goto('/about/');
    await expect(page.locator('.cats-noscript')).toBeHidden();
  });
});
