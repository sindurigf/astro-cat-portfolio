import { expect, test } from './test';
import { ROUTES } from './routes';
import { gotoSettled } from './settle';

/**
 * Tailwind 4 preflight leaves `<button>` on `cursor: default`; base.css sets
 * pointer, or not-allowed for `aria-disabled="true"`. Includes the closed menu.
 */
for (const route of ROUTES) {
  test(`${route} gives every enabled button the pointer cursor`, async ({
    page,
  }) => {
    await gotoSettled(page, route);

    const buttons = await page.evaluate(() =>
      [...document.querySelectorAll('button:not(:disabled)')].map((button) => ({
        label:
          button.getAttribute('aria-label') ??
          (button.textContent ?? '').trim().slice(0, 40),
        cursor: getComputedStyle(button).cursor,
        unavailable: button.getAttribute('aria-disabled') === 'true',
      })),
    );

    /* Every route has the menu trigger, so zero buttons means the page did not render. */
    expect(buttons.length, `${route} rendered no buttons`).toBeGreaterThan(0);

    expect(
      buttons.filter(
        ({ cursor, unavailable }) =>
          cursor !== (unavailable ? 'not-allowed' : 'pointer'),
      ),
      `${route} has button(s) without the cursor their state gives them`,
    ).toEqual([]);
  });
}
