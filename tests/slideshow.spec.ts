import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from './test';
import { gotoSettled } from './settle';
import { deckOf, NO_TALK, TALK_ROUTES, TALKS_DIR } from './routes';
import { NARROW_WIDTH } from './wcag';
import { DECK_READY_TIMEOUT_MS } from '../src/lib/deck-ready';
import { DECK_FILE, splitDeck } from '../src/lib/slides';

/** src/scripts/slideshow.ts driven by buttons, keys, slide links, full screen, print, and without JavaScript. */

const ROUTE = TALK_ROUTES[0] ?? '';

const deckSlides = () => {
  const file = join(TALKS_DIR, deckOf(ROUTE), DECK_FILE);
  return splitDeck(readFileSync(file, 'utf8'), file);
};

/** The part in effect at a slide: the last `part:` setting at or before it. */
const partAt = (slide: number): string | undefined =>
  deckSlides()
    .slice(0, slide)
    .map((s) => /^part:\s*(.+)$/m.exec(s.frontmatter ?? '')?.[1])
    .filter((part): part is string => part !== undefined)
    .at(-1)
    ?.trim()
    .replace(/^'(.*)'$/, '$1');

const titleAt = (slide: number): string => deckSlides()[slide - 1]!.title;

const visible = (page: Page) => page.locator('.slide:visible');
// Counted before "hidden" is asserted, so a renamed nav cannot pass on nothing.
const slideControls = (page: Page) =>
  page.getByRole('navigation', { name: 'Slides', includeHidden: true });
const next = (page: Page) => page.getByRole('button', { name: 'Next' });
const previous = (page: Page) => page.getByRole('button', { name: 'Previous' });

/** A narrow phone, where a slide can run past the screen and the bar sits below it. */
const PHONE = { width: NARROW_WIDTH, height: 700 };

/** 400% zoom, where a slide is taller than the screen. */
const ZOOMED_SLIDE = { width: NARROW_WIDTH, height: 400 };

/** The tightest projected size measured (1024x768 to 1920x1080). */
const PROJECTOR = { width: 1280, height: 720 };

const open = async (page: Page, hash = '') => {
  await gotoSettled(page, `${ROUTE}/${hash}`);
  await page.waitForSelector('[data-deck-ready]');
};

