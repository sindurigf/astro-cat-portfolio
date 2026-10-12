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
      await page.locator('.cat-button').first().focus();
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

for (const [label, viewport] of Object.entries(VIEWPORTS) as [
  Width,
  (typeof VIEWPORTS)[Width],
][]) {
  test.describe(`the About cats, ${label} (SC 2.4.12)`, () => {
    test.use({ viewport });

    test('each cat button and its controls are wholly uncovered when focused', async ({
      page,
    }) => {
      await gotoSettled(page, '/about');
      const controls = page.locator(
        '.cat-button, .cat-nap, .cat-tricks-button',
      );
      const count = await controls.count();
      expect(count, '/about shows no cat to focus').toBeGreaterThan(0);

      const stops = [];
      for (let i = 0; i < count; i += 1) {
        /* A key press first, so the focus is keyboard focus. */
        await page.keyboard.press('Shift');
        await controls.nth(i).focus();
        await settleFocusScroll(page);
        stops.push(await readObscured(page));
      }
      expect(
        obscuredReport(stops),
        `a focused About cat control is partly covered at ${label} width`,
      ).toEqual([]);
    });
  });
}

/** Leaves the trick list no room under its band, so it is placed over the band. */
const PAW_ABOVE_VIEWPORT_END = 110;

for (const [label, viewport] of Object.entries(VIEWPORTS) as [
  Width,
  (typeof VIEWPORTS)[Width],
][]) {
  test.describe(`an About cat's open trick list, ${label} (SC 2.4.12)`, () => {
    test.use({ viewport });

    const openWithNoRoomBelow = async (page: Page, index: number) => {
      const paw = page.locator('.cat-tricks-button').nth(index);
      await paw.evaluate((button: HTMLElement, gap) => {
        window.scrollBy({
          top: button.getBoundingClientRect().bottom - (innerHeight - gap),
          behavior: 'instant',
        });
      }, PAW_ABOVE_VIEWPORT_END);
      /* The list closes on a scroll: let this one be reported first. */
      await settleFocusScroll(page);
      await paw.evaluate((button: HTMLElement) =>
        button.focus({ preventScroll: true }),
      );
      await page.keyboard.press('Enter');
      await expect(
        page.locator('.cat-tricks:popover-open .cat-trick').first(),
      ).toBeFocused();
    };

    test('no stop reached from the open list is covered by it, in either direction', async ({
      page,
    }) => {
      await gotoSettled(page, '/about');
      const paws = page.locator('.cat-tricks-button');
      const count = await paws.count();
      expect(count, '/about shows no trick list to open').toBeGreaterThan(0);
      const open = page.locator('.cat-tricks:popover-open');

      const stops = [];
      for (let i = 0; i < count; i += 1) {
        await page.keyboard.press('Shift');
        await openWithNoRoomBelow(page, i);
        await page.keyboard.press('Shift+Tab');
        await expect(paws.nth(i)).toBeFocused();
        stops.push(await readObscured(page));
        for (const control of ['.cat-nap', '.cat-button']) {
          await page.keyboard.press('Shift+Tab');
          await expect(page.locator(control).nth(i)).toBeFocused();
          await expect(
            open,
            `the list stayed open with focus on ${control}`,
          ).toHaveCount(0);
          await settleFocusScroll(page);
          stops.push(await readObscured(page));
        }

        await openWithNoRoomBelow(page, i);
        const rows = await open.locator('.cat-trick').count();
        for (let row = 0; row < rows; row += 1)
          await page.keyboard.press('Tab');
        await expect(
          open,
          'the list stayed open after Tab left its last trick',
        ).toHaveCount(0);
        await settleFocusScroll(page);
        stops.push(await readObscured(page));
      }
      expect(
        obscuredReport(stops),
        `a control focused from an open trick list is partly covered at ${label} width`,
      ).toEqual([]);
    });
  });
}
