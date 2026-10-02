import { expect, test, type Page } from './test';
import { gotoSettled } from './settle';
import { obscuredReport, readObscured } from './obscured';
import { settleFocusScroll, tabWalk } from './tab-walk';
import { DESKTOP_VIEWPORT, REFLOW_VIEWPORT } from './wcag';

/**
 * SC 2.4.12 Focus Not Obscured (Enhanced) in the open states focus.spec.ts
 * never walks: every stop inside the open dialog, both directions, is wholly
 * uncovered. The page itself is walked by focus.spec.ts.
 */

/** Far above any dialog's stops; reaching it fails the walk as a trap. */
const MAX_STOPS = 40;

const VIEWPORTS = {
  narrow: REFLOW_VIEWPORT,
  desktop: DESKTOP_VIEWPORT,
} as const;

type Width = keyof typeof VIEWPORTS;

const OPEN_STATES: readonly {
  name: string;
  route: string;
  /** The menu button only shows below 48rem. */
  widths: readonly Width[];
  open: (page: Page) => Promise<void>;
}[] = [
  {
    name: 'the cat card',
    route: '/about',
    widths: ['narrow', 'desktop'],
    open: async (page) => {
      await page.locator('#cat-spot-minerva .cat-button').focus();
      await page.keyboard.press('Enter');
    },
  },
  {
    name: 'the photo viewer',
    route: '/about',
    widths: ['narrow', 'desktop'],
    open: async (page) => {
      await page.locator('#people-photos a[data-photo]').first().focus();
      await page.keyboard.press('Enter');
    },
  },
  {
    name: 'the mobile menu',
    route: '/',
    widths: ['narrow'],
    open: async (page) => {
      await page.getByRole('button', { name: /menu/i }).focus();
      await page.keyboard.press('Enter');
    },
  },
];

for (const [label, viewport] of Object.entries(VIEWPORTS) as [
  Width,
  (typeof VIEWPORTS)[Width],
][]) {
  test.describe(`focus inside an open dialog, ${label} (SC 2.4.12)`, () => {
    test.use({ viewport });

    for (const state of OPEN_STATES.filter((s) => s.widths.includes(label))) {
      test(`${state.name} hides no part of any focused control`, async ({
        page,
      }) => {
        await gotoSettled(page, state.route);
        await state.open(page);
        const dialog = page.locator('dialog[open]');
        await expect(dialog, `${state.name} did not open`).toBeVisible();

        const stops = [];
        for (const key of ['Tab', 'Shift+Tab'] as const) {
          stops.push(
            ...(await tabWalk(page, () => readObscured(page), {
              key,
              max: MAX_STOPS,
              settle: () => settleFocusScroll(page),
            })),
          );
        }

        expect(
          stops.length,
          `the walk found no control in ${state.name}`,
        ).toBeGreaterThan(0);
        expect(
          obscuredReport(stops),
          `${state.name} at ${label} has focused controls partly hidden`,
        ).toEqual([]);
      });
    }
  });
}
