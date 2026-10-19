import type AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from './test';
import { timedScan } from './axe';
import { expectIncompleteDecided } from './incomplete';
import { gotoSettled } from './settle';
import {
  CONTENTS_POST_ROUTE,
  NO_CONTENTS_POST,
  NO_TALK,
  ROUTES,
  TALK_ROUTES,
  routesFromBuild,
} from './routes';
import {
  AXE_EXPERIMENTAL_RULES,
  AXE_TAGS,
  AXE_TIMEOUT_MS,
  REFLOW_VIEWPORT,
} from './wcag';
import { NODE } from './tags';

/* Every test here runs at least one axe scan; see AXE_TIMEOUT_MS. */
test.describe.configure({ timeout: AXE_TIMEOUT_MS });

/**
 * Kept apart from AXE_TAGS: none is a WCAG success criterion, so a
 * `region` or `heading-order` failure should not fail a test named "WCAG 2.2 AA".
 */
const BEST_PRACTICE_TAGS = ['best-practice'];

type Violation = Awaited<
  ReturnType<AxeBuilder['analyze']>
>['violations'][number];

/** Turn axe output into something a human can act on without opening a report. */
const formatViolations = (route: string, violations: Violation[]): string => {
  const lines = violations.map((violation) => {
    const nodes = violation.nodes
      .map((node) => {
        const selector = node.target.join(' ');
        const detail =
          node.failureSummary?.split('\n').join('\n        ') ?? '';
        return `      selector: ${selector}\n        ${detail}`;
      })
      .join('\n');

    return [
      `  rule:    ${violation.id}`,
      `  impact:  ${violation.impact ?? 'unknown'}`,
      `  help:    ${violation.help}`,
      `  url:     ${violation.helpUrl}`,
      `  nodes:   ${violation.nodes.length}`,
      nodes,
    ].join('\n');
  });

  return [
    `${violations.length} accessibility violation(s) on ${route}:`,
    ...lines,
  ].join('\n\n');
};

/*
 * The WCAG scans also decide the contrast nodes axe left incomplete, from the
 * same scan; the best-practice scan does not, so its failures stay separate.
 */
const SCANS = {
  wcag: { tags: AXE_TAGS, rules: AXE_EXPERIMENTAL_RULES },
  'best-practice': { tags: BEST_PRACTICE_TAGS, rules: [] },
} as const;

const analyze = async (
  page: Page,
  route: string,
  scan: keyof typeof SCANS = 'wcag',
): Promise<void> => {
  const response = await gotoSettled(page, route);
  expect(response?.status(), `${route} should serve a 200`).toBe(200);

  const { tags, rules } = SCANS[scan];
  const results = await timedScan(page, route, [...tags], [...rules]);

  expect
    .soft(results.violations, formatViolations(route, results.violations))
    .toEqual([]);
  if (scan === 'wcag') await expectIncompleteDecided(page, route, results);
};

test.describe('axe: WCAG 2.2 AA', () => {
  test('route coverage matches the build output', NODE, () => {
    expect(
      routesFromBuild(),
      'dist/ and tests/routes.ts disagree: a page is missing from PAGE_ROUTES, or the build made a page no post, category or tag accounts for.',
    ).toEqual([...ROUTES].sort());
  });

  for (const route of ROUTES) {
    test(`${route} has no violations and no unmeasured contrast`, async ({
      page,
    }) => {
      await analyze(page, route);
    });
  }
});

test.describe('axe: best practice', () => {
  for (const route of ROUTES) {
    test(`${route} has no best-practice violations`, async ({ page }) => {
      await analyze(page, route, 'best-practice');
    });
  }
});

/** SC 1.4.10 reflow width, menu closed: states only a reflowed layout reaches. */
test.describe('axe: WCAG 2.2 AA at 320px', () => {
  test.use({ viewport: REFLOW_VIEWPORT });

  for (const route of ROUTES) {
    test(`${route} has no violations and no unmeasured contrast at 320px`, async ({
      page,
    }) => {
      await analyze(page, route);
    });
  }
});

