import { expect, test, type Page } from './test';
import { HTMLCS_FALSE_POSITIVES, formatHits, runHtmlcs } from './htmlcs';
import { gotoSettled } from './settle';
import { SAMPLED_ROUTES } from './routes';
import { REFLOW_VIEWPORT } from './wcag';

/* A third engine beside axe and AccessLint: its own sniffs, so a gap in two is not a gap in all three. */

const expectNoFindings = async (
  page: Page,
  route: string,
  label: string,
): Promise<void> => {
  const response = await gotoSettled(page, route);
  expect(response?.status(), `${route} should serve a 200`).toBe(200);
  const { violations } = await runHtmlcs(page);
  expect(violations, formatHits(label, violations)).toEqual([]);
};

test.describe('HTML_CodeSniffer: WCAG 2 AA errors and H42', () => {
  for (const route of SAMPLED_ROUTES) {
    test(`${route} has no HTML_CodeSniffer findings`, async ({ page }) => {
      await expectNoFindings(page, route, route);
    });
  }
});

test.describe('HTML_CodeSniffer: WCAG 2 AA errors and H42 at 320px', () => {
  test.use({ viewport: REFLOW_VIEWPORT });

  for (const route of SAMPLED_ROUTES) {
    test(`${route} has no HTML_CodeSniffer findings at 320px`, async ({
      page,
    }) => {
      await expectNoFindings(page, route, `${route} at 320px`);
    });
  }
});

test.describe('HTML_CodeSniffer false positives', () => {
  for (const entry of HTMLCS_FALSE_POSITIVES) {
    test(`${entry.code} on ${entry.selector} still occurs on ${entry.seenOn}`, async ({
      page,
    }) => {
      await gotoSettled(page, entry.seenOn);
      const { dropped } = await runHtmlcs(page, [entry]);
      const { violations } = await runHtmlcs(page, []);
      expect(
        dropped,
        violations.some((hit) => hit.code === entry.code)
          ? `HTML_CodeSniffer still reports ${entry.code}, but not where the entry's reason holds; check the finding again before changing the entry.`
          : `HTML_CodeSniffer no longer reports ${entry.code}; remove the entry and its ARCHITECTURE.md line.`,
      ).not.toEqual([]);
    });
  }
});
