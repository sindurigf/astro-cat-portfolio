import { expect, test, type Locator, type Page } from './test';
import { gotoSettled, sweepTimeout } from './settle';
import { readFileSync } from 'node:fs';
import { builtPages, islandRoutesFromBuild, ROUTES } from './routes';
import { MIN_TARGET, PHONE_VIEWPORT, SUBPIXEL_TOLERANCE } from './wcag';
import { NODE } from './tags';

/**
 * SC 2.2.2 for the hero canvas. A canvas has no `animation-play-state`, so tests
 * pump frames and compare pixels: real frames under load are too few to count.
 * `running()` in use-hero-field.ts also gates on `onScreen` and `document.hidden`.
 */
const HERO_ROUTE = '/';
const HERO_PAUSE_NAME = /pause the hero animation/i;
const HERO_PLAY_NAME = /play the hero animation/i;

/** How long the field has to stop drawing after it leaves the viewport. */
const HERO_STOP_TIMEOUT_MS = 5_000;

/** The frame-rate test offers the field one second of frames at this rate. */
const HERO_PUMP_HZ = 60;
const HERO_PUMP_FRAMES = 60;

/** `MAX_FRAME_RATE` in use-hero-field.ts is 30; one over allows for where the first drawn frame falls. */
const HERO_DRAWN_MAX = 31;

/** Both put the control inside the content column's box; at 1440px it sits outside and proves nothing. */
const POINTER_VIEWPORTS = [
  { ...PHONE_VIEWPORT, note: 'phone' },
  { width: 1280, height: 720, note: 'desktop' },
] as const;

/**
 * A strip, not the whole canvas: full-viewport `getImageData` is slow. 55% of
 * the height is below the horizon, inside the mascot's band at every viewport.
 */
const fieldFingerprint = (page: Page) =>
  page.evaluate(() => {
    const layers =
      document.querySelectorAll<HTMLCanvasElement>('.hero-field-layer');
    const canvas = layers[1];
    if (!canvas) return null;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const top = Math.floor(canvas.height * 0.55);
    const rows = Math.min(48, canvas.height - top);
    if (rows < 1) return null;

    const { data } = ctx.getImageData(0, top, canvas.width, rows);
    let ink = 0;
    let signature = 0;
    for (let i = 0; i < data.length; i += 4) {
      const alpha = data[i + 3];
      ink += alpha;
      /* Position-weighted, so ink that merely moved still registers. */
      signature = (signature + alpha * ((i >> 2) % 7919)) % 2147483647;
    }
    return { ink, signature };
  });

const expectHeroTargetSize = async (control: Locator) => {
  const box = await control.boundingBox();
  expect(
    box?.width,
    'hero pause control target width (SC 2.5.8)',
  ).toBeGreaterThanOrEqual(MIN_TARGET - SUBPIXEL_TOLERANCE);
  expect(
    box?.height,
    'hero pause control target height (SC 2.5.8)',
  ).toBeGreaterThanOrEqual(MIN_TARGET - SUBPIXEL_TOLERANCE);
};

/*
 * `cancelAnimationFrame` must really remove the callback: `stop()` in
 * use-hero-field.ts relies on it. Ids start at 1, so `frame = 0` means "nothing pending".
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
    (window as unknown as { pumpFrame: (now: number) => void }).pumpFrame = (
      now,
    ) => {
      const due = [...queue.entries()];
      for (const [id] of due) queue.delete(id);
      for (const [, callback] of due) callback(now);
    };
  });

/* Runs any frame queued before the stop, so counts can assert exactly zero. */
const drainPendingFrame = (page: Page) =>
  page.evaluate(() => {
    (window as unknown as { pumpFrame: (now: number) => void }).pumpFrame(
      performance.now(),
    );
  });

const countDrawnFrames = (page: Page) =>
  page.evaluate(
    ({ hz, frames }) => {
      const pump = (window as unknown as { pumpFrame: (now: number) => void })
        .pumpFrame;
      const canvas =
        document.querySelectorAll<HTMLCanvasElement>('.hero-field-layer')[1]!;
      const ctx = canvas.getContext('2d')!;
      const top = Math.floor(canvas.height * 0.55);
      const rows = Math.min(48, canvas.height - top);
      const signature = (): number => {
        const { data } = ctx.getImageData(0, top, canvas.width, rows);
        let sum = 0;
        for (let i = 0; i < data.length; i += 4) {
          sum = (sum + data[i + 3] * ((i >> 2) % 7919)) % 2147483647;
        }
        return sum;
      };

      let last = signature();
      let changes = 0;
      let now = performance.now();
      for (let i = 0; i < frames; i += 1) {
        now += 1000 / hz;
        pump(now);
        const next = signature();
        if (next !== last) {
          changes += 1;
          last = next;
        }
      }
      return changes;
    },
    { hz: HERO_PUMP_HZ, frames: HERO_PUMP_FRAMES },
  );

const expectFieldDrawing = async (page: Page, because: string) => {
  expect(await countDrawnFrames(page), because).toBeGreaterThan(0);
};

