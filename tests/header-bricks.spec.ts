import { expect, test } from './test';
import { gotoSettled, scrollSettled } from './settle';
import { NON_TEXT, PAGE_HELPERS } from './contrast';
import { DESKTOP_VIEWPORT, PHONE_VIEWPORT } from './wcag';

/*
 * The header's joined bricks draw their focus ring inside the brick
 * (docs/STYLEGUIDE.md "Focus"), so the ring must read against the brick's own
 * fill, at rest and hovered, and stay clear of its label (SC 1.4.11, 2.4.13).
 * The logo link's ring sits outside it, on the gold bar.
 */

/* A route with a current header link, so a gold brick is walked too. */
const ROUTE = '/about/';
const BRICKS =
  '.header-slab :is(.logo-link, .header-bricks a, .header-bricks button)';
const MAX_STOPS = 12;
/* Past --spacing-header, so the header goes slim. */
const SLIM_SCROLL = 900;

interface Stop {
  name: string;
  ratio: number;
  brick: boolean;
  inside: boolean;
  onBar: boolean;
  clear: boolean;
}

/* The ring against the fill under it, and whether the ring's inner edge clears the label or icon. */
const readStop = `(() => {
  ${PAGE_HELPERS}
  const el = document.activeElement;
  if (!el || !el.matches(${JSON.stringify(BRICKS)})) return null;
  const s = getComputedStyle(el);
  const offset = parseFloat(s.outlineOffset);
  const width = parseFloat(s.outlineWidth);
  const ring = parse(s.outlineColor);
  const fill = effectiveBackground(el);
  const box = el.getBoundingClientRect();
  const slab = el.closest('.header-slab');
  const bar = slab.getBoundingClientRect();
  const edge = parseFloat(getComputedStyle(slab).borderTopWidth);
  const reach = offset + width;
  const onBar = box.left - reach >= bar.left + edge - 0.5 && box.right + reach <= bar.right - edge + 0.5 && box.top - reach >= bar.top + edge - 0.5 && box.bottom + reach <= bar.bottom - edge + 0.5;
  const inset = -offset;
  const inner = { left: box.left + inset, right: box.right - inset, top: box.top + inset, bottom: box.bottom - inset };
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const text = [];
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (!node.textContent.trim() || node.parentElement.closest('.sr-only')) continue;
    /* A visually hidden name is a 1px clip box, whatever its text measures. */
    if (node.parentElement.getBoundingClientRect().width <= 1) continue;
    const range = document.createRange();
    range.selectNodeContents(node);
    text.push(...range.getClientRects());
  }
  const marks = [...text, ...[...el.querySelectorAll('svg, img, .logo-tile')].map((n) => n.getBoundingClientRect())]
    /* A visually hidden name is a 1px box, not a mark the ring must clear. */
    .filter((r) => r.width > 1 && r.height > 1);
  const clear = marks.every((r) => r.left >= inner.left - 0.5 && r.right <= inner.right + 0.5 && r.top >= inner.top - 0.5 && r.bottom <= inner.bottom + 0.5);
  return {
    name: (el.getAttribute('aria-label') || el.textContent || el.tagName).trim().slice(0, 30),
    ratio: ratio(ring, fill),
    brick: Boolean(el.closest('.header-bricks')),
    onBar,
    inside: offset + width <= 0,
    clear,
  };
})()`;

for (const colorScheme of ['dark', 'light'] as const) {
  for (const [label, viewport] of [
    ['desktop', DESKTOP_VIEWPORT],
    ['phone', PHONE_VIEWPORT],
  ] as const) {
    for (const slim of [false, true]) {
      test.describe(`header bricks, ${colorScheme}, ${label}${slim ? ', slim' : ''}`, () => {
        test.use({ colorScheme, viewport });

        test('each ring sits inside its brick or on the bar, reads on its fill at rest and hovered, and clears the label', async ({
          page,
        }) => {
          await gotoSettled(page, ROUTE);
          if (slim) {
            await scrollSettled(page, SLIM_SCROLL);
            await expect(page.locator('header.site-header')).toHaveAttribute(
              'data-compact',
              '',
            );
          }
          const stops: (Stop & { hover: boolean })[] = [];
          for (let i = 0; i < MAX_STOPS; i += 1) {
            await page.keyboard.press('Tab');
            const rest = (await page.evaluate(readStop)) as Stop | null;
            if (!rest) {
              if (stops.length) break;
              continue;
            }
            stops.push({ ...rest, hover: false });
            await page.evaluate(() => {
              const el = document.activeElement as HTMLElement;
              el.dataset.probe = 'focused';
            });
            await page.locator('[data-probe="focused"]').hover();
            const hovered = (await page.evaluate(readStop)) as Stop | null;
            if (hovered) stops.push({ ...hovered, hover: true });
            await page.evaluate(() =>
              document
                .querySelector('[data-probe]')
                ?.removeAttribute('data-probe'),
            );
            await page.mouse.move(0, 0);
          }

          expect(
            stops.some((stop) => !stop.brick),
            'the walk never reached the logo link',
          ).toBe(true);
          expect(
            stops.filter((stop) => stop.brick).length,
            'the walk reached no header brick',
          ).toBeGreaterThan(0);
          for (const stop of stops) {
            const where = `${stop.name}${stop.hover ? ' (hovered)' : ''}`;
            expect(stop.onBar, `${where}: the ring leaves the bar`).toBe(true);
            if (stop.brick) {
              expect(
                stop.inside,
                `${where}: the ring is not drawn inside the brick`,
              ).toBe(true);
            }
            expect(
              stop.ratio,
              `${where}: the ring is under ${NON_TEXT}:1 on the brick's fill`,
            ).toBeGreaterThanOrEqual(NON_TEXT);
            expect(
              stop.clear,
              `${where}: the ring covers the label or icon`,
            ).toBe(true);
          }
        });
      });
    }
  }
}
