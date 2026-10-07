import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Browser, type Page } from './test';
import { gotoSettled } from './settle';
import { deckOf, NO_TALK, TALK_ROUTES, TALKS_DIR } from './routes';
import { NARROW_WIDTH, REFLOW_VIEWPORT, TEXT_SPACING_OVERRIDE } from './wcag';
import { NON_TEXT, PAGE_HELPERS } from './contrast';
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

/** Presses before a scroll-first test gives up on reaching the slide's end. */
const MAX_PAGE_PRESSES = 10;

const open = async (page: Page, hash = '') => {
  await gotoSettled(page, `${ROUTE}/${hash}`);
  await page.waitForSelector('[data-deck-ready]');
};

/* By attribute, not role: the bar that holds it is hidden in full screen. */
const title = (page: Page) => visible(page).locator('.slide-title');

const fullScreenButton = (page: Page) => page.locator('[data-deck-fullscreen]');

/* WebKit sets fullscreenElement before fullscreenchange, so wait for the focus that event moves. */
const enterFullScreen = async (page: Page) => {
  await fullScreenButton(page).click();
  await page.waitForFunction(
    () => document.fullscreenElement?.matches('[data-deck]') === true,
  );
  await expect(
    page.locator('.slide[data-current] .slide-title'),
    'entering full screen did not move focus to the slide',
  ).toBeFocused();
};

/* PROJECTOR at 200% zoom, in CSS px, as failed-images.spec.ts models it. */
const ZOOMED_PROJECTOR = { width: 640, height: 360 };

/* Headless Firefox's full screen takes its 1366x768 screen whatever the viewport or `screen` option. */
const skipUnsizedFullScreen = (browserName: string) =>
  test.skip(
    browserName === 'firefox',
    'Firefox full screen ignores the test viewport, so the size under test is not the one measured.',
  );

const ids = (page: Page) =>
  page.$$eval('.slide[id]', (all) => all.map((slide) => slide.id));

/** Slides whose content is wider than the frame, so text spacing or size pushed it sideways. */
const sidewaysOverflow = async (page: Page): Promise<string[]> => {
  const all = await ids(page);
  expect(all.length, 'the deck has no slides').toBeGreaterThan(1);
  const over: string[] = [];
  for (const id of all) {
    await expect(visible(page), 'ArrowRight did not reach the slide').toHaveId(
      id,
    );
    const box = await page.evaluate(() => {
      const slide = document.querySelector<HTMLElement>(
        '.slide[data-current]',
      )!;
      return {
        id: slide.id,
        overflowY: getComputedStyle(slide).overflowY,
        extra: slide.scrollWidth - slide.clientWidth,
      };
    });
    expect(
      box.overflowY,
      `${box.id} cannot scroll, so taller content is cut off`,
    ).toBe('auto');
    if (box.extra > 1) over.push(`${box.id} +${box.extra}px`);
    if (id !== all.at(-1)) await page.keyboard.press('ArrowRight');
  }
  return over;
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

  test('a deck script that throws after it is ready leaves every slide on the page and no control', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      Element.prototype.scrollIntoView = () => {
        throw new Error('scrollIntoView failed');
      };
    });
    await page.goto(`${ROUTE}/#slide-3`);
    const count = await page.locator('.slide').count();
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

  test('Space, Enter and Down do not turn the slide outside full screen', async ({
    page,
  }) => {
    await open(page);
    await page.keyboard.press('Space');
    await page.keyboard.press('Enter');
    await page.keyboard.press('ArrowDown');
    await expect(visible(page)).toHaveId('slide-1');
  });
});