/**
 * The closed panel is display:none, so axe cannot reach it: open it first.
 * WCAG tags only; docs/MANUAL_TESTING.md checks `landmark-unique` on the open panel.
 */
test.describe('axe: WCAG 2.2 AA with the mobile menu open at 320px', () => {
  test.use({ viewport: REFLOW_VIEWPORT });

  for (const route of ROUTES) {
    test(`${route} has no violations with the menu open`, async ({ page }) => {
      const response = await gotoSettled(page, route);
      expect(response?.status(), `${route} should serve a 200`).toBe(200);

      const trigger = page.getByRole('button', { name: /menu/i });
      await expect(
        trigger,
        'the menu trigger should be visible at 320px',
      ).toBeVisible();
      await trigger.click();

      const panel = page.getByRole('dialog');
      await expect(
        panel,
        'the panel must be open, or this scan is the closed-state scan again',
      ).toBeVisible();

      const results = await timedScan(page, `${route} (mobile menu open)`);

      expect(
        results.violations,
        formatViolations(`${route} (mobile menu open)`, results.violations),
      ).toEqual([]);
      await expectIncompleteDecided(
        page,
        `${route} (mobile menu open)`,
        results,
      );
    });
  }
});

/* The states the route scans never open: the photo viewer, a post's contents, the scripted deck. */
test.describe('axe: WCAG 2.2 AA with interactive states open', () => {
  const scanOpen = async (page: Page, label: string) => {
    const results = await timedScan(page, label);
    expect
      .soft(results.violations, formatViolations(label, results.violations))
      .toEqual([]);
    await expectIncompleteDecided(page, label, results);
  };

  test('/about with the photo viewer open', async ({ page }) => {
    await gotoSettled(page, '/about');
    await page.locator('a[data-photo]').first().click();
    await expect(page.locator('#photo-viewer')).toBeVisible();
    await scanOpen(page, '/about (photo viewer open)');
  });

  test('a post with its contents open at 320px', async ({ page }) => {
    test.skip(!CONTENTS_POST_ROUTE, NO_CONTENTS_POST);
    await page.setViewportSize(REFLOW_VIEWPORT);
    await gotoSettled(page, CONTENTS_POST_ROUTE!);
    const summary = page.locator('nav.post-contents summary');
    await expect(summary).toBeVisible();
    await summary.click();
    await expect(page.locator('nav.post-contents details')).toHaveAttribute(
      'open',
      '',
    );
    await scanOpen(page, `${CONTENTS_POST_ROUTE} (contents open)`);
  });

  test('the talk after moving to the next slide', async ({ page }) => {
    test.skip(TALK_ROUTES.length === 0, NO_TALK);
    await gotoSettled(page, `${TALK_ROUTES[0]}/`);
    await page.waitForSelector('[data-deck-ready]');
    await page.getByRole('button', { name: 'Next' }).click();
    await expect(page.locator('.slide:visible')).toHaveId('slide-2');
    await scanOpen(page, `${TALK_ROUTES[0]} (slide 2)`);
  });
});

/*
 * The scripted deck hides all but one slide. axe cannot run with JavaScript off,
 * so the page is put back in its no-JavaScript state, where every slide shows.
 */
for (const colorScheme of ['dark', 'light'] as const) {
  test.describe(`axe: every slide in the no-JavaScript deck, ${colorScheme}`, () => {
    test.use({ colorScheme });

    for (const route of TALK_ROUTES) {
      test(`${route}`, async ({ page }) => {
        await gotoSettled(page, `${route}/`);
        await page.waitForSelector('[data-deck-ready]');
        await page.evaluate(() => {
          document.documentElement.classList.remove('js');
          document.querySelector('.deck')?.removeAttribute('data-deck-ready');
        });
        await expect(
          page.locator('.slide:visible'),
          `${route} should show every slide in its no-JavaScript state`,
        ).toHaveCount(await page.locator('.slide').count());
        const label = `${route} (all slides, ${colorScheme})`;
        const results = await timedScan(page, label);
        expect(
          results.violations,
          formatViolations(label, results.violations),
        ).toEqual([]);
        await expectIncompleteDecided(page, label, results);
      });
    }
  });
}