const expectFieldHeld = async (page: Page, because: string) => {
  await drainPendingFrame(page);
  expect(await countDrawnFrames(page), because).toBe(0);
};

/* Every "held" assertion would also pass against a field that never drew. */
const expectFieldPainted = async (page: Page, because: string) => {
  const painted = await fieldFingerprint(page);
  expect(painted, 'the hero field canvases are not in the page').not.toBeNull();
  expect(painted!.ink, because).toBeGreaterThan(0);
};

// The SC 2.2.2 tests below visit HERO_ROUTE only, so no other route may hydrate one.
test(
  'the hero field is hydrated only where its pause control is tested',
  NODE,
  () => {
    expect(
      islandRoutesFromBuild('HeroField'),
      'HeroField is on a route the SC 2.2.2 tests here do not visit',
    ).toEqual([HERO_ROUTE]);
  },
);

test.describe('the hero field on /', () => {
  test('the server sends a still hero, not a moving one', NODE, () => {
    const home = builtPages().find((page) => page.route === HERO_ROUTE);
    expect(home, 'no built homepage to read').toBeDefined();
    const html = readFileSync(home!.file, 'utf8');

    /* A field that runs before hydration has motion with no pause control (SC 2.2.2). */
    expect(
      html,
      'the hero field must not be marked as running in server-rendered HTML',
    ).toContain('data-hero-motion="paused"');
    expect(
      html.includes('data-hero-motion="running"'),
      'the server-rendered hero is marked running before its pause control exists.',
    ).toBe(false);
    expect(
      html.includes('pause the hero animation'),
      'the pause control is server-rendered and dead until hydration.',
    ).toBe(false);
  });

  test('paints, keeps moving, and a keyboard press stops it', async ({
    page,
  }) => {
    await installFramePump(page);
    await gotoSettled(page, HERO_ROUTE);

    const field = page.locator('.hero-field');
    await expect(field).toHaveAttribute('data-hero-motion', 'running');
    await expectFieldPainted(page, 'the middle canvas is empty');
    await expectFieldDrawing(
      page,
      'the field was not animating before the pause, so a stop proves nothing',
    );

    /* By keyboard, not by click(). */
    const control = page.getByRole('button', { name: HERO_PAUSE_NAME });
    await expect(control).toBeVisible();
    await expectHeroTargetSize(control);

    await control.focus();
    await expect(control).toBeFocused();
    await page.keyboard.press('Enter');

    await expect(field).toHaveAttribute('data-hero-motion', 'paused');
    await expect(
      page.getByRole('button', { name: HERO_PLAY_NAME }),
      'the control name does not change to say what it will do next.',
    ).toBeFocused();

    /* And the pixels actually stopped, not just the attribute. */
    await expectFieldHeld(
      page,
      'the attribute says paused and the canvas is still drawing',
    );

    await page.keyboard.press('Enter');
    await expect(field).toHaveAttribute('data-hero-motion', 'running');
    await expectFieldDrawing(page, 'pressing play did not restart the field');
  });

  /* Frames are pumped at exact 60Hz: real frames under load cannot tell a cap from none. */
  test('draws at most thirty frames a second', async ({ page }) => {
    await installFramePump(page);
    await page.goto(HERO_ROUTE);
    await expect(page.locator('.hero-field')).toHaveAttribute(
      'data-hero-motion',
      'running',
    );

    const drawn = await countDrawnFrames(page);

    const said = `the field drew ${drawn} of ${HERO_PUMP_FRAMES} frames offered at ${HERO_PUMP_HZ}Hz`;
    expect(drawn, `${said}, so it is not animating`).toBeGreaterThan(0);
    expect(
      drawn,
      `${said}, so the frame cap is not working`,
    ).toBeLessThanOrEqual(HERO_DRAWN_MAX);
  });

  /* Two viewports is well past the observer's `rootMargin: 120px`. */
  test('it stops drawing once it is scrolled out of view', async ({ page }) => {
    await installFramePump(page);
    await page.goto(HERO_ROUTE);
    await expect(page.locator('.hero-field')).toHaveAttribute(
      'data-hero-motion',
      'running',
    );
    expect(
      await countDrawnFrames(page),
      'the field was not drawing before it was scrolled away, so this proves nothing',
    ).toBeGreaterThan(0);

    await page.evaluate(() => window.scrollTo(0, window.innerHeight * 2));
    await expect
      .poll(
        async () => {
          await drainPendingFrame(page);
          return countDrawnFrames(page);
        },
        {
          message:
            'the field kept drawing after it was scrolled out of view, so onScreen is not gating it',
          timeout: HERO_STOP_TIMEOUT_MS,
        },
      )
      .toBe(0);
  });

  /* Playwright cannot background a tab, so the two properties the handler reads are overridden. */
  test('it stops drawing while the tab is hidden', async ({ page }) => {
    await installFramePump(page);
    await page.goto(HERO_ROUTE);
    await expect(page.locator('.hero-field')).toHaveAttribute(
      'data-hero-motion',
      'running',
    );
    expect(
      await countDrawnFrames(page),
      'the field was not drawing before the tab was hidden, so this proves nothing',
    ).toBeGreaterThan(0);

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
    await drainPendingFrame(page);

    expect(
      await countDrawnFrames(page),
      'the field kept drawing while the tab was hidden, so visibilitychange is not gating it',
    ).toBe(0);
  });

  /*
   * Focus does not hit-test, so a buried control still takes Enter. `elementFromPoint`
   * names what is on top; `locator.click()` would just time out.
   */
  for (const { width, height, note } of POINTER_VIEWPORTS) {
    test(`a pointer press on the control stops it at ${width}px (${note})`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height });
      await gotoSettled(page, HERO_ROUTE);

      const field = page.locator('.hero-field');
      await expect(field).toHaveAttribute('data-hero-motion', 'running');

      const box = await page
        .getByRole('button', { name: HERO_PAUSE_NAME })
        .boundingBox();
      expect(box, 'the hero pause control has no box').not.toBeNull();
      const point = { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 };

      const hit = await page.evaluate(({ x, y }) => {
        const top = document.elementFromPoint(x, y);
        if (!top) return { reaches: false, what: 'nothing: it is off screen' };
        return {
          reaches: top.closest('.hero-motion-toggle') !== null,
          what: `<${top.tagName.toLowerCase()} class="${top.getAttribute('class') ?? ''}">`,
        };
      }, point);
      expect(
        hit.reaches,
        `a press at the centre of the hero pause control lands on ${hit.what} instead.`,
      ).toBe(true);

      await page.mouse.click(point.x, point.y);
      await expect(field).toHaveAttribute('data-hero-motion', 'paused');
      await expect(
        page.getByRole('button', { name: HERO_PLAY_NAME }),
      ).toBeVisible();
    });
  }

  /* Resizing clears a canvas; every frame is held, so the only paint is `relayout()`'s own. */
  test('a resize while a frame is pending leaves the field drawn', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      window.requestAnimationFrame = () => 1;
    });
    await page.goto(HERO_ROUTE);
    const field = page.locator('.hero-field');
    await expect(field).toHaveAttribute('data-hero-motion', 'running');

    const midWidth = () =>
      page.evaluate(
        () =>
          document.querySelectorAll<HTMLCanvasElement>('.hero-field-layer')[1]
            ?.width ?? 0,
      );
    const before = await midWidth();
    const size = page.viewportSize()!;
    await page.setViewportSize({
      width: size.width - 160,
      height: size.height,
    });
    await expect.poll(midWidth).not.toBe(before);

    const ink = await page.evaluate(() => {
      const mid =
        document.querySelectorAll<HTMLCanvasElement>('.hero-field-layer')[1];
      const { data } = mid
        .getContext('2d')!
        .getImageData(0, 0, mid.width, mid.height);
      let total = 0;
      for (let i = 3; i < data.length; i += 4) total += data[i];
      return total;
    });
    expect(
      ink,
      'the resize cleared the middle canvas and nothing redrew it.',
    ).toBeGreaterThan(0);
  });

  test('under reduced motion it is drawn once and held, with no control', async ({
    page,
  }) => {
    await installFramePump(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await gotoSettled(page, HERO_ROUTE);

    expect(
      await page.evaluate(
        () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      ),
      'the preference was not emulated, so this test proves nothing',
    ).toBe(true);

    await expect(page.locator('.hero-field')).toHaveAttribute(
      'data-hero-motion',
      'paused',
    );

    /* Reduced motion asks for less movement, not less picture. */
    await expectFieldPainted(
      page,
      'the field should still be painted under reduced motion, just not moving',
    );
    await expectFieldHeld(page, 'the field moved under prefers-reduced-motion');

    await expect(
      page.getByRole('button', { name: /the hero animation/i }),
      'a pause control is rendered with nothing to pause.',
    ).toHaveCount(0);
  });

  /* use-hero-field.ts listens for the preference rather than reading it once at mount. */
  test('turning reduced motion on during a visit stops the field and drops the control', async ({
    page,
  }) => {
    await installFramePump(page);
    await gotoSettled(page, HERO_ROUTE);

    const field = page.locator('.hero-field');
    await expect(field).toHaveAttribute('data-hero-motion', 'running');
    await expectFieldDrawing(
      page,
      'the field was not animating before the preference changed, so this proves nothing',
    );

    await page.emulateMedia({ reducedMotion: 'reduce' });

    await expect(
      field,
      'reduced motion came on and the field still says running.',
    ).toHaveAttribute('data-hero-motion', 'paused');
    await expectFieldPainted(
      page,
      'the field was cleared when reduced motion came on, instead of held',
    );
    await expectFieldHeld(
      page,
      'the field kept moving after reduced motion was turned on',
    );
    await expect(
      page.getByRole('button', { name: /the hero animation/i }),
    ).toHaveCount(0);
  });
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