test.describe('the talk slideshow in full screen', () => {
  test.skip(!ROUTE, NO_TALK);

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(PROJECTOR);
  });

  test('shows the deck alone, one 16:9 slide, no controls, focus on its heading', async ({
    page,
  }) => {
    await open(page);
    await enterFullScreen(page);
    await expect(visible(page)).toHaveCount(1);
    await expect(slideControls(page)).toBeHidden();
    await expect(title(page)).toBeFocused();
    await expect(fullScreenButton(page)).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    const ratio = await visible(page).evaluate((slide) => {
      const box = slide.getBoundingClientRect();
      return box.width / box.height;
    });
    expect(ratio, 'the slide is not 16:9').toBeCloseTo(16 / 9, 1);
  });

  test('leaving full screen shows the controls and returns focus to Full Screen', async ({
    page,
  }) => {
    await open(page);
    await enterFullScreen(page);
    await page.evaluate(() => document.exitFullscreen());
    await expect(fullScreenButton(page)).toBeFocused();
    await expect(fullScreenButton(page)).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    await expect(slideControls(page)).toBeVisible();
  });

  test('Space, Enter, Down, Right and Page Down go forward one slide; Shift+Space, Up, Left and Page Up go back', async ({
    page,
  }) => {
    await open(page);
    await enterFullScreen(page);
    let at = 1;
    for (const key of [
      'Space',
      'Enter',
      'ArrowDown',
      'ArrowRight',
      'PageDown',
    ]) {
      await page.keyboard.press(key);
      at += 1;
      await expect(visible(page), `${key} did not move one slide on`).toHaveId(
        `slide-${at}`,
      );
    }
    for (const key of ['Shift+Space', 'ArrowUp', 'ArrowLeft', 'PageUp']) {
      await page.keyboard.press(key);
      at -= 1;
      await expect(
        visible(page),
        `${key} did not move one slide back`,
      ).toHaveId(`slide-${at}`);
    }
    await expect(title(page), 'focus did not follow the slide').toBeFocused();
    await expect(
      page.locator('[data-deck-status]'),
      'the live region repeats the focused heading',
    ).toHaveText('');
  });

  for (const theme of ['dark', 'light'] as const) {
    test(`in ${theme} mode a slide reached by keyboard has a ring around its card, at least 3:1 against the card and the page`, async ({
      page,
    }) => {
      await page.addInitScript((value) => {
        localStorage.setItem('theme', value);
      }, theme);
      await open(page);
      await enterFullScreen(page);
      await page.keyboard.press('Space');
      await expect(title(page)).toBeFocused();
      const ring = (await page.evaluate(`(() => {
        ${PAGE_HELPERS}
        const slide = document.querySelector('.slide[data-current]');
        const deck = document.querySelector('[data-deck]');
        const card = getComputedStyle(slide);
        const color = parse(card.outlineColor);
        return {
          style: card.outlineStyle,
          width: parseFloat(card.outlineWidth),
          headingAlpha: parse(getComputedStyle(slide.querySelector('.slide-title')).outlineColor).a,
          onCard: ratio(color, parse(card.backgroundColor)),
          onPage: ratio(color, parse(getComputedStyle(deck).backgroundColor)),
        };
      })()`)) as {
        style: string;
        width: number;
        headingAlpha: number;
        onCard: number;
        onPage: number;
      };
      expect(ring.style, 'the focused slide has no ring (SC 2.4.7)').toBe(
        'solid',
      );
      expect(ring.width, 'the ring has no width').toBeGreaterThan(0);
      expect(
        ring.headingAlpha,
        'the heading draws a second ring inside the card',
      ).toBe(0);
      expect(
        ring.onCard,
        'the ring is under 3:1 against the card (SC 1.4.11)',
      ).toBeGreaterThanOrEqual(NON_TEXT);
      expect(
        ring.onPage,
        'the ring is under 3:1 against the page (SC 1.4.11)',
      ).toBeGreaterThanOrEqual(NON_TEXT);
    });
  }

  test('Space on a focused link does not turn the slide', async ({ page }) => {
    await open(page, '#slide-11');
    await enterFullScreen(page);
    await visible(page).getByRole('link').first().focus();
    await page.keyboard.press('Space');
    await expect(visible(page)).toHaveId('slide-11');
  });

  test('Enter on a focused link follows it and does not turn the slide', async ({
    page,
  }) => {
    await open(page, '#slide-11');
    await enterFullScreen(page);
    const link = visible(page).getByRole('link').first();
    await link.evaluate((element) => {
      element.addEventListener('click', (event) => {
        event.preventDefault();
        element.dataset.followed = '';
      });
    });
    await link.focus();
    await page.keyboard.press('Enter');
    await expect(link, 'Enter did not reach the link').toHaveAttribute(
      'data-followed',
      '',
    );
    await expect(visible(page)).toHaveId('slide-11');
  });

  // The presenter route is dev-only; its deck carries `.presenter`, which this adds before the script runs.
  test('the presenter deck keeps its controls and their keys in full screen', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      new MutationObserver((_, observer) => {
        const deck = document.querySelector('[data-deck]');
        if (!deck) return;
        deck.classList.add('presenter');
        observer.disconnect();
      }).observe(document, { childList: true, subtree: true });
    });
    await open(page);
    await fullScreenButton(page).click();
    await page.waitForFunction(
      () => document.fullscreenElement?.matches('[data-deck]') === true,
    );
    await expect(slideControls(page)).toBeVisible();
    await expect(
      fullScreenButton(page),
      'focus left the presenter controls',
    ).toBeFocused();
    await next(page).focus();
    await page.keyboard.press('Space');
    await expect(visible(page), 'Space did not press Next').toHaveId('slide-2');
    await page.keyboard.press('Enter');
    await expect(visible(page), 'Enter did not press Next').toHaveId('slide-3');
    await expect(next(page)).toBeFocused();
  });

  test('holding Space turns one slide', async ({ page }) => {
    await open(page);
    await enterFullScreen(page);
    await page.keyboard.down('Space');
    await page.keyboard.down('Space');
    await page.keyboard.down('Space');
    await page.keyboard.up('Space');
    await expect(visible(page)).toHaveId('slide-2');
  });

  test('the pointer hides when still and comes back when it moves', async ({
    page,
  }) => {
    await open(page);
    await page.clock.install();
    await enterFullScreen(page);
    const cursor = () =>
      title(page).evaluate((element) => getComputedStyle(element).cursor);
    await page.mouse.move(100, 100);
    await page.clock.runFor(5_000);
    await expect
      .poll(cursor, 'the pointer stays on a still slide')
      .toBe('none');
    await page.mouse.move(200, 200);
    await expect
      .poll(cursor, 'the pointer stays hidden after it moves')
      .not.toBe('none');
  });

  // A room cannot scroll a projected slide. 1280x720 is the tightest of the
  // measured sizes (1024x768 to 1920x1080).
  test('every slide fits its frame on a 1280x720 screen', async ({
    page,
    browserName,
  }) => {
    skipUnsizedFullScreen(browserName);
    await open(page);
    await enterFullScreen(page);
    const all = await ids(page);
    expect(all.length, 'the deck has no slides').toBeGreaterThan(1);
    const over: string[] = [];
    for (const id of all) {
      await expect(
        visible(page),
        'ArrowRight did not reach the slide',
      ).toHaveId(id);
      const overflow = await visible(page).evaluate(
        (slide) => slide.scrollHeight - slide.clientHeight,
      );
      if (overflow > 1) over.push(`${id} +${overflow}px`);
      await page.keyboard.press('ArrowRight');
    }
    expect(over, 'slides that run past their frame').toEqual([]);
  });

  test('the SC 1.4.12 text spacing cuts nothing off', async ({ page }) => {
    await open(page);
    await enterFullScreen(page);
    await page.addStyleTag({ content: TEXT_SPACING_OVERRIDE });
    expect(
      await sidewaysOverflow(page),
      'slides wider than their frame',
    ).toEqual([]);
  });

  // Asserts no sideways clipping only, not 2x text: ACCESSIBILITY.md section 7 records the SC 1.4.4 gap.
  test('at 200% zoom no slide is cut off sideways', async ({
    page,
    browserName,
  }) => {
    skipUnsizedFullScreen(browserName);
    await page.setViewportSize(ZOOMED_PROJECTOR);
    await open(page);
    await enterFullScreen(page);
    expect(
      await sidewaysOverflow(page),
      'slides wider than their frame',
    ).toEqual([]);
  });

  test('at 200% zoom, Space scrolls a slide taller than its frame before it turns, and Shift+Space back', async ({
    page,
    browserName,
  }) => {
    skipUnsizedFullScreen(browserName);
    await page.setViewportSize(ZOOMED_PROJECTOR);
    await open(page);
    await enterFullScreen(page);
    const position = () =>
      visible(page).evaluate((slide) => ({
        id: slide.id,
        atEnd: slide.scrollTop + slide.clientHeight >= slide.scrollHeight - 1,
        atStart: slide.scrollTop === 0,
      }));
    const count = await page.locator('.slide').count();
    for (let turn = 1; turn < count && (await position()).atEnd; turn++) {
      await page.keyboard.press('ArrowRight');
    }
    const { id, atEnd } = await position();
    expect(atEnd, 'every slide fits, so this measures nothing').toBe(false);
    const after = await page.evaluate(
      (slide) => document.getElementById(slide)!.nextElementSibling!.id,
      id,
    );
    const pressUntil = async (key: string, edge: 'atEnd' | 'atStart') => {
      for (
        let press = 0;
        press < MAX_PAGE_PRESSES && !(await position())[edge];
        press++
      ) {
        await page.keyboard.press(key);
        await expect(
          visible(page),
          `${key} turned before the slide's edge was in view`,
        ).toHaveId(id);
      }
      expect(
        (await position())[edge],
        `${key} never reached the edge of ${id}`,
      ).toBe(true);
    };
    await pressUntil('Space', 'atEnd');
    await pressUntil('Shift+Space', 'atStart');
    await pressUntil('Space', 'atEnd');
    await page.keyboard.press('Space');
    await expect(visible(page)).toHaveId(after);
  });
});

