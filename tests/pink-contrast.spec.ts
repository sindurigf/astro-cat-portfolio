import { expect, test } from './test';
import { AAA_TEXT, PAGE_HELPERS } from './contrast';
import { gotoSettled } from './settle';
import { SAMPLED_ROUTES } from './routes';

/*
 * The rule for pink, above SC 1.4.11: every pink edge or throw is
 * 7:1 or more on the ground it sits on, in both modes. On gold that means ink.
 */
for (const colorScheme of ['dark', 'light'] as const) {
  test.describe(`${colorScheme} mode: every pink is at least 7:1 on its ground`, () => {
    test.use({ colorScheme });

    for (const route of SAMPLED_ROUTES) {
      test(route, async ({ page }) => {
        await gotoSettled(page, route);
        const { found, faint } = (await page.evaluate(`(() => {
          ${PAGE_HELPERS}
          const root = getComputedStyle(document.documentElement);
          const toRgb = (hex) => {
            const h = hex.trim().replace('#', '');
            return [0, 2, 4].map((at) => parseInt(h.slice(at, at + 2), 16)).join(',');
          };
          const pinks = new Set(
            ['--dark-pink-text', '--color-light-pink-text'].map((name) => toRgb(root.getPropertyValue(name))),
          );
          const key = (c) => [c.r, c.g, c.b].join(',');
          const colorsIn = (value) => (value.match(/rgba?\\([^)]+\\)/g) || []).map(parse).filter((c) => c && c.a > 0);
          let found = 0;
          const faint = [];
          for (const el of document.querySelectorAll('body *')) {
            if (el.closest('.table-scroll [data-sample]')) continue;
            const box = el.getBoundingClientRect();
            if (box.width === 0 || box.height === 0) continue;
            const style = getComputedStyle(el);
            if (style.visibility === 'hidden') continue;
            const outer = style.boxShadow === 'none' ? [] : style.boxShadow.split(/,(?![^(]*\\))/);
            const marks = [
              ...outer.map((part) => ({ inset: part.includes('inset'), colors: colorsIn(part) })),
              ...['Top', 'Right', 'Bottom', 'Left']
                .filter((side) => parseFloat(style['border' + side + 'Width']) > 0)
                .map((side) => ({ inset: false, colors: colorsIn(style['border' + side + 'Color']) })),
            ];
            for (const { inset, colors } of marks) {
              for (const color of colors.filter((c) => pinks.has(key(c)))) {
                const ground = effectiveBackground(inset ? el : el.parentElement);
                if (!ground) continue;
                found += 1;
                const measured = ratio(over(color, ground), ground);
                if (measured < ${AAA_TEXT}) faint.push(describe(el) + ' ' + measured.toFixed(2));
              }
            }
          }
          return { found, faint: [...new Set(faint)] };
        })()`)) as { found: number; faint: string[] };
        if (route === '/')
          expect(found, 'no pink edge or throw found on /').toBeGreaterThan(0);
        expect(faint, `pink below 7:1 on its ground on ${route}`).toEqual([]);
      });
    }
  });
}
