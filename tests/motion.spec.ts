import { expect, test, type Page } from './test';
import { gotoSettled, sweepTimeout } from './settle';
import { readFileSync } from 'node:fs';
import { builtPages, ROUTES } from './routes';
import { PHONE_VIEWPORT } from './wcag';
import { NODE } from './tags';

/**
 * SC 2.2.2 and performance for the homepage motion (src/scripts/home-motion.ts):
 * the cat, the meadow's stems and the cat toys share one frame loop. Tests
 * pump frames and read the transforms the loop writes: real frames under load
 * are too few to count.
 */
const HOME_ROUTE = '/';
const PAUSE_NAME = /^pause animations$/i;
const PLAY_NAME = /^play animations$/i;
const ANY_PAUSE_NAME = /^(pause|play) animations$/i;

/** How long the loop has to stop after the motion leaves the viewport. */
const STOP_TIMEOUT_MS = 5_000;

/** The frame-rate test offers the loop one second of frames at this rate. */
const PUMP_HZ = 60;
const PUMP_FRAMES = 60;

/** `MAX_FRAME_RATE` in home-motion.ts is 30; one over allows for where the first drawn frame falls. */
const DRAWN_MAX = 31;

/** A view short enough that the footer alone fills it once scrolled to the end. */
const SHORT_VIEWPORT = { width: 1280, height: 360 };

const POINTER_VIEWPORTS = [
  { ...PHONE_VIEWPORT, note: 'phone' },
  { width: 1280, height: 720, note: 'desktop' },
] as const;

const motion = (page: Page) => page.locator('[data-home-band]');

/*
 * `cancelAnimationFrame` must really remove the callback: `stop()` in
 * motion-loop.ts relies on it. `pumpFrame` returns how many callbacks it ran.
 */
const installFramePump = (page: Page) =>
  page.addInitScript(() => {
    const queue = new Map<number, FrameRequestCallback>();
    let nextId = 0;
    window.requestAnimationFrame = (callback: FrameRequestCallback): number => {
      nextId += 1;
      queue.set(nextId, callback);
      return nextId;
    };
    window.cancelAnimationFrame = (id: number): void => {
      queue.delete(id);
    };
    (window as unknown as { pumpFrame: (now: number) => number }).pumpFrame = (
      now,
    ) => {
      const due = [...queue.entries()];
      for (const [id] of due) queue.delete(id);
      for (const [, callback] of due) callback(now);
      return due.length;
    };
  });

/* Runs any frame queued before a stop, so later counts can assert exactly zero. */
const drainPendingFrame = (page: Page) =>
  page.evaluate(() =>
    (window as unknown as { pumpFrame: (now: number) => number }).pumpFrame(
      performance.now(),
    ),
  );

/** Pumps a second of frames; returns how many changed the drawing and how many callbacks ran. */
const pumpSecond = (page: Page) =>
  page.evaluate(
    ({ hz, frames }) => {
      const pump = (window as unknown as { pumpFrame: (now: number) => number })
        .pumpFrame;
      const signature = (): string =>
        [
          ...document.querySelectorAll<HTMLElement>(
            '[data-home-hopper], .home-faller-spin, [data-home-prop], .home-prop-face',
          ),
        ]
          .map((el) => `${el.style.transform}/${el.style.rotate}`)
          .join('|');
      /* Pumped time runs ahead of the real clock; resuming behind it would read as frames too close together. */
      const clock = window as unknown as { pumpedTo?: number };
      let last = signature();
      let changes = 0;
      let callbacks = 0;
      let now = Math.max(performance.now(), clock.pumpedTo ?? 0);
      for (let i = 0; i < frames; i += 1) {
        now += 1000 / hz;
        callbacks += pump(now);
        const next = signature();
        if (next !== last) {
          changes += 1;
          last = next;
        }
      }
      clock.pumpedTo = now;
      return { changes, callbacks };
    },
    { hz: PUMP_HZ, frames: PUMP_FRAMES },
  );

/* The meadow's floor can sit below the first screen; the loop runs only while it or the fall is in view. */
const showMotion = async (page: Page) => {
  await motion(page).scrollIntoViewIfNeeded();
};