/** Body text doubles at 200% below 1920, where `--text-body` caps (ACCESSIBILITY.md section 7). */
const BODY_WIDTHS = [390, 1000, 1280] as const;
/** Titles fit the screen, so narrower starts need more zoom; section 7 lists the measured levels. */
const TITLE_ZOOM = [
  { width: 390, zoom: 5 },
  { width: 1000, zoom: 5 },
  { width: 1280, zoom: 2 },
  { width: 1920, zoom: 2 },
] as const;
const PAGE_HEIGHT = 900;
/** Rounding of fractional px at fractional device scale. */
const RATIO_TOLERANCE = 0.01;
const DOUBLE = 2;
/** reflow.spec.ts's narrowest width: 320px less a classic scrollbar. */
const SLIDE_PHONE = { width: NARROW_WIDTH, height: PAGE_HEIGHT };

/* Device px of the second slide's title and first body line, at `zoom` modeled as viewport / zoom at zoom x device scale. */
const deviceSizes = async (browser: Browser, width: number, zoom: number) => {
  const context = await browser.newContext({
    viewport: {
      width: Math.round(width / zoom),
      height: Math.round(PAGE_HEIGHT / zoom),
    },
    deviceScaleFactor: zoom,
    baseURL: test.info().project.use.baseURL,
  });
  try {
    const page = await context.newPage();
    await open(page, '#slide-2');
    const sizes = await visible(page).evaluate((slide) => {
      const size = (selector: string) =>
        parseFloat(getComputedStyle(slide.querySelector(selector)!).fontSize);
      return {
        title: size('.slide-title'),
        body: size('.slide-body :is(p, li)'),
      };
    });
    return { title: sizes.title * zoom, body: sizes.body * zoom };
  } finally {
    await context.close();
  }
};

