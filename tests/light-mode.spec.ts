import { expect, test, type Locator, type Page } from './test';
import { timedScan } from './axe';
import { expectIncompleteDecided } from './incomplete';
import { NON_TEXT, PAGE_HELPERS } from './contrast';
import { hoveredTextBelowAaa, sampleControls, sampled } from './hover-contrast';
import { gotoSettled } from './settle';
import { SAMPLED_ROUTES, ROUTES } from './routes';
import {
  AXE_TIMEOUT_MS,
  DESKTOP_VIEWPORT,
  FOCUSABLE_SELECTOR,
  MIN_TARGET,
  REFLOW_VIEWPORT,
} from './wcag';
import { THEME_CHOICES, THEME_STORAGE_KEY } from '../src/lib/theme';

/** SC 2.4.13's minimum ring thickness. */
const MIN_RING_PX = 2;
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

const RING_MIN = 3;
/* Past this gap the ring meets the page, not the control, so its fill no longer sets the contrast. */
const RING_GAP_PX = 2;

test.describe('light mode reaches AAA contrast under the pointer (SC 1.4.6)', () => {
  test.use({ colorScheme: 'light' });

  for (const route of ROUTES) {
    test(`${route}: hovered text is at least 7:1, large text included`, async ({
      page,
    }) => {
      await gotoSettled(page, route);
      const failures = await hoveredTextBelowAaa(page, 'main');
      expect(
        failures,
        `${route}: hovered text below AAA in light mode`,
      ).toEqual([]);
    });
  }
});

test.describe('light mode focus ring stands out from the page, and from the control it touches (SC 2.4.13)', () => {
  test.use({ colorScheme: 'light' });

  for (const route of ROUTES) {
    test(`${route}: every ring is at least 3:1 against its ground and its control`, async ({
      page,
    }) => {
      await gotoSettled(page, route);
      const failures: string[] = [];
      for (const id of await sampleControls(
        page,
        `main :is(${FOCUSABLE_SELECTOR})`,
      )) {
        const control = page.locator(sampled(id));
        await control.scrollIntoViewIfNeeded();
        /* A key press first, so the next focus is keyboard focus and shows the ring. */
        await page.keyboard.press('Shift');
        await control.focus();
        const found = (await page.evaluate(`(() => {
          ${PAGE_HELPERS}
          const el = document.querySelector('${sampled(id)}');
          const cs = getComputedStyle(el);
          if (cs.outlineStyle === 'none' || parseFloat(cs.outlineWidth) === 0) return [];
          const ring = parse(cs.outlineColor);
          const page = effectiveBackground(el.parentElement);
          const fill = parse(cs.backgroundColor);
          const out = [];
          const name = el.tagName.toLowerCase() + '.' + [...el.classList].slice(0, 3).join('.');
          const toPage = ratio(over(ring, page), page);
          if (toPage < ${RING_MIN}) out.push(name + ' ring on its ground ' + toPage.toFixed(2));
          if (parseFloat(cs.outlineOffset) < ${RING_GAP_PX} && fill && fill.a === 1) {
            const toFill = ratio(over(ring, fill), fill);
            if (toFill < ${RING_MIN}) out.push(name + ' ring on its fill ' + toFill.toFixed(2));
          }
          return out;
        })()`)) as string[];
        failures.push(...found);
      }
      expect(failures, `${route}: a focus ring fades into light mode`).toEqual(
        [],
      );
    });
  }
});

const switchButton = (page: Page) =>
  page.locator('header').getByRole('button', { name: 'Theme', exact: true });
const headerMenu = (page: Page) => page.locator('header .theme-menu');
const radio = (page: Page, value: string) =>
  headerMenu(page).locator(`input[value="${value}"]`);
const stored = (page: Page): Promise<string | null> =>
  page.evaluate((key) => localStorage.getItem(key), THEME_STORAGE_KEY);

const choose = async (page: Page, label: string): Promise<void> => {
  await switchButton(page).click();
  await page
    .getByRole('group', { name: 'Theme' })
    .getByRole('radio', { name: label })
    .check();
};

const tabTo = async (page: Page, target: Locator): Promise<void> => {
  for (let tab = 0; tab < MAX_TABS; tab++) {
    if (await target.evaluate((el) => el === document.activeElement)) return;
    await page.keyboard.press('Tab');
  }
  await expect(target).toBeFocused();
};

