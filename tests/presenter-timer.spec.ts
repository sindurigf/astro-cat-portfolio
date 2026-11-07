import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { expect, test, type Page } from './test';
import { ENGINE_INVARIANT } from './tags';

/**
 * Function and accessibility (SC 4.1.3): the presenter timer counts only while
 * running, names its action, and is no live region. The presenter route exists
 * under `astro dev` only, so the script runs against the markup it queries.
 */

const TIMER_SCRIPT = ts.transpileModule(
  readFileSync('src/scripts/presenter-timer.ts', 'utf8'),
  { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
).outputText;

const START_MS = 1000;
const SECOND_MS = 1000;
const COUNTED_SECONDS = 3;
const PAUSED_SECONDS = 5;

const MARKUP = `<button type="button" data-timer-toggle>Start Timer</button>
<time data-timer datetime="PT0S">0:00</time>`;

const openTimer = async (page: Page) => {
  await page.clock.install({ time: 0 });
  await page.setContent(MARKUP);
  await page.clock.pauseAt(START_MS);
  await page.addScriptTag({ type: 'module', content: TIMER_SCRIPT });
};

const toggle = (page: Page, name: 'Start Timer' | 'Pause Timer') =>
  page.getByRole('button', { name });
const display = (page: Page) => page.locator('[data-timer]');

test.describe('presenter timer', ENGINE_INVARIANT, () => {
  test('counts seconds while running and names the next action', async ({
    page,
  }) => {
    await openTimer(page);
    await toggle(page, 'Start Timer').click();
    await page.clock.runFor(COUNTED_SECONDS * SECOND_MS);

    await expect(display(page)).toHaveText('0:03');
    await expect(display(page)).toHaveAttribute('datetime', 'PT3S');
    await expect(toggle(page, 'Pause Timer')).toBeVisible();
    await expect(toggle(page, 'Pause Timer')).not.toHaveAttribute(
      'aria-pressed',
      /.*/,
    );
  });

  test('freezes on pause and resumes from the frozen time', async ({
    page,
  }) => {
    await openTimer(page);
    await toggle(page, 'Start Timer').click();
    await page.clock.runFor(COUNTED_SECONDS * SECOND_MS);
    await toggle(page, 'Pause Timer').click();
    await page.clock.runFor(PAUSED_SECONDS * SECOND_MS);

    await expect(display(page)).toHaveText('0:03');
    await expect(toggle(page, 'Start Timer')).toBeVisible();

    await toggle(page, 'Start Timer').click();
    await page.clock.runFor(SECOND_MS);
    await expect(display(page)).toHaveText('0:04');
  });

  test('is no live region, so a screen reader is not read every second', async ({
    page,
  }) => {
    await openTimer(page);
    await toggle(page, 'Start Timer').click();
    await page.clock.runFor(SECOND_MS);

    for (const element of [
      display(page),
      page.locator('[data-timer-toggle]'),
    ]) {
      await expect(element).not.toHaveAttribute('aria-live', /.*/);
      await expect(element).not.toHaveAttribute('role', /.*/);
    }

    const view = readFileSync('src/presenter/presenter.astro', 'utf8');
    const timeTag = /<time\b[^>]*data-timer[^>]*>/.exec(view)?.[0];
    expect(timeTag, 'presenter.astro has no <time data-timer>').toBeDefined();
    expect(timeTag, 'the timer is declared as a live region').not.toMatch(
      /aria-live|role=/,
    );
  });
});
