import { expect, test } from './test';
import { gotoSettled } from './settle';

/**
 * Tightest header widths: 336px (`--breakpoint-xs`), 768px (primary nav appears),
 * 1024px (row switches to grid).
 */
const WIDTHS = [336, 768, 1024] as const;

const VIEWPORT_HEIGHT = 800;

/* The route with the longest nav label lit. */
const ROUTE = '/about';

for (const width of WIDTHS) {
  test.describe(`the header row at ${width}px`, () => {
    test.use({ viewport: { width, height: VIEWPORT_HEIGHT } });

    test('fits without covering a control or scrolling the page', async ({
      page,
    }) => {
      await gotoSettled(page, ROUTE);

      const found = await page.evaluate(() => {
        const header = document.querySelector('header');
        const wordmark = header?.querySelector('a[href="/"] .label');
        if (!header || !wordmark) return null;
        const controls = [
          ...header.querySelectorAll<HTMLElement>('a, button, input, select'),
        ].filter((el) => {
          const r = el.getBoundingClientRect();
          return r.width > 1 && r.height > 1 && el.checkVisibility();
        });
        const name = (el: Element) =>
          (el.textContent ?? '').trim() ||
          el.getAttribute('aria-label') ||
          el.tagName;
        const covered = controls
          .filter((el) => {
            const r = el.getBoundingClientRect();
            const hit = document.elementFromPoint(
              r.left + r.width / 2,
              r.top + r.height / 2,
            );
            return !hit || !(el === hit || el.contains(hit));
          })
          .map(name);
        const w = wordmark.getBoundingClientRect();
        const touching = controls
          .filter((el) => !el.contains(wordmark))
          .filter((el) => {
            const r = el.getBoundingClientRect();
            return (
              r.left < w.right &&
              r.right > w.left &&
              r.top < w.bottom &&
              r.bottom > w.top
            );
          })
          .map(name);
        return {
          controls: controls.length,
          covered,
          touching,
          sideways:
            document.documentElement.scrollWidth -
            document.documentElement.clientWidth,
        };
      });

      expect(found, 'the header has no home link wordmark').not.toBeNull();
      expect(found!.controls, 'no visible header controls').toBeGreaterThan(1);
      expect(found!.sideways, 'the page scrolls sideways').toBe(0);
      expect(
        found!.covered,
        'header controls whose center lands on something else',
      ).toEqual([]);
      expect(
        found!.touching,
        'header controls running into the wordmark',
      ).toEqual([]);
    });
  });
}

/* Widths where the brick rows differ: the menu button alone, then nav and call to action. */
const BRICK_WIDTHS = [336, 1280] as const;

for (const width of BRICK_WIDTHS) {
  test.describe(`the header bricks at ${width}px`, () => {
    test.use({ viewport: { width, height: VIEWPORT_HEIGHT } });

    test('keep the header at --spacing-header with room above and under each row', async ({
      page,
    }) => {
      await gotoSettled(page, ROUTE);

      const found = await page.evaluate(() => {
        const header = document.querySelector('header.site-header');
        const slab = header?.querySelector<HTMLElement>('.header-slab');
        if (!header || !slab) return null;
        const root = getComputedStyle(document.documentElement);
        const slabStyle = getComputedStyle(slab);
        const inner = slab.getBoundingClientRect();
        const top = inner.top + parseFloat(slabStyle.borderTopWidth);
        const bottom = inner.bottom - parseFloat(slabStyle.borderBottomWidth);
        const rows = [...slab.querySelectorAll<HTMLElement>('.header-bricks')]
          .filter((row) => row.checkVisibility())
          .map((row) => {
            const box = row.getBoundingClientRect();
            const throwY = parseFloat(
              getComputedStyle(row).boxShadow.split(' ').at(-3) ?? '0',
            );
            return {
              above: box.top - top,
              below: bottom - (box.bottom + throwY),
              throwY,
            };
          });
        return {
          header: header.getBoundingClientRect().height,
          token: parseFloat(root.getPropertyValue('--spacing-header')),
          rows,
        };
      });

      expect(found, 'the header has no slab').not.toBeNull();
      expect(
        found!.header,
        'the header is not --spacing-header tall, so the bricks grew it',
      ).toBe(found!.token);
      expect(found!.rows.length, 'no brick row is visible').toBeGreaterThan(0);
      for (const row of found!.rows) {
        expect(row.throwY, 'a brick row casts no throw').toBeGreaterThan(0);
        expect(
          row.above,
          'a brick row touches the top of the bar',
        ).toBeGreaterThan(0);
        expect(
          row.below,
          'a brick row throw touches the bottom of the bar',
        ).toBeGreaterThan(0);
        expect(
          Math.abs(row.above - row.below),
          'a brick row and its throw are not centered on the bar',
        ).toBeLessThanOrEqual(1);
      }
    });
  });
}

