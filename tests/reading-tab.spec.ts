import { readFileSync } from 'node:fs';
import { expect, test, type Page } from './test';
import { gotoSettled } from './settle';
import { serveUnderShippedCsp } from './csp';
import { SITE_NAME } from '../src/lib/site';
import { NODE } from './tags';
import { timedScan } from './axe';
import { TEXT_SCALE_KEY, TEXT_SCALE_STEPS } from '../src/lib/text-scale';

const WIDE_ROUTES = ['/', '/about/', '/blog/', '/credits/', '/career/'];
/** From 86rem the page leaves a free gutter and the control is the edge tab (the `tab` variant in global.css). */
const TAB_WIDTH = 1376;
const TAB_WIDTHS = [TAB_WIDTH, 1440, 1920];
const BELOW_TAB_WIDTHS = [1375, 1280, 1024, 768, 390, 320];
const SCRIPTS = ['src/scripts/text-size.ts'];

/** The requested scale as the root holds it: '' (100%), '1.25' ... '2'. */
const rootSize = (page: Page) =>
  page.evaluate(() =>
    document.documentElement.style.getPropertyValue('--text-scale'),
  );

/** The first body paragraph's size in px: the size --text-scale multiplies. */
const bodyPx = (page: Page) =>
  page.evaluate(() =>
    parseFloat(
      getComputedStyle(document.querySelector('main .text-body')!).fontSize,
    ),
  );

const tab = (page: Page) => page.locator('[data-reading-tab]');
const panel = (page: Page) => page.locator('#reading-tab-panel');
const openTab = async (page: Page) => {
  await tab(page).locator('.reading-tab-button').click();
  await expect(
    tab(page).getByRole('button', { name: /Smaller/ }),
  ).toBeVisible();
};

const sidewaysPx = (page: Page) =>
  page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );

