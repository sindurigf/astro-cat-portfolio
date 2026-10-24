import { expect, test, type Page } from './test';
import {
  ACCESSLINT_FALSE_POSITIVES,
  formatHits,
  runAccessLint,
} from './accesslint';
import { gotoSettled } from './settle';
import { SAMPLED_ROUTES } from './routes';
import { REFLOW_VIEWPORT } from './wcag';

/* A second engine beside axe (a11y.spec.ts): its own rule code, so a gap in one is not a gap in both. */

const expectNoViolations = async (
  page: Page,
  route: string,
  label: string,
): Promise<void> => {
  const response = await gotoSettled(page, route);
  expect(response?.status(), `${route} should serve a 200`).toBe(200);
  const { violations } = await runAccessLint(page);
  expect(violations, formatHits(label, violations)).toEqual([]);
};

test.describe('AccessLint: WCAG 2.2 AA and best practice', () => {
  for (const route of SAMPLED_ROUTES) {
    test(`${route} has no AccessLint violations`, async ({ page }) => {
      await expectNoViolations(page, route, route);
    });
  }
});

test.describe('AccessLint: WCAG 2.2 AA and best practice at 320px', () => {
  test.use({ viewport: REFLOW_VIEWPORT });

  for (const route of SAMPLED_ROUTES) {
    test(`${route} has no AccessLint violations at 320px`, async ({ page }) => {
      await expectNoViolations(page, route, `${route} at 320px`);
    });
  }
});

test.describe('AccessLint false positives', () => {
  for (const entry of ACCESSLINT_FALSE_POSITIVES) {
    test(`${entry.rule} on ${entry.selector} still occurs on ${entry.seenOn}`, async ({
      page,
    }) => {
      await gotoSettled(page, entry.seenOn);
      const { dropped } = await runAccessLint(page, [entry]);
      const { violations } = await runAccessLint(page, []);
      expect(
        dropped,
        violations.some((hit) => hit.ruleId === entry.rule)
          ? `AccessLint still reports ${entry.rule}, but not where the entry's reason holds; check the finding again before changing the entry.`
          : `AccessLint no longer reports ${entry.rule}; remove the entry and its ARCHITECTURE.md line.`,
      ).not.toEqual([]);
    });
  }
});
