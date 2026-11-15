import { expect, test } from './test';
import { AAA_TEXT, PAGE_HELPERS } from './contrast';
import { gotoSettled } from './settle';
import { SAMPLED_ROUTES } from './routes';

/*
 * Accessibility: the accent fill is gold in dark mode and cyan in light mode,
 * and every word on it is 7:1 or more, above SC 1.4.3.
 */
for (const colorScheme of ['dark', 'light'] as const) {
  test.describe(`${colorScheme} mode: text on the accent fill is at least 7:1`, () => {
    test.use({ colorScheme });

    for (const route of SAMPLED_ROUTES) {
      test(route, async ({ page }) => {
        await gotoSettled(page, route);
        const { found, faint } = (await page.evaluate(`(() => {
          ${PAGE_HELPERS}
          const fills = '.surface-gold:not(.hero-window), .bg-block-gold, .btn-primary';
          let found = 0;
          const faint = [];
          for (const el of document.querySelectorAll(fills.split(', ').map((s) => s + ', ' + s + ' *').join(', '))) {
            if (el.closest('.table-scroll [data-sample], .mode-dark, .mode-light')) continue;
            const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
            if (!own) continue;
            const box = el.getBoundingClientRect();
            const style = getComputedStyle(el);
            if (box.width === 0 || style.visibility === 'hidden') continue;
            const ground = effectiveBackground(el);
            const color = parse(style.color);
            if (!ground || !color) continue;
            found += 1;
            const measured = ratio(over(color, ground), ground);
            if (measured < ${AAA_TEXT}) faint.push(describe(el) + ' ' + measured.toFixed(2));
          }
          return { found, faint: [...new Set(faint)] };
        })()`)) as { found: number; faint: string[] };
        if (route === '/')
          expect(
            found,
            'no text on the accent fill found on /',
          ).toBeGreaterThan(0);
        expect(
          faint,
          `text below 7:1 on the accent fill on ${route} in ${colorScheme} mode`,
        ).toEqual([]);
      });
    }
  });
}