test.describe('the talk slideshow on the page at 200% zoom', () => {
  test.skip(!ROUTE, NO_TALK);

  for (const { width, zoom } of TITLE_ZOOM) {
    test(`from ${width}px, slide titles reach 2x by ${zoom * 100}% page zoom (SC 1.4.4)`, async ({
      browser,
    }) => {
      const unzoomed = await deviceSizes(browser, width, 1);
      const zoomed = await deviceSizes(browser, width, zoom);
      expect(
        zoomed.title / unzoomed.title,
        'the slide title grows less than 2x',
      ).toBeGreaterThanOrEqual(DOUBLE - RATIO_TOLERANCE);
    });
  }

  for (const width of BODY_WIDTHS) {
    test(`from ${width}px, slide text doubles at 200% (SC 1.4.4)`, async ({
      browser,
    }) => {
      const unzoomed = await deviceSizes(browser, width, 1);
      const zoomed = await deviceSizes(browser, width, DOUBLE);
      expect(
        zoomed.body / unzoomed.body,
        'the slide text grows less than 2x',
      ).toBeGreaterThanOrEqual(DOUBLE - RATIO_TOLERANCE);
    });
  }

  // Hidden slides included: reflow.spec.ts measures only the slide on screen.
  test('every word of every slide title fits its slide at 305px, so none is cut without a hyphen', async ({
    page,
  }) => {
    await page.setViewportSize(SLIDE_PHONE);
    await open(page);
    const tooWide = await page.evaluate(() => {
      const out: string[] = [];
      const slides = [...document.querySelectorAll<HTMLElement>('.slide')];
      for (const slide of slides) {
        slides.forEach((s) => s.toggleAttribute('data-current', s === slide));
        const title = slide.querySelector<HTMLElement>('.slide-title')!;
        const style = getComputedStyle(title);
        const probe = document.createElement('span');
        Object.assign(probe.style, {
          position: 'absolute',
          whiteSpace: 'nowrap',
          font: style.font,
          letterSpacing: style.letterSpacing,
          textTransform: style.textTransform,
        });
        document.body.append(probe);
        const words = (title.textContent ?? '').split(/[\s-]+/).filter(Boolean);
        for (const word of words) {
          // A break at a soft hyphen paints a hyphen on the leading part.
          const parts = word.split('\u00ad');
          parts.forEach((part, i) => {
            probe.textContent = i < parts.length - 1 ? `${part}-` : part;
            const width = probe.getBoundingClientRect().width;
            if (width > title.clientWidth + 0.5) {
              out.push(
                `${slide.id} "${probe.textContent}" ${width.toFixed(0)}px in ${title.clientWidth}px`,
              );
            }
          });
        }
        probe.remove();
      }
      return out;
    });
    expect(
      tooWide,
      'slide title words wider than their slide at 305px',
    ).toEqual([]);
  });
  // Hyphens are forced off: hyphenation dictionaries vary by engine, so the fit must come from overflow-wrap.
  test('every slide title fits 320px without sideways scrolling (SC 1.4.10)', async ({
    page,
  }) => {
    await page.setViewportSize(REFLOW_VIEWPORT);
    await open(page);
    await page.addStyleTag({
      content: '.slide-title { hyphens: manual !important; }',
    });
    const count = await page.locator('.slide').count();
    const over: string[] = [];
    for (let at = 1; at <= count; at++) {
      await expect(visible(page)).toHaveId(`slide-${at}`);
      const extra = await visible(page).evaluate((slide) => {
        const title = slide.querySelector<HTMLElement>('.slide-title')!;
        return Math.max(
          document.documentElement.scrollWidth - innerWidth,
          title.scrollWidth - title.clientWidth,
        );
      });
      if (extra > 0) over.push(`slide-${at} +${extra}px`);
      await page.keyboard.press('ArrowRight');
    }
    expect(over, 'slides whose title scrolls sideways at 320px').toEqual([]);
  });
});