const expectDrawing = async (page: Page, because: string) => {
  await showMotion(page);
  await expect
    .poll(async () => (await pumpSecond(page)).changes, { message: because })
    .toBeGreaterThan(0);
};

/* Held: not one frame callback runs, so nothing is even asked to draw. */
const expectHeld = async (page: Page, because: string) => {
  await drainPendingFrame(page);
  const { changes, callbacks } = await pumpSecond(page);
  expect(callbacks, `${because}: frame callbacks still run`).toBe(0);
  expect(changes, because).toBe(0);
};

test.describe('the homepage motion', () => {
  test(
    'the server sends it still, with both pause controls hidden',
    NODE,
    () => {
      const home = builtPages().find((page) => page.route === HOME_ROUTE);
      expect(home, 'no built homepage to read').toBeDefined();
      const html = readFileSync(home!.file, 'utf8');

      expect(
        html.includes('data-home-motion="running"'),
        'the server-rendered homepage is marked running before its pause control works.',
      ).toBe(false);
      const controls = html.match(/<button[^>]*data-home-pause[^>]*>/g) ?? [];
      expect(
        controls,
        'the homepage does not ship two pause controls',
      ).toHaveLength(2);
      for (const control of controls) {
        expect(
          control,
          'a pause control is shown before the script that makes it work.',
        ).toMatch(/\shidden(\s|>|=)/);
      }
    },
  );

  test('moves, and a keyboard press on either control stops all of it and names both', async ({
    page,
  }) => {
    await installFramePump(page);
    await gotoSettled(page, HOME_ROUTE);

    await expect(motion(page)).toHaveAttribute('data-home-motion', 'running');
    await expectDrawing(
      page,
      'nothing was moving before the pause, so a stop proves nothing',
    );

    const controls = page.getByRole('button', { name: PAUSE_NAME });
    await expect(
      controls,
      'the homepage does not show two pause controls',
    ).toHaveCount(2);

    /* By keyboard, not by click(). */
    const second = controls.nth(1);
    await second.focus();
    await expect(second).toBeFocused();
    await page.keyboard.press('Enter');

    await expect(motion(page)).toHaveAttribute('data-home-motion', 'paused');
    await expect(
      page.getByRole('button', { name: PLAY_NAME }),
      'both controls do not change to say what they will do next.',
    ).toHaveCount(2);
    await expectHeld(page, 'the controls say paused and something still moves');

    await page.keyboard.press('Enter');
    await expect(motion(page)).toHaveAttribute('data-home-motion', 'running');
    await expectDrawing(page, 'pressing play did not restart the motion');
  });

  /* Frames are pumped at exact 60Hz: real frames under load cannot tell a cap from none. */
  test('draws at most thirty frames a second', async ({ page }) => {
    await installFramePump(page);
    await page.goto(HOME_ROUTE);
    await expect(motion(page)).toHaveAttribute('data-home-motion', 'running');

    await expectDrawing(page, 'nothing moved, so a frame count proves nothing');
    const { changes } = await pumpSecond(page);
    const said = `the motion drew ${changes} of ${PUMP_FRAMES} frames offered at ${PUMP_HZ}Hz`;
    expect(changes, `${said}, so it is not animating`).toBeGreaterThan(0);
    expect(
      changes,
      `${said}, so the frame cap is not working`,
    ).toBeLessThanOrEqual(DRAWN_MAX);
  });

  test('it stops once the meadow and the fall are scrolled out of view', async ({
    page,
  }) => {
    await installFramePump(page);
    await page.setViewportSize(SHORT_VIEWPORT);
    await page.goto(HOME_ROUTE);
    await expect(motion(page)).toHaveAttribute('data-home-motion', 'running');
    await expectDrawing(
      page,
      'nothing was moving before the page was scrolled, so this proves nothing',
    );

    await page.evaluate(() =>
      window.scrollTo(0, document.documentElement.scrollHeight),
    );
    await expect
      .poll(
        async () => {
          await drainPendingFrame(page);
          return (await pumpSecond(page)).callbacks;
        },
        {
          message:
            'the loop kept running with the motion out of view, so the observer is not gating it',
          timeout: STOP_TIMEOUT_MS,
        },
      )
      .toBe(0);
  });

  /* Playwright cannot background a tab, so the two properties the handler reads are overridden. */
  test('it stops while the tab is hidden', async ({ page }) => {
    await installFramePump(page);
    await page.goto(HOME_ROUTE);
    await expect(motion(page)).toHaveAttribute('data-home-motion', 'running');
    await expectDrawing(
      page,
      'nothing was moving before the tab was hidden, so this proves nothing',
    );

    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => 'hidden',
      });
      Object.defineProperty(document, 'hidden', {
        configurable: true,
        get: () => true,
      });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expectHeld(page, 'the motion kept running while the tab was hidden');
  });

  /*
   * Focus does not hit-test, so a buried control still takes Enter. `elementFromPoint`
   * names what is on top; `locator.click()` would just time out.
   */
  for (const { width, height, note } of POINTER_VIEWPORTS) {
    test(`a pointer press on each control stops it at ${width}px (${note})`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height });
      await gotoSettled(page, HOME_ROUTE);
      await expect(motion(page)).toHaveAttribute('data-home-motion', 'running');

      for (const index of [0, 1]) {
        const control = page
          .getByRole('button', { name: ANY_PAUSE_NAME })
          .nth(index);
        await control.scrollIntoViewIfNeeded();
        const box = await control.boundingBox();
        expect(box, `pause control ${index + 1} has no box`).not.toBeNull();
        const point = {
          x: box!.x + box!.width / 2,
          y: box!.y + box!.height / 2,
        };

        const hit = await page.evaluate(({ x, y }) => {
          const top = document.elementFromPoint(x, y);
          if (!top)
            return { reaches: false, what: 'nothing: it is off screen' };
          return {
            reaches: top.closest('[data-home-pause]') !== null,
            what: `<${top.tagName.toLowerCase()} class="${top.getAttribute('class') ?? ''}">`,
          };
        }, point);
        expect(
          hit.reaches,
          `a press at the center of pause control ${index + 1} lands on ${hit.what} instead.`,
        ).toBe(true);

        const before = await motion(page).getAttribute('data-home-motion');
        await page.mouse.click(point.x, point.y);
        await expect(motion(page)).not.toHaveAttribute(
          'data-home-motion',
          before ?? '',
        );
      }
    });
  }

  test('under reduced motion it is drawn once and held, with no control', async ({
    page,
  }) => {
    await installFramePump(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await gotoSettled(page, HOME_ROUTE);

    expect(
      await page.evaluate(
        () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      ),
      'the preference was not emulated, so this test proves nothing',
    ).toBe(true);

    await expect(motion(page)).toHaveAttribute('data-home-motion', 'paused');
    /* Reduced motion asks for less movement, not less picture. */
    await expect(page.locator('[data-home-hopper]')).toBeVisible();
    await expectHeld(page, 'something moved under prefers-reduced-motion');
    await expect(
      page.getByRole('button', { name: ANY_PAUSE_NAME }),
      'a pause control is shown with nothing to pause.',
    ).toHaveCount(0);
  });

  /* home-motion.ts follows the preference rather than reading it once. */
  test('turning reduced motion on during a visit stops it and hides the controls', async ({
    page,
  }) => {
    await installFramePump(page);
    await gotoSettled(page, HOME_ROUTE);
    await expect(motion(page)).toHaveAttribute('data-home-motion', 'running');
    await expectDrawing(
      page,
      'nothing was moving before the preference changed, so this proves nothing',
    );

    await page.emulateMedia({ reducedMotion: 'reduce' });

    await expect(
      motion(page),
      'reduced motion came on and the motion still says running.',
    ).toHaveAttribute('data-home-motion', 'paused');
    await expectHeld(
      page,
      'the motion kept running after reduced motion came on',
    );
    await expect(
      page.getByRole('button', { name: ANY_PAUSE_NAME }),
    ).toHaveCount(0);
  });

  test('reduced motion coming on while a pause control has focus keeps focus in the page (SC 2.4.3)', async ({
    page,
  }) => {
    await gotoSettled(page, HOME_ROUTE);
    const control = page.getByRole('button', { name: PAUSE_NAME }).first();
    await control.focus();
    await expect(control).toBeFocused();

    await page.emulateMedia({ reducedMotion: 'reduce' });

    await expect(
      page.getByRole('button', { name: ANY_PAUSE_NAME }),
    ).toHaveCount(0);
    await expect(
      page.locator('main'),
      'the control left and took focus with it, back to the top of the document',
    ).toBeFocused();
  });

  for (const { when, reduce } of [
    { when: 'while paused', reduce: false },
    { when: 'under reduced motion', reduce: true },
  ]) {
    test(`pressing the yarn ball ${when} moves nothing and stays on the page`, async ({
      page,
    }) => {
      await installFramePump(page);
      if (reduce) await page.emulateMedia({ reducedMotion: 'reduce' });
      await gotoSettled(page, HOME_ROUTE);
      if (!reduce) {
        await page.getByRole('button', { name: PAUSE_NAME }).first().click();
        await expect(motion(page)).toHaveAttribute(
          'data-home-motion',
          'paused',
        );
      }
      const url = page.url();

      const yarn = page.getByRole('button', { name: 'Toss the Yarn Ball' });
      await yarn.click();

      await expect(
        yarn,
        'the yarn ball did not answer the press by turning over',
      ).toHaveAttribute('data-flipped', '');
      expect(
        await yarn.evaluate((el) =>
          el.getAnimations({ subtree: true }).map((a) => a.playState),
        ),
        'the yarn ball animates where nothing may move',
      ).toEqual([]);
      await expectHeld(page, 'pressing the yarn ball started the motion');
      expect(page.url(), 'pressing the yarn ball left the page').toBe(url);
    });
  }
});