/* Wider than the page column, where the gold hero runs out toward the screen edge. */
const WIDE_WIDTHS = [1440, 1920] as const;

for (const width of WIDE_WIDTHS) {
  test.describe(`the header bar at ${width}px`, () => {
    test.use({ viewport: { width, height: VIEWPORT_HEIGHT } });

    test('starts and ends where the gold hero does', async ({ page }) => {
      await gotoSettled(page, ROUTE);
      const found = await page.evaluate(() => {
        const edges = (selector: string) => {
          const box = document.querySelector(selector)?.getBoundingClientRect();
          return box ? { left: box.left, right: box.right } : null;
        };
        return { bar: edges('.header-slab'), hero: edges('main .gold-column') };
      });
      expect(found.bar, 'the header has no bar').not.toBeNull();
      expect(found.hero, `${ROUTE} has no gold hero`).not.toBeNull();
      expect(
        Math.abs(found.bar!.left - found.hero!.left),
        'the bar starts somewhere other than the hero',
      ).toBeLessThanOrEqual(1);
      expect(
        Math.abs(found.bar!.right - found.hero!.right),
        'the bar ends somewhere other than the hero',
      ).toBeLessThanOrEqual(1);
    });
  });
}

/* Tab stops walked under the slim header: past the opening of /about and into its body. */
const SLIM_WALK_STOPS = 30;

test.describe('the slim header once the page scrolls', () => {
  test.use({ viewport: { width: 1280, height: VIEWPORT_HEIGHT } });

  test('is --spacing-header-compact tall, keeps 44px targets, moves nothing and does not animate', async ({
    page,
  }) => {
    await gotoSettled(page, ROUTE);
    const before = await page.evaluate(
      () =>
        document.querySelector('main')!.getBoundingClientRect().top + scrollY,
    );
    await page.mouse.wheel(0, 900);
    await expect(page.locator('header.site-header')).toHaveAttribute(
      'data-compact',
      '',
    );
    const found = await page.evaluate(() => {
      const header = document.querySelector<HTMLElement>('header.site-header')!;
      const root = getComputedStyle(document.documentElement);
      const targets = [
        ...header.querySelectorAll<HTMLElement>(
          '.header-bricks :is(a, button), .logo-link',
        ),
      ]
        .filter((el) => el.checkVisibility())
        .map((el) => {
          const box = el.getBoundingClientRect();
          return Math.min(box.width, box.height);
        });
      return {
        height: header.getBoundingClientRect().height,
        token: parseFloat(root.getPropertyValue('--spacing-header-compact')),
        smallest: Math.min(...targets),
        mainTop:
          document.querySelector('main')!.getBoundingClientRect().top + scrollY,
        transition: getComputedStyle(header).transitionDuration,
      };
    });
    expect(
      found.height,
      'the slim header is not --spacing-header-compact tall',
    ).toBe(found.token);
    expect(
      found.smallest,
      'a slim header target is under 44px (SC 2.5.5)',
    ).toBeGreaterThanOrEqual(44);
    expect(found.mainTop, 'going slim moved the page under it').toBe(before);
    expect(found.transition, 'the slim header animates').toBe('0s');
    await page.mouse.wheel(0, -2000);
    await expect(page.locator('header.site-header')).not.toHaveAttribute(
      'data-compact',
    );
  });

  test('never hides a focused control under it (SC 2.4.11)', async ({
    page,
  }) => {
    await gotoSettled(page, ROUTE);
    await page.locator('main a').first().focus();
    const under: string[] = [];
    for (let i = 0; i < SLIM_WALK_STOPS; i += 1) {
      await page.keyboard.press('Tab');
      const stop = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement;
        const header = document.querySelector('header.site-header')!;
        if (header.contains(el) || !el.closest('main')) return null;
        const box = el.getBoundingClientRect();
        return {
          name: (el.textContent ?? '').trim().slice(0, 30),
          under:
            box.top < header.getBoundingClientRect().bottom && box.bottom > 0,
        };
      });
      if (stop?.under) under.push(stop.name);
    }
    expect(under, 'focused while partly under the slim header').toEqual([]);
  });
});