test.describe('the talk slideshow', () => {
  test.skip(!ROUTE, NO_TALK);

  test('without JavaScript every slide is on the page and no control is', async ({
    browser,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    try {
      const page = await context.newPage();
      await page.goto(`${ROUTE}/`);
      const slides = page.locator('.slide');
      const count = await slides.count();
      expect(count).toBeGreaterThan(1);
      await expect(page.locator('.slide:visible')).toHaveCount(count);
      await expect(slideControls(page)).toHaveCount(1);
      await expect(slideControls(page)).toBeHidden();
    } finally {
      await context.close();
    }
  });

  test('a deck script that never loads leaves every slide on the page and no control', async ({
    page,
  }) => {
    await page.route('**/_astro/_deck_*.js', (route) => route.abort());
    await page.clock.install();
    await page.goto(`${ROUTE}/`);
    const slides = page.locator('.slide');
    const count = await slides.count();
    await expect(visible(page)).toHaveCount(1);
    await page.clock.fastForward(DECK_READY_TIMEOUT_MS);
    await expect(visible(page)).toHaveCount(count);
    await expect(slideControls(page)).toBeHidden();
  });

  test('one slide at a time, starting on the cover', async ({ page }) => {
    await open(page);
    await expect(visible(page)).toHaveCount(1);
    await expect(visible(page)).toHaveId('slide-1');
    await expect(previous(page)).toHaveAttribute('aria-disabled', 'true');
    expect(new URL(page.url()).hash, 'the cover needs no address').toBe('');
  });

  test('the focused control stays on screen when a slide turns on a phone', async ({
    page,
  }) => {
    await page.setViewportSize(PHONE);
    await open(page);

    for (const id of ['slide-2', 'slide-3', 'slide-4']) {
      await next(page).focus();
      await page.keyboard.press('Enter');
      await expect(visible(page)).toHaveId(id);
      const ring = await page.evaluate(() => {
        const focused = document.activeElement!;
        const style = getComputedStyle(focused);
        const reach =
          parseFloat(style.outlineWidth) + parseFloat(style.outlineOffset);
        const r = focused.getBoundingClientRect();
        return { top: r.top - reach, bottom: r.bottom + reach };
      });
      expect(
        ring.top >= 0 && ring.bottom <= PHONE.height,
        `the focus ring is off screen after turning to ${id} (SC 2.4.7).`,
      ).toBe(true);
    }
  });

  test('Next moves on, keeps focus, and says where it went', async ({
    page,
  }) => {
    await open(page);
    await next(page).focus();
    await page.keyboard.press('Enter');
    await expect(visible(page)).toHaveId('slide-2');
    await expect(next(page)).toBeFocused();
    await expect(page.locator('[data-deck-status]')).toHaveText(
      new RegExp(`^Slide 2 of \\d+: ${titleAt(2)}$`),
    );
    await expect(page.locator('[data-deck-count]')).toHaveText(/^2 \/ \d+$/);
    expect(new URL(page.url()).hash).toBe('#slide-2');
    await expect(previous(page)).not.toHaveAttribute('aria-disabled');
  });

  test('the arrow keys, Page Up and Down, Home and End move between slides', async ({
    page,
  }) => {
    await open(page);
    const last = await page.locator('.slide').count();
    await page.keyboard.press('ArrowRight');
    await expect(visible(page)).toHaveId('slide-2');
    await page.keyboard.press('PageDown');
    await expect(visible(page)).toHaveId('slide-3');
    await page.keyboard.press('ArrowLeft');
    await expect(visible(page)).toHaveId('slide-2');
    await page.keyboard.press('PageUp');
    await expect(visible(page)).toHaveId('slide-1');
    await page.keyboard.press('End');
    await expect(visible(page)).toHaveId(`slide-${last}`);
    await expect(next(page)).toHaveAttribute('aria-disabled', 'true');
    await next(page).click({ force: true });
    await expect(visible(page), 'Next past the end does nothing').toHaveId(
      `slide-${last}`,
    );
    await page.keyboard.press('Home');
    await expect(visible(page)).toHaveId('slide-1');
  });

  test('keys pressed outside the deck keep their own meaning', async ({
    page,
  }) => {
    await open(page);
    await page.locator('footer a').first().focus();
    await page.keyboard.press('End');
    await page.keyboard.press('ArrowRight');
    await expect(visible(page)).toHaveId('slide-1');
  });

  const MAX_PAGE_PRESSES = 10;
  test('Page Down scrolls a slide taller than the screen before it turns', async ({
    page,
  }) => {
    await page.setViewportSize(ZOOMED_SLIDE);
    await open(page, '#slide-2');
    const runsPast = () =>
      page.evaluate(
        () =>
          document
            .querySelector('.slide[data-current]')!
            .getBoundingClientRect().bottom > window.innerHeight,
      );
    expect(await runsPast(), 'slide 2 fits, so this measures nothing').toBe(
      true,
    );
    for (
      let press = 0;
      press < MAX_PAGE_PRESSES && (await runsPast());
      press++
    ) {
      await page.keyboard.press('PageDown');
      await expect(visible(page), 'turned before its end was in view').toHaveId(
        'slide-2',
      );
    }
    expect(await runsPast(), 'Page Down never reached the end of slide 2').toBe(
      false,
    );
    await page.keyboard.press('PageDown');
    await expect(visible(page)).toHaveId('slide-3');
  });

  test('Page Up scrolls a slide taller than the screen back to its start before it turns', async ({
    page,
  }) => {
    await page.setViewportSize(ZOOMED_SLIDE);
    await open(page, '#slide-2');
    await page.evaluate(() =>
      window.scrollTo({
        top: document.documentElement.scrollHeight,
        behavior: 'instant',
      }),
    );
    /* Hidden above the screen or under the sticky header, which scroll-padding-top clears. */
    const startHidden = () =>
      page.evaluate(
        () =>
          document
            .querySelector('.slide[data-current]')!
            .getBoundingClientRect().top <
          (parseFloat(
            getComputedStyle(document.documentElement).scrollPaddingTop,
          ) || 0),
      );
    expect(
      await startHidden(),
      'the start of slide 2 is in view, so this measures nothing',
    ).toBe(true);
    for (
      let press = 0;
      press < MAX_PAGE_PRESSES && (await startHidden());
      press++
    ) {
      await page.keyboard.press('PageUp');
      await expect(
        visible(page),
        'turned before its start was in view',
      ).toHaveId('slide-2');
    }
    expect(
      await startHidden(),
      'Page Up never reached the start of slide 2',
    ).toBe(false);
    await page.keyboard.press('PageUp');
    await expect(visible(page)).toHaveId('slide-1');
  });

  test('a link to one slide opens on it', async ({ page }) => {
    await open(page, '#slide-11');
    await expect(visible(page)).toHaveId('slide-11');
    await expect(page.locator('[data-deck-part]')).toHaveText(partAt(11)!);
    await expect(visible(page).locator('h2')).toBeInViewport();
  });

  test('focus inside a slide that leaves moves to the new heading', async ({
    page,
  }) => {
    await open(page, '#slide-11');
    await visible(page).getByRole('link').first().focus();
    await page.keyboard.press('ArrowRight');
    await expect(visible(page)).toHaveId('slide-12');
    await expect(visible(page).locator('h2')).toBeFocused();
  });

  test('print shows every slide and nothing else, so the PDF has one page per slide', async ({
    page,
  }) => {
    await open(page);
    await page.emulateMedia({ media: 'print' });
    const count = await page.locator('.slide').count();
    await expect(page.locator('.slide:visible')).toHaveCount(count);
    await expect(slideControls(page)).toHaveCount(1);
    await expect(slideControls(page)).toBeHidden();
    await expect(page.locator('main > :not(.deck):visible')).toHaveCount(0);
  });

  // A room cannot scroll a projected slide. 1280x720 is the tightest of the
  // measured sizes (1024x768 to 1920x1080).
  test('every slide fits a 1280x720 screen in full screen', async ({
    page,
  }) => {
    await page.setViewportSize(PROJECTOR);
    await open(page);
    await page.getByRole('button', { name: 'Full Screen' }).click();
    await page.waitForFunction(() => document.fullscreenElement !== null);
    const ids = await page.$$eval('.slide[id]', (all) => all.map((s) => s.id));
    expect(ids.length, 'the deck has no slides').toBeGreaterThan(1);
    const over: string[] = [];
    for (const id of ids) {
      await expect(
        visible(page),
        'ArrowRight did not reach the slide',
      ).toHaveId(id);
      const overflow = await page.evaluate(
        () =>
          document.querySelector('[data-deck-bar]')!.getBoundingClientRect()
            .bottom - innerHeight,
      );
      if (overflow > 0.5) {
        over.push(`${id} +${overflow}px`);
      }
      await page.keyboard.press('ArrowRight');
    }
    expect(over, 'slides that run past the screen').toEqual([]);
  });
});