test.describe('the theme menu', () => {
  test('a button named Theme opens a Theme group of System, Light and Dark radios', async ({
    page,
  }) => {
    await gotoSettled(page, '/about');
    const button = switchButton(page);
    await expect(button).toHaveAttribute('aria-expanded', 'false');
    await button.click();
    await expect(button).toHaveAttribute('aria-expanded', 'true');
    const group = page.getByRole('group', { name: 'Theme' });
    await expect(group).toBeVisible();
    await expect(group.getByRole('radio')).toHaveCount(THEME_CHOICES.length);
    for (const choice of THEME_CHOICES) {
      await expect(
        group.getByRole('radio', { name: choice.label, exact: true }),
      ).toBeVisible();
    }
    await expect(
      group.getByRole('radio', { name: 'System' }),
      'System is not the default.',
    ).toBeChecked();
  });

  test('follows a dark device until Light is chosen, then remembers it', async ({
    page,
  }) => {
    await gotoSettled(page, '/about');
    expect(await mainIsLight(page)).toBe(false);

    await choose(page, 'Light');
    expect(await mainIsLight(page)).toBe(true);
    expect(await stored(page)).toBe('light');

    await page.reload();
    await expect(radio(page, 'light')).toBeChecked();
    expect(await mainIsLight(page)).toBe(true);

    await gotoSettled(page, '/career');
    await expect(radio(page, 'light')).toBeChecked();
    expect(await mainIsLight(page)).toBe(true);
  });

  test('Dark holds on a light device across a reload', async ({ browser }) => {
    const context = await browser.newContext({ colorScheme: 'light' });
    const page = await context.newPage();
    await gotoSettled(page, '/about');
    expect(await mainIsLight(page)).toBe(true);

    await choose(page, 'Dark');
    expect(await mainIsLight(page)).toBe(false);
    expect(await stored(page)).toBe('dark');

    await page.reload();
    await expect(radio(page, 'dark')).toBeChecked();
    expect(await mainIsLight(page)).toBe(false);
    await context.close();
  });

  test('System forgets the choice and follows the device as it changes', async ({
    page,
  }) => {
    await gotoSettled(page, '/about');
    await choose(page, 'Light');
    await page.emulateMedia({ colorScheme: 'dark' });
    expect(
      await mainIsLight(page),
      'a stored choice gave way to the device.',
    ).toBe(true);

    await choose(page, 'System');
    expect(await stored(page), 'System left a stored choice.').toBeNull();
    expect(await mainIsLight(page)).toBe(false);

    await page.emulateMedia({ colorScheme: 'light' });
    await expect.poll(() => mainIsLight(page)).toBe(true);
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect.poll(() => mainIsLight(page)).toBe(false);

    await page.reload();
    await expect(radio(page, 'system')).toBeChecked();
  });

  test('a stored choice beats the device', async ({ browser }) => {
    const context = await browser.newContext({ colorScheme: 'light' });
    await context.addInitScript(
      (key) => localStorage.setItem(key, 'dark'),
      THEME_STORAGE_KEY,
    );
    const page = await context.newPage();

    await gotoSettled(page, '/about');
    await expect(radio(page, 'dark')).toBeChecked();
    expect(await mainIsLight(page)).toBe(false);
    await context.close();
  });

  test('a light device with no choice opens light, with System checked', async ({
    browser,
  }) => {
    const context = await browser.newContext({ colorScheme: 'light' });
    const page = await context.newPage();
    await gotoSettled(page, '/about');
    await expect(radio(page, 'system')).toBeChecked();
    expect(await mainIsLight(page)).toBe(true);
    await context.close();
  });

  test('a page restored from the back-forward cache takes the stored choice', async ({
    page,
  }) => {
    await gotoSettled(page, '/about');
    await expect(radio(page, 'system')).toBeChecked();

    /* As if another page changed the choice while this one sat in the cache. */
    await page.evaluate((key) => {
      localStorage.setItem(key, 'light');
      window.dispatchEvent(
        new PageTransitionEvent('pageshow', { persisted: true }),
      );
    }, THEME_STORAGE_KEY);
    await expect(
      radio(page, 'light'),
      'the restored page kept the choice it was cached with.',
    ).toBeChecked();
    expect(await mainIsLight(page)).toBe(true);
  });

  test('the keyboard opens it, moves the choice with the arrows, and Escape returns to the button', async ({
    page,
  }) => {
    await gotoSettled(page, '/about');
    const button = switchButton(page);
    const menu = headerMenu(page);
    await tabTo(page, button);

    await page.keyboard.press('Enter');
    await expect(menu).toBeVisible();
    await expect(radio(page, 'system')).toBeFocused();

    await page.keyboard.press('ArrowDown');
    await expect(radio(page, 'light')).toBeFocused();
    await expect(radio(page, 'light')).toBeChecked();
    expect(await mainIsLight(page)).toBe(true);

    await page.keyboard.press('ArrowDown');
    await expect(radio(page, 'dark')).toBeChecked();
    expect(await mainIsLight(page)).toBe(false);
    await expect(menu, 'an arrow key closed the menu').toBeVisible();

    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    await expect(button).toBeFocused();
    await expect(button).toHaveAttribute('aria-expanded', 'false');

    await page.keyboard.press('Space');
    await expect(menu).toBeVisible();
    await expect(radio(page, 'dark')).toBeFocused();
  });

  /* SC 2.4.3: a pick ends at the button that opened the menu. */
  test('a pointer pick closes the menu and returns focus to the button', async ({
    page,
  }) => {
    await gotoSettled(page, '/about');
    await choose(page, 'Light');
    await expect(headerMenu(page)).toBeHidden();
    await expect(switchButton(page)).toBeFocused();
    await expect(switchButton(page)).toHaveAttribute('aria-expanded', 'false');
    expect(await mainIsLight(page)).toBe(true);
  });

  for (const key of ['Enter', 'Space']) {
    test(`${key} picks the focused choice, closes the menu and returns focus to the button`, async ({
      page,
    }) => {
      await gotoSettled(page, '/about');
      const button = switchButton(page);
      await tabTo(page, button);
      await page.keyboard.press('Enter');
      await expect(radio(page, 'system')).toBeFocused();
      await page.keyboard.press('ArrowDown');
      await expect(headerMenu(page)).toBeVisible();

      await page.keyboard.press(key);
      await expect(headerMenu(page)).toBeHidden();
      await expect(button).toBeFocused();
      await expect(button).toHaveAttribute('aria-expanded', 'false');
      await expect(radio(page, 'light')).toBeChecked();
      expect(await mainIsLight(page)).toBe(true);
      // The key's release lands on the button; it must not open the menu again.
      await page.evaluate(
        () =>
          new Promise((done) =>
            requestAnimationFrame(() => requestAnimationFrame(done)),
          ),
      );
      await expect(headerMenu(page)).toBeHidden();
    });
  }

  /* SC 2.4.11: left open, it would cover the control focus moves to. */
  test('Tab out of the menu closes it', async ({ page }) => {
    await gotoSettled(page, '/about');
    await switchButton(page).click();
    await expect(radio(page, 'system')).toBeFocused();
    /* The three theme radios are one tab stop; the text size buttons follow in the menu, then focus leaves. */
    const SIZE_BUTTONS = 3;
    for (let stop = 0; stop < SIZE_BUTTONS; stop += 1) {
      await page.keyboard.press('Tab');
      await expect(headerMenu(page)).toBeVisible();
    }
    await page.keyboard.press('Tab');
    await expect(headerMenu(page)).toBeHidden();
  });

  /* SC 2.5.5: the button and each choice's row. */
  test('the button and every choice are 44px targets', async ({ page }) => {
    await gotoSettled(page, '/about');
    const button = await switchButton(page).boundingBox();
    expect(button?.width).toBeGreaterThanOrEqual(MIN_TARGET);
    expect(button?.height).toBeGreaterThanOrEqual(MIN_TARGET);
    await switchButton(page).click();
    for (const row of await headerMenu(page).locator('label').all()) {
      const box = await row.boundingBox();
      expect(box?.height, 'a choice is under 44px tall').toBeGreaterThanOrEqual(
        MIN_TARGET,
      );
      expect(box?.width).toBeGreaterThanOrEqual(MIN_TARGET);
    }
  });

  for (const [width, height] of [
    [REFLOW_VIEWPORT.width, REFLOW_VIEWPORT.height],
    [DESKTOP_VIEWPORT.width, DESKTOP_VIEWPORT.height],
  ]) {
    for (const [route, scope] of [
      ['/about', 'header'],
      ['/brand', `#controls [data-example]`],
    ]) {
      test(`opens whole inside a ${width}px viewport, below its button (${route} ${scope})`, async ({
        page,
      }) => {
        await page.setViewportSize({ width, height });
        await gotoSettled(page, route);
        const button = page.locator(`${scope} .theme-switch`);
        await button.scrollIntoViewIfNeeded();
        await button.click();
        const menu = page.locator(`${scope} .theme-menu`);
        await expect(menu).toBeVisible();
        const box = await menu.boundingBox();
        const anchor = await button.boundingBox();
        if (!box || !anchor)
          throw new Error('the menu or its button has no box');
        expect(
          box.x,
          'the menu leaves the viewport on the left',
        ).toBeGreaterThanOrEqual(0);
        expect(
          box.y,
          'the menu leaves the viewport at the top',
        ).toBeGreaterThanOrEqual(0);
        expect(
          box.x + box.width,
          'the menu leaves the viewport on the right',
        ).toBeLessThanOrEqual(width);
        expect(
          box.y + box.height,
          'the menu leaves the viewport at the bottom',
        ).toBeLessThanOrEqual(height);
        if (route === '/about') {
          expect(box.y, 'the menu covers its button').toBeGreaterThanOrEqual(
            anchor.y + anchor.height,
          );
        }
      });
    }
  }

  for (const colorScheme of ['dark', 'light'] as const) {
    /* SC 2.4.7 and 2.4.13: against the menu's own ground. */
    test(`a focused choice shows a ring of at least 3:1 in ${colorScheme} mode`, async ({
      browser,
    }) => {
      const context = await browser.newContext({ colorScheme });
      const page = await context.newPage();
      await gotoSettled(page, '/about');
      await tabTo(page, switchButton(page));
      await page.keyboard.press('Enter');
      await expect(radio(page, 'system')).toBeFocused();
      const ring = (await page.evaluate(`(() => {
        ${PAGE_HELPERS}
        const el = document.activeElement;
        const cs = getComputedStyle(el);
        const ground = effectiveBackground(el.closest('.theme-menu'));
        return {
          style: cs.outlineStyle,
          width: parseFloat(cs.outlineWidth),
          ratio: ground ? ratio(over(parse(cs.outlineColor), ground), ground) : 0,
        };
      })()`)) as { style: string; width: number; ratio: number };
      expect(ring.style, 'a focused choice has no ring').not.toBe('none');
      expect(ring.width).toBeGreaterThanOrEqual(MIN_RING_PX);
      expect(ring.ratio, 'the ring fades into the menu').toBeGreaterThanOrEqual(
        NON_TEXT,
      );
      await context.close();
    });
  }

  test('forced colors keep the menu edged and the choices visible', async ({
    page,
    browserName,
  }) => {
    test.skip(
      browserName === 'webkit',
      'webkit ships the forced-colors query only; see tests/forced-colors.spec.ts',
    );
    await gotoSettled(page, '/about');
    await page.emulateMedia({ forcedColors: 'active' });
    await switchButton(page).click();
    const edge = await headerMenu(page).evaluate((menu) => {
      const cs = getComputedStyle(menu);
      return {
        width: parseFloat(cs.borderTopWidth),
        style: cs.borderTopStyle,
        differs: cs.borderTopColor !== cs.backgroundColor,
      };
    });
    expect(edge.width, 'the menu loses its edge').toBeGreaterThan(0);
    expect(edge.style).not.toBe('none');
    expect(edge.differs, 'the edge is the menu fill').toBe(true);
    for (const choice of THEME_CHOICES) {
      await expect(radio(page, choice.value)).toBeVisible();
    }
  });

  /* SC 1.3.1: the glyph says the theme in use; the name stays fixed. */
  test('the icon follows the theme in use', async ({ page }) => {
    await gotoSettled(page, '/about');
    const sun = page.locator('header .theme-switch-sun');
    const moon = page.locator('header .theme-switch-moon');
    await expect(moon).toBeVisible();
    await expect(sun).toBeHidden();
    await choose(page, 'Light');
    await expect(sun).toBeVisible();
    await expect(moon).toBeHidden();
    await expect(switchButton(page)).toHaveAccessibleName('Theme');
  });

  /* SC 1.4.3: no dark frame of <main> before a saved light choice applies. */
  test('a saved choice is applied before the body is parsed', async ({
    browser,
  }) => {
    const context = await browser.newContext({ colorScheme: 'dark' });
    await context.addInitScript((key) => {
      localStorage.setItem(key, 'light');
      const record = window as unknown as { themeBeforeBody?: boolean };
      new MutationObserver(() => {
        if (
          record.themeBeforeBody === undefined &&
          document.documentElement?.dataset.theme === 'light'
        )
          record.themeBeforeBody = document.body === null;
      }).observe(document, {
        attributes: true,
        attributeFilter: ['data-theme'],
        subtree: true,
      });
    }, THEME_STORAGE_KEY);
    const page = await context.newPage();
    await page.goto('/about', { waitUntil: 'load' });
    expect(
      await page.evaluate(
        () =>
          (window as unknown as { themeBeforeBody?: boolean }).themeBeforeBody,
      ),
      'the saved light choice was applied only after <body> began.',
    ).toBe(true);
    await context.close();
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