/**
 * Moving means a duration above 1ms (the reduce block sets 0.01ms), an infinite
 * iteration count, which `!important` can leave at any duration, or smooth scrolling.
 */
const movingElements = (page: Page) =>
  page.evaluate(() => {
    /* Longest duration in a comma-separated list, in milliseconds. */
    const longest = (value: string) =>
      Math.max(
        0,
        ...value.split(',').map((part) => {
          const seconds = parseFloat(part);
          if (Number.isNaN(seconds)) return 0;
          return part.includes('ms') ? seconds : seconds * 1000;
        }),
      );

    const out: string[] = [];
    for (const element of document.querySelectorAll('*')) {
      for (const pseudo of [null, '::before', '::after']) {
        const style = getComputedStyle(element, pseudo);
        const smooth = style.scrollBehavior === 'smooth';
        const animated = style.animationName !== 'none';
        const animation = animated ? longest(style.animationDuration) : 0;
        const transition =
          style.transitionProperty === 'none'
            ? 0
            : longest(style.transitionDuration);
        const endless =
          animated && style.animationIterationCount === 'infinite';

        if (animation <= 1 && transition <= 1 && !endless && !smooth) continue;
        out.push(
          `<${element.tagName.toLowerCase()} class="${String(
            (element as HTMLElement).className,
          ).slice(0, 48)}">${pseudo ?? ''} animation=${style.animationName} ` +
            `${style.animationDuration}/${style.animationIterationCount} ` +
            `transition=${style.transitionProperty} ${style.transitionDuration}` +
            (smooth ? ' scroll-behavior=smooth' : ''),
        );
      }
    }
    return out;
  });

test('nothing anywhere still moves under reduced motion', async ({ page }) => {
  test.setTimeout(sweepTimeout(ROUTES.length));
  await page.emulateMedia({ reducedMotion: 'reduce' });

  const moving: string[] = [];
  for (const route of ROUTES) {
    await gotoSettled(page, route);

    expect(
      await page.evaluate(
        () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      ),
      `the preference was not emulated on ${route}, so this proves nothing`,
    ).toBe(true);

    const found = await movingElements(page);

    moving.push(...found.map((entry) => `${route}  ${entry}`));
  }

  expect(
    moving,
    `element(s) still moving under prefers-reduced-motion: reduce:\n` +
      moving.map((entry) => `  ${entry}`).join('\n'),
  ).toEqual([]);
});
