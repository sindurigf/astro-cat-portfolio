import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from './test';
import { gotoSettled } from './settle';
import { PHONE_VIEWPORT } from './wcag';
import { NODE } from './tags';

/* WCAG 2.2 SC 2.5.1 Pointer Gestures and SC 2.5.2 Pointer Cancellation. */

const SOURCE_ROOT = 'src';
const SOURCE_FILE = /\.(ts|astro)$/;

/* Path and multipoint gestures: every action here is a single tap or click. */
const GESTURE_API =
  /\b(?:addEventListener\(\s*|\.on|\bon)['"]?(?:touchstart|touchmove|touchend|touchcancel|gesture\w+|dragstart|drag|dragend|wheel)['"]?|\bsetPointerCapture\b/;

/* A down event can only record a press or wake the UI; none may run an action. */
const DOWN_EVENT = /['"](?:pointerdown|mousedown|touchstart)['"]/;
const DOWN_LISTENER_FILES: readonly string[] = [
  'src/scripts/about-cats.ts',
  'src/scripts/card-click.ts',
  'src/scripts/slideshow.ts',
  'src/scripts/text-size.ts',
];

const sourceFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return SOURCE_FILE.test(entry.name) ? [path] : [];
  });

const filesMatching = (pattern: RegExp): string[] =>
  sourceFiles(SOURCE_ROOT)
    .filter((file) => pattern.test(readFileSync(file, 'utf8')))
    .sort();

test.describe('pointer input in the source', NODE, () => {
  test('the gesture pattern flags a touch listener and pointer capture', () => {
    expect(GESTURE_API.test(`el.addEventListener('touchmove', f)`)).toBe(true);
    expect(GESTURE_API.test(`el.addEventListener("wheel", f)`)).toBe(true);
    expect(GESTURE_API.test(`el.setPointerCapture(id)`)).toBe(true);
    expect(GESTURE_API.test(`el.addEventListener('click', f)`)).toBe(false);
  });

  test('no script reads a path or multipoint gesture (SC 2.5.1)', () => {
    expect(
      filesMatching(GESTURE_API),
      'these files listen for a touch, drag or wheel gesture; give the action a single-pointer alternative.',
    ).toEqual([]);
  });

  test('only the vetted scripts listen for a pointer down (SC 2.5.2)', () => {
    expect(
      filesMatching(DOWN_EVENT),
      'a new down listener needs a check that it runs no action on down, then a place in DOWN_LISTENER_FILES.',
    ).toEqual([...DOWN_LISTENER_FILES].sort());
  });
});

const pageState = async (page: Page) => {
  await page.waitForLoadState('load');
  return page.evaluate(() => ({
    url: location.href,
    expanded: [...document.querySelectorAll('[aria-expanded]')].map((el) =>
      el.getAttribute('aria-expanded'),
    ),
    popovers: document.querySelectorAll(':popover-open').length,
    dialogs: document.querySelectorAll('dialog[open]').length,
    root: document.documentElement.className,
    theme: document.documentElement.dataset['theme'] ?? '',
  }));
};

const OFF_TARGET = { x: 2, y: 2 };

/* Press, then release over the control: the action runs on the up event only. */
const pressAndRelease = async (page: Page, selector: string) => {
  const target = page.locator(selector).first();
  await target.scrollIntoViewIfNeeded();
  const box = (await target.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  const idle = await pageState(page);

  await page.mouse.move(x, y);
  await page.mouse.down();
  const whileDown = await pageState(page);

  await page.mouse.up();
  return { idle, whileDown };
};

/* Press on the control, move off it, release: nothing runs, so a press can be aborted. */
const pressAndAbort = async (page: Page, selector: string) => {
  const target = page.locator(selector).first();
  await target.scrollIntoViewIfNeeded();
  const box = (await target.boundingBox())!;
  const idle = await pageState(page);

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(OFF_TARGET.x, OFF_TARGET.y, { steps: 4 });
  await page.mouse.up();
  return { idle, afterUp: await pageState(page) };
};

const CONTROLS: readonly {
  name: string;
  route: string;
  selector: string;
  phone?: boolean;
}[] = [
  {
    name: 'the theme switch',
    route: '/',
    selector: 'header .theme-switch',
  },
  {
    name: 'the mobile menu button',
    route: '/',
    selector: '[data-menu-trigger]',
    phone: true,
  },
  {
    name: 'a blog card',
    route: '/blog/',
    selector: '.card:has(.card-link) p',
  },
];

test.describe('single-pointer actions run on release (SC 2.5.2)', () => {
  for (const { name, route, selector, phone } of CONTROLS) {
    test.describe(name, () => {
      test.beforeEach(async ({ page }) => {
        if (phone) await page.setViewportSize(PHONE_VIEWPORT);
        await gotoSettled(page, route);
      });

      test('does nothing while the button is held down', async ({ page }) => {
        const { idle, whileDown } = await pressAndRelease(page, selector);
        expect(whileDown, 'the press acted on the down event').toEqual(idle);
        await expect
          .poll(() => pageState(page).catch(() => 'navigating'), {
            message: 'the release did not run the action',
          })
          .not.toEqual(idle);
      });

      test('does nothing when the press moves off before release', async ({
        page,
      }) => {
        const { idle, afterUp } = await pressAndAbort(page, selector);
        expect(afterUp, 'a press moved off the control still acted').toEqual(
          idle,
        );
      });
    });
  }

  test('Let It Fall waits for the release', async ({ page }) => {
    await gotoSettled(page, '/');
    const button = page.locator('[data-let-it-fall]');
    const status = page.locator('[data-let-it-fall-status]');
    await button.scrollIntoViewIfNeeded();
    await expect(button).toBeVisible();
    const box = (await button.boundingBox())!;
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    const settle = () =>
      page.evaluate(() => new Promise(requestAnimationFrame));

    await page.mouse.move(x, y);
    await page.mouse.down();
    await settle();
    await expect(status, 'Let It Fall started on the down event').toHaveText(
      '',
    );
    await page.mouse.move(OFF_TARGET.x, OFF_TARGET.y, { steps: 4 });
    await page.mouse.up();
    await settle();
    await expect(
      status,
      'a press moved off Let It Fall still started it',
    ).toHaveText('');

    await page.mouse.click(x, y);
    await expect(status, 'a click did not start Let It Fall').not.toHaveText(
      '',
    );
  });
});
