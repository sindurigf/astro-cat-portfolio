import { expect, test } from './test';
import { ROUTES } from './routes';
import { gotoSettled } from './settle';

/*
 * Performance and test stability: filter layers over walls stalled Playwright input on an older build.
 * Every sheet rule counts, whatever state its selector waits on.
 * Only the hero's near canvas, with no text or controls, may take a filter (set by script).
 */
const ALLOWED_FILTER = '.hero-field > canvas:last-of-type';

interface Scan {
  rules: number;
  sheetFilters: string[];
  elementFilters: string[];
}

for (const route of ROUTES) {
  test(`${route} has no filter or backdrop-filter outside the hero canvas`, async ({
    page,
  }) => {
    await gotoSettled(page, route);

    const scan: Scan = await page.evaluate((allowed) => {
      const result: Scan = { rules: 0, sheetFilters: [], elementFilters: [] };
      const filtersOf = (style: CSSStyleDeclaration) =>
        [
          style.getPropertyValue('filter'),
          style.getPropertyValue('backdrop-filter'),
        ].filter((value) => value !== '' && value !== 'none');

      const walk = (rules: CSSRuleList): void => {
        for (const rule of rules) {
          result.rules += 1;
          if (rule instanceof CSSImportRule && rule.styleSheet) {
            walk(rule.styleSheet.cssRules);
            continue;
          }
          if (rule instanceof CSSStyleRule) {
            for (const filter of filtersOf(rule.style)) {
              result.sheetFilters.push(`${rule.selectorText} { ${filter} }`);
            }
          }
          if ('cssRules' in rule && rule.cssRules instanceof CSSRuleList) {
            walk(rule.cssRules);
          }
        }
      };
      for (const sheet of document.styleSheets) walk(sheet.cssRules);

      for (const element of document.querySelectorAll('*')) {
        if (element.matches(allowed)) continue;
        for (const filter of filtersOf(getComputedStyle(element))) {
          const name = element.id
            ? `#${element.id}`
            : `${element.localName}.${[...element.classList].join('.')}`;
          result.elementFilters.push(`${name} { ${filter} }`);
        }
      }
      return result;
    }, ALLOWED_FILTER);

    expect(scan.rules, `${route} exposes no CSS rules to scan`).toBeGreaterThan(
      0,
    );
    expect(
      scan.sheetFilters,
      `${route} has a stylesheet rule with a filter; cast the shadow with box-shadow per element instead`,
    ).toEqual([]);
    expect(
      scan.elementFilters,
      `${route} has an element with a filter outside the hero canvas`,
    ).toEqual([]);
  });
}
