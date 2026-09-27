import { expect, test, type Page } from './test';
import { timedScan } from './axe';
import { expectIncompleteDecided } from './incomplete';
import { NON_TEXT, PAGE_HELPERS } from './contrast';
import { gotoSettled } from './settle';
import { ROUTES, SAMPLED_ROUTES } from './routes';
import { AXE_TIMEOUT_MS, FOCUSABLE_SELECTOR, REFLOW_VIEWPORT } from './wcag';

const SWITCH_NAME = 'Light mode';
/** More than the header's stops before the switch, so a missing switch fails. */
const MAX_TABS = 12;

/** Light: the ground has more contrast with black than with white. */
const mainIsLight = (page: Page): Promise<boolean> =>
  page.evaluate(`(() => {
    ${PAGE_HELPERS}
    const ground = effectiveBackground(document.querySelector('main'));
    const black = { r: 0, g: 0, b: 0, a: 1 };
    const white = { r: 255, g: 255, b: 255, a: 1 };
    return ratio(ground, black) > ratio(ground, white);
  })()`) as Promise<boolean>;

test.describe('light mode meets WCAG 2.2 AA on every route', () => {
  test.use({ colorScheme: 'light' });
  test.describe.configure({ timeout: AXE_TIMEOUT_MS });

  for (const route of ROUTES) {
    test(route, async ({ page }) => {
      await gotoSettled(page, route);
      expect(
        await mainIsLight(page),
        'a device set to light should open the light page',
      ).toBe(true);

      const results = await timedScan(page, `${route} in light mode`);
      expect
        .soft(
          results.violations.map(
            (v) =>
              `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`,
          ),
        )
        .toEqual([]);
      await expectIncompleteDecided(page, `${route} in light mode`, results);
    });
  }
});

test.describe('light mode meets WCAG 2.2 AA at 320px', () => {
  test.use({ colorScheme: 'light', viewport: REFLOW_VIEWPORT });
  test.describe.configure({ timeout: AXE_TIMEOUT_MS });

  for (const route of ROUTES) {
    test(route, async ({ page }) => {
      await gotoSettled(page, route);
      const results = await timedScan(page, `${route} in light mode at 320px`);
      expect.soft(results.violations.map((v) => v.id)).toEqual([]);
      await expectIncompleteDecided(
        page,
        `${route} in light at 320px`,
        results,
      );
    });
  }
});

// SC 1.4.11, which axe does not check: a control drawn as a shape keeps one edge
// at 3:1 against its ground. A control showing a photo is identified by it and skipped.
test.describe('light mode keeps every control edge visible', () => {
  test.use({ colorScheme: 'light' });

  for (const route of SAMPLED_ROUTES) {
    test(route, async ({ page }) => {
      await gotoSettled(page, route);
      const { shaped, faint } = (await page.evaluate(`(() => {
        ${PAGE_HELPERS}
        let shaped = 0;
        const faint = [];
        for (const el of document.querySelectorAll('main :is(${FOCUSABLE_SELECTOR.replaceAll("'", "\\'")})')) {
          const style = getComputedStyle(el);
          if (style.display === 'none' || el.getBoundingClientRect().width === 0) continue;
          // A photo link is identified by its photo, which the fill only backs.
          if (el.querySelector('img')) continue;
          const ground = effectiveBackground(el.parentElement);
          if (!ground) {
            faint.push(describe(el) + ' on a ground that cannot be read');
            continue;
          }
          const fill = parse(style.backgroundColor);
          const edges = ['Top', 'Right', 'Bottom', 'Left']
            .filter((side) => parseFloat(style['border' + side + 'Width']) > 0)
            .map((side) => parse(style['border' + side + 'Color']))
            .filter((c) => c && c.a > 0);
          const hasFill = fill && fill.a > 0;
          if (!hasFill && edges.length === 0) continue;
          shaped += 1;
          const ratios = [
            ...(hasFill ? [ratio(over(fill, ground), ground)] : []),
            ...edges.map((c) => ratio(over(c, ground), ground)),
          ];
          if (Math.max(...ratios) < ${NON_TEXT}) {
            faint.push(describe(el) + ' best edge ' + Math.max(...ratios).toFixed(2));
          }
        }
        return { shaped, faint };
      })()`)) as { shaped: number; faint: string[] };
      // The home page always has shaped controls; a prose page may have none.
      if (route === '/')
        expect(shaped, 'no shaped control found on /').toBeGreaterThan(0);
      test.skip(shaped === 0, `${route} draws no control as a shape`);
      expect(faint, `${route} in light mode`).toEqual([]);
    });
  }
});

test.describe('the switch', () => {
  test('follows a dark device until pressed, then remembers', async ({
    page,
  }) => {
    await gotoSettled(page, '/about');
    const toggle = page.getByRole('button', { name: SWITCH_NAME });

    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    expect(await mainIsLight(page)).toBe(false);

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(await mainIsLight(page)).toBe(true);

    await gotoSettled(page, '/career');
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(await mainIsLight(page)).toBe(true);
  });

  test('a stored choice beats the device', async ({ browser }) => {
    const context = await browser.newContext({ colorScheme: 'light' });
    await context.addInitScript(() => localStorage.setItem('theme', 'dark'));
    const page = await context.newPage();

    await gotoSettled(page, '/about');
    await expect(
      page.getByRole('button', { name: SWITCH_NAME }),
    ).toHaveAttribute('aria-pressed', 'false');
    expect(await mainIsLight(page)).toBe(false);
    await context.close();
  });

  test('keyboard focus rings the tile', async ({ page }) => {
    await gotoSettled(page, '/about');
    const toggle = page.getByRole('button', { name: SWITCH_NAME });

    for (let tab = 0; tab < MAX_TABS; tab++) {
      if (await toggle.evaluate((el) => el === document.activeElement)) break;
      await page.keyboard.press('Tab');
    }
    await expect(toggle).toBeFocused();

    const ring = (await page.evaluate(`(() => {
      ${PAGE_HELPERS}
      const tile = document.activeElement;
      const style = getComputedStyle(tile);
      if (style.outlineStyle === 'none' || parseFloat(style.outlineWidth) === 0) return 0;
      const ground = effectiveBackground(tile.parentElement);
      return ground ? ratio(over(parse(style.outlineColor), ground), ground) : 0;
    })()`)) as number;
    expect(
      ring,
      'the focus ring on the tile is missing or under 3:1 (SC 2.4.7, 1.4.11).',
    ).toBeGreaterThanOrEqual(NON_TEXT);

    await page.keyboard.press('Space');
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  });
});

/* Without JavaScript nothing can apply a choice, so no switch is offered. */
test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false, colorScheme: 'light' });

  test('the page is dark and the switch is not offered', async ({ page }) => {
    await page.goto('/about');
    await expect(page.locator('.theme-switch')).toBeHidden();
    expect(await mainIsLight(page)).toBe(false);
  });
});
