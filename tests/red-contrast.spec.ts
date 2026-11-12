import { expect, test } from './test';
import { AAA_TEXT, PAGE_HELPERS } from './contrast';
import { gotoSettled } from './settle';
import { SAMPLED_ROUTES } from './routes';

/*
 * The rule for red, above SC 1.4.11: every red edge or throw is
 * 7:1 or more on the ground it sits on, in both modes. On gold that means ink.
 * A masked `::before` throw is measured on the ground under its bottom right corner.
 */
for (const colorScheme of ['dark', 'light'] as const) {
  test.describe(`${colorScheme} mode: every red is at least 7:1 on its ground`, () => {
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
          const reds = new Set(
            ['--dark-red-text', '--color-light-red-text'].map((name) => toRgb(root.getPropertyValue(name))),
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
              for (const color of colors.filter((c) => reds.has(key(c)))) {
                const ground = effectiveBackground(inset ? el : el.parentElement);
                if (!ground) continue;
                found += 1;
                const measured = ratio(over(color, ground), ground);
                if (measured < ${AAA_TEXT}) faint.push(describe(el) + ' ' + measured.toFixed(2));
              }
            }
            const thrown = getComputedStyle(el, '::before');
            const isMaskedThrow =
              thrown.content !== 'none' && thrown.display !== 'none' && thrown.maskImage !== 'none';
            const throwColor = isMaskedThrow ? parse(thrown.backgroundColor) : null;
            if (throwColor && throwColor.a > 0 && reds.has(key(throwColor))) {
              const corner = { left: box.right - 1, right: box.right, top: box.bottom - 1, bottom: box.bottom };
              const ground = compositeBackground(el.parentElement, corner);
              if (!ground) continue;
              found += 1;
              const measured = ratio(over(throwColor, ground), ground);
              if (measured < ${AAA_TEXT}) faint.push(describe(el) + '::before ' + measured.toFixed(2));
            }
          }
          return { found, faint: [...new Set(faint)] };
        })()`)) as { found: number; faint: string[] };
        if (route === '/')
          expect(found, 'no red edge or throw found on /').toBeGreaterThan(0);
        expect(faint, `red below 7:1 on its ground on ${route}`).toEqual([]);
      });
    }
  });
}