test.describe('The reading tab: Smaller, Larger and Reset', () => {
  test('without a script the reading tab is not drawn', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto('/about/');
    await expect(
      page.locator('[data-reading-tab]'),
      'the reading tab shows without a script',
    ).toBeHidden();
    await context.close();
  });

  test('a slide deck has no reading tab, to keep its script budget', async ({
    page,
  }) => {
    await gotoSettled(page, '/talks/sample-talk/');
    await expect(page.locator('[data-text-size]')).toHaveCount(0);
    await expect(page.locator('[data-on-demand]')).toHaveCount(0);
  });

  test('Smaller and Larger step the text size, stop at the ends and say so, and the size is remembered', async ({
    page,
  }) => {
    await page.setViewportSize({ width: TAB_WIDTH, height: 900 });
    await gotoSettled(page, '/about/');
    const base = await bodyPx(page);
    const group = tab(page);
    await openTab(page);
    const status = group.locator('[data-size-status]');
    const drink = group.getByRole('button', { name: /^Smaller/ });
    const eat = group.getByRole('button', { name: /^Larger/ });
    const right = group.getByRole('button', { name: /^Reset/ });
    await expect(right).toBeVisible();
    for (const size of TEXT_SCALE_STEPS.filter((step) => step > 100)) {
      await eat.click();
      await expect(status).toHaveText(`Text is ${size}%.`);
      await expect.poll(() => rootSize(page)).toBe(String(size / 100));
      expect(await bodyPx(page)).toBeCloseTo((size / 100) * base, 1);
    }
    await expect(eat).toHaveAttribute('aria-disabled', 'true');
    await eat.click({ force: true });
    await expect(status).toContainText('already the largest');
    expect(await rootSize(page), 'Larger went past the top step').toBe('2');
    await page.reload();
    expect(await rootSize(page), 'the size was not remembered').toBe('2');
    await openTab(page);
    await right.click();
    await expect.poll(() => rootSize(page)).toBe('');
    expect(await bodyPx(page)).toBeCloseTo(base, 1);
    await expect(right).toHaveAttribute('aria-disabled', 'true');
    for (let i = 0; i < 3; i += 1) await drink.click({ force: true });
    await expect(status).toContainText('already the smallest');
    expect(await rootSize(page), 'Smaller went below the lowest step').toBe(
      '0.75',
    );
    await expect(drink).toHaveAttribute('aria-disabled', 'true');
    await page.evaluate((key) => localStorage.removeItem(key), TEXT_SCALE_KEY);
  });

  for (const width of [320, 390, 1280]) {
    for (const saved of [75, 200]) {
      test(`a saved ${saved}% leaves nothing scrolling sideways at ${width}px (SC 1.4.4, 1.4.10)`, async ({
        page,
      }) => {
        await page.addInitScript(
          ({ key, value }) => localStorage.setItem(key, value),
          { key: TEXT_SCALE_KEY, value: String(saved) },
        );
        await page.setViewportSize({ width, height: 800 });
        for (const route of WIDE_ROUTES) {
          await gotoSettled(page, route);
          expect(Number((await rootSize(page)) || 1)).toBeLessThanOrEqual(
            saved / 100,
          );
          const over = await sidewaysPx(page);
          expect(
            over,
            `${route} scrolls sideways by ${over}px`,
          ).toBeLessThanOrEqual(0);
        }
      });
    }
  }

  test('a size the page cannot hold is taken back and Larger says so', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await gotoSettled(page, '/credits/');
    await page.getByRole('button', { name: 'Aa Text Size' }).click();
    const group = page.locator('#text-menu');
    const eat = group.getByRole('button', { name: /^Larger/ });
    for (let i = 0; i < TEXT_SCALE_STEPS.length; i += 1) {
      await eat.click({ force: true });
    }
    await expect(group.locator('[data-size-status]')).toContainText(
      'the most this page fits',
    );
    await expect(eat).toHaveAttribute('aria-disabled', 'true');
    expect(await sidewaysPx(page)).toBeLessThanOrEqual(0);
    await page.evaluate((key) => localStorage.removeItem(key), TEXT_SCALE_KEY);
  });

  for (const [width, how] of [
    [390, 'the Aa popover'],
    [1024, 'the theme popover'],
  ] as const) {
    test(`below the tab width the control is in ${how}, with the same three buttons at ${width}px (SC 2.5.5)`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 800 });
      await gotoSettled(page, '/about/');
      await expect(
        tab(page),
        'the edge tab shows below its width',
      ).toBeHidden();
      await page
        .getByRole('button', { name: width < 768 ? 'Aa Text Size' : 'Theme' })
        .click();
      const group = page
        .getByRole('group', { name: 'Text Size' })
        .locator('visible=true');
      await expect(group).toHaveCount(1);
      const buttons = group.getByRole('button');
      await expect(buttons).toHaveCount(3);
      await expect(buttons.nth(0)).toHaveAccessibleName('Smaller');
      await expect(buttons.nth(1)).toHaveAccessibleName('Larger');
      await expect(buttons.nth(2)).toHaveAccessibleName('Reset');
      for (const box of await Promise.all(
        (await buttons.all()).map((b) => b.boundingBox()),
      )) {
        expect(Math.min(box!.width, box!.height)).toBeGreaterThanOrEqual(44);
      }
      await buttons.nth(1).click();
      await expect(group.locator('[data-size-status]')).toHaveText(
        'Text is 125%.',
      );
      await expect.poll(() => rootSize(page)).toBe('1.25');
    });
  }

  test('the edge tab covers no link, button or text at rest where it shows, and not at all below (SC 1.4.10, 2.4.11)', async ({
    page,
  }) => {
    for (const width of BELOW_TAB_WIDTHS) {
      await page.setViewportSize({ width, height: 800 });
      await gotoSettled(page, '/about/');
      await expect(tab(page), `the tab shows at ${width}px`).toBeHidden();
    }
    for (const width of TAB_WIDTHS) {
      await page.setViewportSize({ width, height: 800 });
      for (const route of [...WIDE_ROUTES, '/brand/', '/blog/sample-post/']) {
        await gotoSettled(page, route);
        const covered = await page.evaluate(() => {
          const t = document
            .querySelector('[data-reading-tab]')!
            .getBoundingClientRect();
          const meets = (r: DOMRect) =>
            r.width > 0 &&
            r.height > 0 &&
            r.left < t.right &&
            r.right > t.left &&
            r.top < t.bottom &&
            r.bottom > t.top;
          const found: string[] = [];
          for (const el of document.querySelectorAll(
            'a, button, input, select',
          )) {
            if (
              !el.closest('[data-reading-tab]') &&
              meets(el.getBoundingClientRect())
            ) {
              found.push(`control "${el.textContent?.trim().slice(0, 25)}"`);
            }
          }
          const walker = document.createTreeWalker(
            document.body,
            NodeFilter.SHOW_TEXT,
          );
          for (let node = walker.nextNode(); node; node = walker.nextNode()) {
            if (
              !node.textContent?.trim() ||
              node.parentElement?.closest(
                '[data-reading-tab], script, style, [hidden]',
              )
            )
              continue;
            const range = document.createRange();
            range.selectNodeContents(node);
            if ([...range.getClientRects()].some(meets))
              found.push(`text "${node.textContent.trim().slice(0, 25)}"`);
          }
          return found;
        });
        expect(
          covered,
          `${route} at ${width}px: the tab covers these at rest`,
        ).toEqual([]);
      }
    }
  });

  test('the reading tab is a popover with a named button, three named buttons and 44px targets (SC 2.5.3, 2.5.5, 4.1.2)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: TAB_WIDTH, height: 800 });
    await gotoSettled(page, '/about/');
    const button = tab(page).locator('.reading-tab-button');
    await expect(button).toHaveAccessibleName('Aa Text Size');
    await openTab(page);
    await expect(button).toHaveAttribute('aria-expanded', 'true');
    const buttons = panel(page).getByRole('button');
    await expect(buttons).toHaveCount(3);
    await expect(buttons.nth(0)).toHaveAccessibleName('Smaller');
    await expect(buttons.nth(0)).toHaveAccessibleDescription('Smaller text');
    await expect(buttons.nth(1)).toHaveAccessibleName('Larger');
    await expect(buttons.nth(1)).toHaveAccessibleDescription('Larger text');
    await expect(buttons.nth(2)).toHaveAccessibleName('Reset');
    await expect(buttons.nth(2)).toHaveAccessibleDescription(
      'Back to 100 percent',
    );
    for (const box of await Promise.all([
      button.boundingBox(),
      ...(await buttons.all()).map((b) => b.boundingBox()),
    ])) {
      expect(Math.min(box!.width, box!.height)).toBeGreaterThanOrEqual(44);
    }
    await expect(
      tab(page).getByRole('group', { name: 'Text Size' }),
    ).toBeVisible();
  });

  test('the keyboard opens the reading tab and Escape closes it and returns focus to the button (SC 2.1.1, 2.4.3)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: TAB_WIDTH, height: 800 });
    await gotoSettled(page, '/about/');
    const button = tab(page).locator('.reading-tab-button');
    await button.focus();
    await page.keyboard.press('Enter');
    await expect(panel(page)).toBeVisible();
    await page.keyboard.press('Tab');
    await expect(
      tab(page).getByRole('button', { name: /^Smaller/ }),
    ).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(panel(page)).toBeHidden();
    await expect(button).toBeFocused();
  });

  test('a press outside the reading tab closes it and leaves focus where the press put it (SC 2.4.3)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: TAB_WIDTH, height: 800 });
    await gotoSettled(page, '/about/');
    await openTab(page);
    await page.mouse.click(40, 400);
    await expect(panel(page)).toBeHidden();
    await expect(tab(page).locator('.reading-tab-button')).not.toBeFocused();
  });

  test('a press outside closes the tab while its script is still loading', async ({
    page,
  }) => {
    const SLOW_MS = 1500;
    await page.route(/text-size-[\w-]+\.js/, async (route) => {
      await new Promise((done) => setTimeout(done, SLOW_MS));
      await route.continue();
    });
    await page.setViewportSize({ width: TAB_WIDTH, height: 800 });
    await gotoSettled(page, '/about/');
    await tab(page).locator('.reading-tab-button').click();
    await expect(panel(page)).toBeVisible();
    await page.mouse.click(40, 400);
    await expect(panel(page)).toBeHidden({ timeout: 500 });
  });

  test('Tab past the last button closes the reading tab (SC 2.4.11)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: TAB_WIDTH, height: 800 });
    await gotoSettled(page, '/about/');
    await openTab(page);
    await page.keyboard.press('Escape');
    await expect(panel(page)).toBeHidden();
    await openTab(page);
    const last = tab(page).getByRole('button', { name: /^Reset/ });
    await last.focus();
    await page.keyboard.press('Tab');
    await expect(panel(page)).toBeHidden();
    await expect(last).toBeHidden();
  });

  test('the Theme menu group closes on an outside press, Escape and Tab out', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1024, height: 800 });
    await gotoSettled(page, '/about/');
    const theme = page.getByRole('button', { name: 'Theme' });
    const menu = page.locator('#theme-menu');
    await theme.click();
    await expect(menu).toBeVisible();
    await page.mouse.click(10, 600);
    await expect(menu).toBeHidden();
    await theme.click();
    await expect(menu).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    await theme.click();
    /* The menu's toggle event moves focus to the chosen radio; wait for it, or it lands after the Tab. */
    await expect(menu.locator('input:checked')).toBeFocused();
    await menu.getByRole('button', { name: /^Reset/ }).focus();
    await page.keyboard.press('Tab');
    await expect(menu).toBeHidden();
  });

  test('the header holds still when the registry runs: the Aa brick is drawn from first paint (CLS)', async ({
    browser,
  }) => {
    const measure = async (blockRegistry: boolean) => {
      const context = await browser.newContext({
        viewport: { width: 390, height: 800 },
      });
      const page = await context.newPage();
      if (blockRegistry)
        await page.route(/on-demand-[\w-]+\.js/, (route) => route.abort());
      await gotoSettled(page, '/about/');
      const box = await page.locator('header div.header-bricks').boundingBox();
      await context.close();
      return box;
    };
    expect(await measure(false)).toEqual(await measure(true));
  });

  test('the Aa popover closes on an outside press, Escape and Tab out', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await gotoSettled(page, '/about/');
    const aa = page.getByRole('button', { name: 'Aa Text Size' });
    const popover = page.locator('#text-menu');
    await aa.click();
    await expect(popover).toBeVisible();
    await page.mouse.click(20, 700);
    await expect(popover).toBeHidden();
    await aa.click();
    await expect(popover).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(popover).toBeHidden();
    await expect(aa).toBeFocused();
    await aa.click();
    await expect(popover).toBeVisible();
    await popover.getByRole('button', { name: /^Reset/ }).focus();
    await page.keyboard.press('Tab');
    await expect(popover).toBeHidden();
  });

  test('on a phone the header holds the logo tile, Theme, Aa and Menu without overlap, each 44px, and the link keeps its name (SC 2.5.5, 2.5.3, 4.1.2)', async ({
    page,
  }) => {
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 800 });
      await gotoSettled(page, '/about/');
      await expect(
        page.locator('header .logo-link'),
        `the logo link loses its name at ${width}px`,
      ).toHaveAccessibleName(SITE_NAME);
      const boxes = await page
        .locator(
          'header .logo-tile, header .theme-switch:visible, header .menu-brick',
        )
        .evaluateAll((els) =>
          els.map((el) => {
            const r = el.getBoundingClientRect();
            return { left: r.left, right: r.right, w: r.width, h: r.height };
          }),
        );
      expect(boxes).toHaveLength(4);
      const sorted = [...boxes].sort((a, b) => a.left - b.left);
      for (const [i, box] of sorted.entries()) {
        const previous = sorted[i - 1];
        if (previous === undefined) continue;
        expect(
          box.left,
          `controls overlap at ${width}px`,
        ).toBeGreaterThanOrEqual(previous.right - 0.5);
      }
      for (const box of boxes.slice(1)) {
        expect(Math.min(box.w, box.h)).toBeGreaterThanOrEqual(44);
      }
      expect(await sidewaysPx(page)).toBeLessThanOrEqual(0);
    }
  });

  const OPEN_STATES = [
    {
      name: 'the edge tab',
      width: TAB_WIDTH,
      open: async (page: Page) => openTab(page),
      scope: (page: Page) => tab(page),
    },
    {
      name: 'the Theme menu',
      width: 1024,
      open: async (page: Page) => {
        await page.getByRole('button', { name: 'Theme' }).click();
      },
      scope: (page: Page) => page.locator('#theme-menu'),
    },
    {
      name: 'the Aa popover',
      width: 390,
      open: async (page: Page) => {
        await page.getByRole('button', { name: 'Aa Text Size' }).click();
      },
      scope: (page: Page) => page.locator('#text-menu'),
    },
  ];

  for (const state of OPEN_STATES) {
    test(`${state.name} open: axe finds nothing and the buttons are named (WCAG 2.2 AA)`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: state.width, height: 800 });
      await gotoSettled(page, '/about/');
      await state.open(page);
      const group = state.scope(page).getByRole('group', { name: 'Text Size' });
      await expect(group).toBeVisible();
      await expect(group.getByRole('button')).toHaveCount(3);
      const results = await timedScan(page, `${state.name} open`);
      expect(
        results.violations.map((v) => `${v.id}: ${v.nodes[0]?.target}`),
        `${state.name} open has axe violations`,
      ).toEqual([]);
    });

    test(`${state.name} open in forced colors: every button keeps a visible boundary (SC 1.4.11)`, async ({
      page,
    }) => {
      await page.emulateMedia({ forcedColors: 'active' });
      await page.setViewportSize({ width: state.width, height: 800 });
      await gotoSettled(page, '/about/');
      await state.open(page);
      const buttons = state
        .scope(page)
        .getByRole('group', { name: 'Text Size' })
        .getByRole('button');
      for (const button of await buttons.all()) {
        const edge = await button.evaluate((el) => {
          const style = getComputedStyle(el);
          return {
            width: parseFloat(style.borderTopWidth),
            style: style.borderTopStyle,
          };
        });
        expect(
          edge.width,
          'a forced-colors button needs a border',
        ).toBeGreaterThan(0);
        expect(edge.style).not.toBe('none');
      }
    });
  }

  test('reduced motion: the tab neither animates nor transitions', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: TAB_WIDTH, height: 800 });
    await gotoSettled(page, '/about/');
    await openTab(page);
    const longest = await tab(page).evaluate((el) =>
      Math.max(
        ...[el, ...el.querySelectorAll('*')].flatMap((node) => {
          const style = getComputedStyle(node);
          const seconds = (list: string) =>
            list.split(',').map((part) => parseFloat(part));
          return [
            ...seconds(style.transitionDuration),
            ...seconds(style.animationDuration),
          ];
        }),
      ),
    );
    /* The site's reduced-motion rule leaves 0.00001s, not 0. */
    expect(longest).toBeLessThanOrEqual(0.001);
  });

  test('400% zoom: the group reaches every size without sideways scroll', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 256 });
    await gotoSettled(page, '/about/');
    await page.getByRole('button', { name: 'Aa Text Size' }).click();
    const group = page
      .locator('#text-menu')
      .getByRole('group', { name: 'Text Size' });
    await group.getByRole('button', { name: /^Larger/ }).click();
    await expect(group.getByRole('status')).not.toHaveText('');
    expect(await sidewaysPx(page)).toBeLessThanOrEqual(0);
    for (const button of await group.getByRole('button').all()) {
      await button.scrollIntoViewIfNeeded();
      await expect(button).toBeInViewport();
    }
  });

  test('a control under the tab that takes keyboard focus is never hidden by it (SC 2.4.11, 2.4.12)', async ({
    page,
  }) => {
    for (const width of TAB_WIDTHS) {
      await page.setViewportSize({ width, height: 800 });
      for (const route of WIDE_ROUTES) {
        await gotoSettled(page, route);
        await page.keyboard.press('Tab');
        const hidden = await page.evaluate(() => {
          const tabEl = document.querySelector('[data-reading-tab]')!;
          const meets = (a: DOMRect, b: DOMRect) =>
            a.left < b.right &&
            a.right > b.left &&
            a.top < b.bottom &&
            a.bottom > b.top;
          const under = [
            ...document.querySelectorAll<HTMLElement>('main a, main button'),
          ].filter((el) => {
            const r = el.getBoundingClientRect();
            return r.width > 0 && meets(r, tabEl.getBoundingClientRect());
          });
          const out: string[] = [];
          for (const el of under) {
            el.focus();
            const shown = getComputedStyle(tabEl).visibility !== 'hidden';
            if (
              shown &&
              meets(el.getBoundingClientRect(), tabEl.getBoundingClientRect())
            ) {
              out.push(el.textContent?.trim().slice(0, 30) ?? '');
            }
          }
          return out;
        });
        expect(
          hidden,
          `${route} at ${width}px: the tab covers a focused control`,
        ).toEqual([]);
      }
    }
  });

  test('the reading tab is not printed', async ({ page }) => {
    await page.setViewportSize({ width: TAB_WIDTH, height: 800 });
    await gotoSettled(page, '/about/');
    await page.emulateMedia({ media: 'print' });
    await expect(tab(page)).toBeHidden();
  });

  test(
    'the size multiplies the reading tokens, so browser zoom and font settings still apply',
    NODE,
    () => {
      expect(readFileSync('src/styles/global.css', 'utf8')).toMatch(
        /--text-body: calc\([^;]*\* var\(--text-scale, 1\)\);/,
      );
    },
  );

  test('every feature works under the CSP the site ships, with no violation or script error', async ({
    page,
  }) => {
    const problems = await serveUnderShippedCsp(page);
    await page.setViewportSize({ width: TAB_WIDTH, height: 800 });
    await gotoSettled(page, '/about/');
    await openTab(page);
    await page.getByRole('button', { name: /^Larger/ }).click();
    await expect.poll(() => rootSize(page)).toBe('1.25');
    await page.getByRole('button', { name: /^Smaller/ }).click();
    await page.getByRole('button', { name: /^Smaller/ }).click();
    await expect.poll(() => rootSize(page)).toBe('0.75');
    expect(problems, 'a violation or script error').toEqual([]);
  });

  test(
    'the scripts write no HTML and build no script source (Trusted Types)',
    NODE,
    () => {
      for (const file of SCRIPTS) {
        const source = readFileSync(file, 'utf8');
        expect(source, `${file} writes HTML or loads a script`).not.toMatch(
          /innerHTML|outerHTML|insertAdjacentHTML|document\.write|\.src\s*=|setAttribute\(\s*['"]src['"]|eval\(|new Function/,
        );
      }
    },
  );
});
