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

/* SC 1.4.6 large text: 18pt, or 14pt bold, in CSS px. */
const LARGE_TEXT_PX = 24;
const LARGE_BOLD_TEXT_PX = 18.66;
const BOLD_WEIGHT = 700;
const AAA_TEXT = 7;
const AAA_LARGE_TEXT = 4.5;
const RING_MIN = 3;
/* Past this gap the ring meets the page, not the control, so its fill no longer sets the contrast. */
const RING_GAP_PX = 2;
/* Each kind of control behaves alike, so a few of each cover a route in reasonable time. */
const SAMPLES_PER_KIND = 3;

const sampleControls = (page: Page, selector: string) =>
  page.evaluate(
    ({ selector, perKind }) => {
      const seen = new Map<string, number>();
      return [
        ...document.querySelectorAll<HTMLElement>(`main :is(${selector})`),
      ]
        .filter((el) => el.checkVisibility())
        .flatMap((el, index) => {
          const kind = `${el.tagName} ${el.className}`;
          const count = seen.get(kind) ?? 0;
          seen.set(kind, count + 1);
          if (count >= perKind) return [];
          el.dataset.lightSample = String(index);
          return [String(index)];
        });
    },
    { selector, perKind: SAMPLES_PER_KIND },
  );

test.describe('light mode reaches AAA contrast under the pointer (SC 1.4.6)', () => {
  test.use({ colorScheme: 'light' });

  for (const route of ROUTES) {
    test(`${route}: hovered text is at least 7:1, or 4.5:1 when large`, async ({
      page,
    }) => {
      await gotoSettled(page, route);
      const failures: string[] = [];
      for (const id of await sampleControls(page, 'a[href], button, summary')) {
        const control = page.locator(`[data-light-sample="${id}"]`);
        await control.scrollIntoViewIfNeeded();
        await control.hover({ force: true });
        const found = (await page.evaluate(`(() => {
          ${PAGE_HELPERS}
          const el = document.querySelector('[data-light-sample="${id}"]');
          const out = [];
          for (const node of [el, ...el.querySelectorAll('*')]) {
            const text = [...node.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
            if (!text || !node.checkVisibility() || node.closest('.sr-only')) continue;
            const cs = getComputedStyle(node);
            const size = parseFloat(cs.fontSize);
            const large = size >= ${LARGE_TEXT_PX} || (size >= ${LARGE_BOLD_TEXT_PX} && Number(cs.fontWeight) >= ${BOLD_WEIGHT});
            const ground = effectiveBackground(node);
            const r = ratio(over(parse(cs.color), ground), ground);
            const need = large ? ${AAA_LARGE_TEXT} : ${AAA_TEXT};
            if (r < need) out.push(node.tagName.toLowerCase() + '.' + [...node.classList].slice(0, 3).join('.') + ' "' + node.textContent.trim().slice(0, 30) + '" ' + r.toFixed(2) + ' < ' + need);
          }
          return out;
        })()`)) as string[];
        failures.push(...found);
      }
      await page.mouse.move(0, 0);
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
      for (const id of await sampleControls(page, FOCUSABLE_SELECTOR)) {
        const control = page.locator(`[data-light-sample="${id}"]`);
        await control.scrollIntoViewIfNeeded();
        /* A key press first, so the next focus is keyboard focus and shows the ring. */
        await page.keyboard.press('Shift');
        await control.focus();
        const found = (await page.evaluate(`(() => {
          ${PAGE_HELPERS}
          const el = document.querySelector('[data-light-sample="${id}"]');
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

  test('the keyboard reaches the tile, and Space presses it', async ({
    page,
  }) => {
    await gotoSettled(page, '/about');
    const toggle = page.getByRole('button', { name: SWITCH_NAME });

    for (let tab = 0; tab < MAX_TABS; tab++) {
      if (await toggle.evaluate((el) => el === document.activeElement)) break;
      await page.keyboard.press('Tab');
    }
    await expect(toggle).toBeFocused();

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
