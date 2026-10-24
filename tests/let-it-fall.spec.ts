import { expect, test, type Page } from './test';
import { gotoSettled } from './settle';
import { TALK_ROUTES } from './routes';
import { ENGINE_INVARIANT } from './tags';
import { timedScan } from './axe';

/**
 * Let It Fall (src/scripts/let-it-fall.ts): the heap never covers the button or a target (SC 2.5.8), never scrolls
 * sideways (1.4.10), each change is announced (4.1.3), Esc and keyboard focus elsewhere restore (2.4.11), reduced
 * motion never animates (2.3.3), a link in the heap still works, and the mascot on top covers no control.
 */

const ROUTE = '/career';
const FALL = { name: 'Let It Fall' };
const BACK = { name: 'Put It Back' };
const FELL = 'The page fell down. Press Put It Back to rebuild it.';
const RESTORED = 'The page is back in place.';
/* CSS px at 400% zoom of a 1280 window, a phone, and a desktop. */
const WIDTHS = [320, 390, 1280] as const;
const HEIGHT = 900;
const MAX_INSTANT_MS = 1;
/* px of page above the button kept on screen, so some blocks are there to fall. */
const BUTTON_FROM_BOTTOM = 120;

const fallen = (page: Page) => page.locator('[data-fell]');
/* Every block's fall or climb back has landed; the mascot's climb may go on. */
const landed = (page: Page) =>
  expect
    .poll(() =>
      page.evaluate(
        () =>
          [...document.querySelectorAll('[data-fall-block]')].flatMap((el) =>
            el.getAnimations(),
          ).length,
      ),
    )
    .toBe(0);
/* Targets in the heap above the screen, or covered by something else at any of nine points across their face. */
const coveredTargets = (page: Page) =>
  page.evaluate(() => {
    const SHARES = [0.25, 0.5, 0.75];
    return [
      ...document.querySelectorAll(
        '[data-fell] :is(a[href], button), [data-fell]:is(a[href], button)',
      ),
    ]
      .filter((el) => el.checkVisibility())
      .filter((el) => {
        const r = el.getBoundingClientRect();
        if (r.top < 0) return true;
        /* Below the screen: a heap too tall for it, which scrolling reaches (tested with Put It Back). */
        if (r.bottom > innerHeight) return false;
        /* Points across the target's own face, turned with its fallen block: its upright box's corners lie outside it. */
        const block = el.closest('[data-fell]')!;
        const { a, b } = new DOMMatrix(getComputedStyle(block).transform);
        const turn = Math.atan2(b, a);
        const own = el as HTMLElement;
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        return SHARES.some((x) =>
          SHARES.some((y) => {
            const dx = (x - 0.5) * own.offsetWidth;
            const dy = (y - 0.5) * own.offsetHeight;
            const hit = document.elementFromPoint(
              cx + dx * Math.cos(turn) - dy * Math.sin(turn),
              cy + dx * Math.sin(turn) + dy * Math.cos(turn),
            );
            return !hit || !el.contains(hit);
          }),
        );
      })
      .map((el) => el.textContent?.trim() || el.getAttribute('aria-label'));
  });
/* What animates on the fallen blocks and the mascot for longer than an instant; reduced-motion.css cuts transitions to 0.01ms. */
const moving = (page: Page) =>
  page.evaluate(
    (instant) =>
      [
        ...document.querySelectorAll(
          '[data-fall-block], .footer-mascot, [data-let-it-fall]',
        ),
      ]
        .flatMap((el) => el.getAnimations())
        .filter((a) => Number(a.effect?.getComputedTiming().duration) > instant)
        .map((a) => {
          const target =
            a.effect instanceof KeyframeEffect ? a.effect.target : null;
          const property =
            a instanceof CSSTransition ? a.transitionProperty : 'keyframes';
          return `${target?.className} ${property}`;
        }),
    MAX_INSTANT_MS,
  );
const status = (page: Page) => page.locator('footer').getByRole('status');

/* The button near the bottom of the screen with the page above it, then one press. */
const press = async (page: Page) => {
  const button = page.getByRole('button', FALL);
  await button.evaluate((el, gap) => {
    scrollTo(0, el.getBoundingClientRect().top + scrollY - innerHeight + gap);
  }, BUTTON_FROM_BOTTOM);
  await button.click();
  await expect(status(page)).toHaveText(FELL);
  return page.getByRole('button', BACK);
};

for (const width of WIDTHS) {
  test.describe(`at ${width}px`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width, height: HEIGHT });
      await gotoSettled(page, ROUTE);
    });

    test('blocks fall into a heap below the risen button, which keeps focus, and every target stays whole', async ({
      page,
    }) => {
      const button = await press(page);
      await expect(button).toBeFocused();
      await expect(fallen(page)).not.toHaveCount(0);
      await expect(
        page.locator('.header-slab'),
        'the header stayed up',
      ).toHaveAttribute('data-fell');
      await landed(page);
      expect(
        await button.evaluate((el) => {
          const r = el.getBoundingClientRect();
          return (
            document.elementFromPoint(
              r.left + r.width / 2,
              r.top + r.height / 2,
            ) === el
          );
        }),
        'a fallen block covers the button',
      ).toBe(true);
      expect(
        await coveredTargets(page),
        'a target in the heap is above the screen or partly covered (SC 2.5.8)',
      ).toEqual([]);
      const { violations } = await timedScan(page, 'fallen /career');
      expect(
        violations.map((v) => `${v.id}: ${v.nodes.length} node(s)`),
        'axe found WCAG 2.2 AA violations in the heap',
      ).toEqual([]);
      await button.focus();
      await expect(
        fallen(page),
        'focus on the button itself put the page back',
      ).not.toHaveCount(0);
      expect(
        await page.evaluate(
          () =>
            document.documentElement.scrollWidth >
            document.documentElement.clientWidth,
        ),
        'the fallen page scrolls sideways (SC 1.4.10)',
      ).toBe(false);
    });

    test('the same button, Esc, or keyboard focus entering the page puts it back', async ({
      page,
    }) => {
      const button = await press(page);
      await landed(page);
      await button.click();
      await expect(status(page)).toHaveText(RESTORED);
      await expect(page.getByRole('button', FALL)).toBeFocused();
      await expect(fallen(page)).toHaveCount(0);
      await landed(page);
      await expect(
        page.locator('[data-fall-block], [data-fall-raised]'),
        'a block home again keeps its fall state',
      ).toHaveCount(0);

      await press(page);
      await landed(page);
      await page.keyboard.press('Escape');
      await expect(status(page)).toHaveText(RESTORED);
      await expect(page.getByRole('button', FALL)).toBeFocused();
      await expect(fallen(page)).toHaveCount(0);
      await landed(page);

      await press(page);
      await page.keyboard.press('Shift+Tab');
      await expect(
        fallen(page),
        'a control moved by the fall took keyboard focus out of place',
      ).toHaveCount(0);
    });
  });
}

/* deg and px: a long, thin link at the heap's small-block tilt, whose upright box's corners lie outside it. */
const PROBE_TURN_DEG = 8;
const PROBE_LINK = { width: 320, height: 44 } as const;

test('the cover probe passes a whole link tilted in the heap', async ({
  page,
}) => {
  await gotoSettled(page, ROUTE);
  await page.evaluate(
    ({ turn, size }) => {
      const block = document.createElement('div');
      block.setAttribute('data-fell', '');
      block.style.setProperty('position', 'fixed');
      block.style.setProperty('top', '40%');
      block.style.setProperty('left', '10%');
      block.style.setProperty('z-index', '9');
      block.style.setProperty('transform', `rotate(${turn}deg)`);
      const link = document.createElement('a');
      link.href = '/';
      link.textContent = 'Tilted';
      link.style.setProperty('display', 'block');
      link.style.setProperty('width', `${size.width}px`);
      link.style.setProperty('height', `${size.height}px`);
      block.append(link);
      document.body.append(block);
    },
    { turn: PROBE_TURN_DEG, size: PROBE_LINK },
  );
  expect(
    await coveredTargets(page),
    'the probe counts a whole tilted link as covered',
  ).toEqual([]);
});

/* px: a desktop window short enough that the footer band shares the screen with the heap. */
const BAND_HEIGHT = 800;
const DESKTOP = 1280;

test('with the footer band on screen, no heap target is covered', async ({
  page,
}) => {
  await page.setViewportSize({ width: DESKTOP, height: BAND_HEIGHT });
  await gotoSettled(page, ROUTE);
  await press(page);
  await landed(page);
  expect(
    await coveredTargets(page),
    'a target in the heap is above the screen or partly covered (SC 2.5.8)',
  ).toEqual([]);
});

/* The heap is random; a fixed sequence makes the same one every run. */
const seedRandom = (page: Page, seed: number) =>
  page.addInitScript((start) => {
    let state = start;
    /* mulberry32 */
    Math.random = () => {
      state = (state + 0x6d2b79f5) | 0;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32;
    };
  }, seed);
const HEAP_SEED = 7;

test('a click on a link in the heap follows it', async ({ page }) => {
  await seedRandom(page, HEAP_SEED);
  await page.setViewportSize({ width: 390, height: HEIGHT });
  await gotoSettled(page, ROUTE);
  await press(page);
  await landed(page);
  const href = await page.evaluate(() => {
    const top = [
      ...document.querySelectorAll<HTMLAnchorElement>(
        '[data-fell] a[href^="/"]',
      ),
    ].find((link) => {
      if (link.pathname === location.pathname) return false;
      const r = link.getBoundingClientRect();
      const hit = document.elementFromPoint(
        r.left + r.width / 2,
        r.top + r.height / 2,
      );
      return hit !== null && link.contains(hit);
    });
    top?.setAttribute('data-test-target', '');
    return top?.getAttribute('href');
  });
  expect(href, 'no link in the heap is on screen').toBeTruthy();
  await page.locator('[data-test-target]').click();
  await expect(page).toHaveURL(new RegExp(`${href}$`));
});

test('the fallen header scrolls with the page and is sticky again once back', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: HEIGHT });
  await gotoSettled(page, ROUTE);
  await press(page);
  await landed(page);
  const slab = page.locator('.header-slab');
  const top = () => slab.evaluate((el) => el.getBoundingClientRect().top);
  const before = await top();
  const SCROLL = 200;
  await page.evaluate((by) => scrollBy(0, -by), SCROLL);
  expect(await top(), 'the fallen header stayed on screen').toBeCloseTo(
    before + SCROLL,
    0,
  );
  /* Esc, not the button: a click would scroll the button back into view first. */
  await page.keyboard.press('Escape');
  await expect(status(page)).toHaveText(RESTORED);
  await landed(page);
  const header = page.locator('.site-header');
  await expect(header).toHaveCSS('position', 'sticky');
  await expect(header, 'the header kept a pinned style').not.toHaveAttribute(
    'style',
    /./,
  );
  expect(
    await slab.evaluate((el) => {
      const { top } = el.getBoundingClientRect();
      return top >= 0 && top < innerHeight / 2;
    }),
    'the header climbed home off screen',
  ).toBe(true);
});

/* px: under the `short` variant's 30rem, where the header is static. */
const SHORT_HEIGHT = 400;

test('on a short screen the static header falls with the page and gets its layer back', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: SHORT_HEIGHT });
  await gotoSettled(page, ROUTE);
  const header = page.locator('.site-header');
  await expect(header).toHaveCSS('position', 'static');
  /* The header and the button never share a short screen, so the button is pressed from the top of the page. */
  await page.evaluate(() => scrollTo(0, 0));
  await page.getByRole('button', FALL).evaluate((el) => {
    (el as HTMLButtonElement).click();
  });
  await expect(status(page)).toHaveText(FELL);
  await expect(
    page.locator('.header-slab'),
    'the static header stayed up',
  ).toHaveAttribute('data-fell');
  await page.keyboard.press('Escape');
  await expect(status(page)).toHaveText(RESTORED);
  await landed(page);
  await expect(header, "the header kept the fall's style").not.toHaveAttribute(
    'style',
    /./,
  );
});

/* ms: longer than let-it-fall.ts REPEAT_MS, shorter than --fall-time, so the second press lands mid-climb. */
const PRESS_AGAIN_MS = 400;

test('pressing again while the blocks and mascot go home drops them again, the mascot clear of controls', async ({
  page,
}) => {
  await seedRandom(page, HEAP_SEED);
  await page.setViewportSize({ width: 390, height: HEIGHT });
  await gotoSettled(page, ROUTE);
  const button = await press(page);
  await mascotClear(page);
  await button.click();
  await expect(status(page)).toHaveText(RESTORED);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.waitForTimeout(PRESS_AGAIN_MS);
  await page.getByRole('button', FALL).click();
  await expect(status(page)).toHaveText(FELL);
  await expect(fallen(page)).not.toHaveCount(0);
  await mascotClear(page);
  expect(errors, 'cutting the climb short threw').toEqual([]);
});

test('under reduced motion the blocks and the mascot move at once, never animated', async ({
  page,
}) => {
  await seedRandom(page, HEAP_SEED);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: HEIGHT });
  await gotoSettled(page, ROUTE);
  await press(page);
  await expect(fallen(page)).not.toHaveCount(0);
  await expect(page.locator('.footer-mascot')).toHaveAttribute('data-hopped');
  /* reduced-motion.css leaves a 0.01ms transition, which starts at home. */
  await expect
    .poll(() =>
      page
        .locator('.footer-mascot')
        .evaluate((img) => img.getAnimations().length),
    )
    .toBe(0);
  expect(
    await page.locator('.footer-mascot').evaluate((img) => {
      const own = img.getBoundingClientRect();
      const seat = document
        .querySelector('[data-let-it-fall]')!
        .getBoundingClientRect();
      return {
        on:
          own.bottom <= seat.top &&
          own.left < seat.right &&
          seat.left < own.right,
        own: [own.left, own.top, own.right, own.bottom].map(Math.round),
        seat: [seat.left, seat.top, seat.right, seat.bottom].map(Math.round),
      };
    }),
    'under reduced motion the mascot is not on Put It Back',
  ).toMatchObject({ on: true });
  await expect(
    page.locator('.fall-hopper'),
    'the climbing copy appeared under reduced motion',
  ).toHaveCount(0);
  expect(await moving(page), 'something animates under reduced motion').toEqual(
    [],
  );
  await page.keyboard.press('Escape');
  await expect(fallen(page)).toHaveCount(0);
  await expect(page.locator('.footer-mascot')).not.toHaveAttribute(
    'data-hopped',
  );
  expect(
    await moving(page),
    'putting it back animates under reduced motion',
  ).toEqual([]);
});

/* ms: the climb is a few hops of about 0.8s and two glances; the wait allows for a slow runner. */
const CLIMB_MS = 20_000;

/* The mascot on the heap, settled: on screen, over no control, hidden from assistive technology. */
const mascotClear = async (page: Page) => {
  const hopper = page.locator('.fall-hopper[data-settled]');
  await expect(hopper).toBeAttached({ timeout: CLIMB_MS });
  await landed(page);
  await expect(page.locator('.footer-mascot')).toHaveAttribute('data-away');
  expect(
    await hopper.evaluate((feet) => {
      const r = feet.querySelector('img')!.getBoundingClientRect();
      const onScreen =
        r.top >= 0 &&
        r.bottom <= innerHeight &&
        r.left >= 0 &&
        r.right <= innerWidth;
      const covers = [...document.querySelectorAll('a[href], button')]
        .filter((el) => el.checkVisibility())
        .filter((el) => {
          const c = el.getBoundingClientRect();
          return (
            r.left < c.right &&
            c.left < r.right &&
            r.top < c.bottom &&
            c.top < r.bottom
          );
        })
        .map((el) => el.textContent?.trim());
      return { onScreen, covers, hidden: feet.getAttribute('aria-hidden') };
    }),
    'the mascot is off screen, covers a control, or is announced',
  ).toEqual({ onScreen: true, covers: [], hidden: 'true' });
};

test("pressed from the keyboard, the mascot sits clear of Put It Back's focus ring (SC 2.4.11)", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: HEIGHT });
  await gotoSettled(page, ROUTE);
  const button = page.getByRole('button', FALL);
  await button.evaluate((el, gap) => {
    scrollTo(0, el.getBoundingClientRect().top + scrollY - innerHeight + gap);
  }, BUTTON_FROM_BOTTOM);
  await button.focus();
  await page.keyboard.press('Enter');
  await mascotClear(page);
  expect(
    await page.locator('.fall-hopper img').evaluate((frame) => {
      const own = frame.getBoundingClientRect();
      const control = document.querySelector('[data-let-it-fall]')!;
      const style = getComputedStyle(control);
      const ring =
        parseFloat(style.outlineOffset) + parseFloat(style.outlineWidth);
      return {
        focused: control.matches(':focus-visible'),
        clear: own.bottom <= control.getBoundingClientRect().top - ring,
      };
    }),
    "the mascot covers Put It Back's focus ring",
  ).toEqual({ focused: true, clear: true });
});

/* px: let-it-fall.ts FLOAT_GAP, kept clear under the risen Put It Back; the two must agree. */
const FLOAT_GAP = 24;

/* Short enough on /blog that the heap does not fit under Put It Back and moves down past the screen. */
const SINKING = { route: '/blog', width: DESKTOP, height: 500 } as const;

for (const [route, width, height, motion] of [
  [ROUTE, 390, HEIGHT, 'no-preference'],
  [ROUTE, DESKTOP, 700, 'no-preference'],
  [ROUTE, 390, HEIGHT, 'reduce'],
  [SINKING.route, SINKING.width, SINKING.height, 'no-preference'],
] as const) {
  test(`${route} at ${width}×${height}, motion ${motion}: Put It Back rises over the heap, whole, with no block above its gap`, async ({
    page,
  }) => {
    await seedRandom(page, HEAP_SEED);
    await page.emulateMedia({ reducedMotion: motion });
    await page.setViewportSize({ width, height });
    await gotoSettled(page, route);
    const button = await press(page);
    await landed(page);
    await expect
      .poll(() => button.evaluate((el) => el.getAnimations().length))
      .toBe(0);
    const found = await button.evaluate((el, gap) => {
      const own = el.getBoundingClientRect();
      const SHARES = [0.1, 0.5, 0.9];
      const covered = SHARES.some((x) =>
        SHARES.some((y) => {
          const hit = document.elementFromPoint(
            own.left + own.width * x,
            own.top + own.height * y,
          );
          return !hit || !el.contains(hit);
        }),
      );
      const ceiling = own.bottom + gap;
      const blocks = [...document.querySelectorAll('[data-fell]')].map(
        (block) => block.getBoundingClientRect(),
      );
      const above = blocks.filter(({ top }) => top < ceiling - 1).length;
      /* The heap shows on screen, and scrolling reaches all of it. */
      const shown = blocks.some(({ top }) => top < innerHeight);
      const lowest = Math.max(...blocks.map(({ bottom }) => bottom)) + scrollY;
      const reachable = lowest <= document.documentElement.scrollHeight + 1;
      return { onScreen: own.top >= 0, covered, above, shown, reachable };
    }, FLOAT_GAP);
    expect(
      found,
      'Put It Back is off screen or covered, a block lies above its gap, or the heap is out of reach',
    ).toEqual({
      onScreen: true,
      covered: false,
      above: 0,
      shown: true,
      reachable: true,
    });
  });
}

/* ms between samples of what is drawn over the mascot while the page falls and it climbs. */
const SAMPLE_MS = 100;

test('nothing but Put It Back is ever drawn over the mascot as the page falls and it climbs', async ({
  page,
}) => {
  await seedRandom(page, HEAP_SEED);
  await page.setViewportSize({ width: 390, height: HEIGHT });
  await gotoSettled(page, ROUTE);
  /* Hit-testing skips what takes no pointer, so the mascot takes it for this test only. */
  await page.addStyleTag({
    content:
      '.fall-hopper, .fall-hopper *, .footer-mascot { pointer-events: auto !important; }',
  });
  await press(page);
  const over = new Set<string>();
  const settled = page.locator('.fall-hopper[data-settled]');
  for (let waited = 0; waited < CLIMB_MS; waited += SAMPLE_MS) {
    const hit = await page.evaluate(() => {
      const mascot =
        document.querySelector('.fall-hopper img') ??
        document.querySelector('.footer-mascot')!;
      const r = mascot.getBoundingClientRect();
      const x = r.left + r.width / 2;
      const y = r.top + r.height / 2;
      if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) return null;
      const top = document.elementFromPoint(x, y);
      if (!top || mascot.contains(top) || top === mascot) return null;
      if (top.closest('[data-let-it-fall]')) return null;
      return `${top.tagName}.${top.className}`;
    });
    if (hit) over.add(hit);
    if (await settled.count()) break;
    await page.waitForTimeout(SAMPLE_MS);
  }
  await expect(settled).toBeAttached();
  expect([...over], 'something is drawn over the mascot').toEqual([]);
});

/* A phone the wide blocks leave room on, so the menu shelf sits two thirds down; px of tolerance. */
const SHELF_ROOM = { width: 360, height: 740 } as const;
const SHELF_SHARE = 2 / 3;
const SHELF_TOLERANCE = 24;

test('the menu bar is a shelf in the heap two thirds down, its links uncovered, and the mascot climbs onto it before Put It Back', async ({
  page,
}) => {
  await seedRandom(page, HEAP_SEED);
  await page.setViewportSize(SHELF_ROOM);
  await gotoSettled(page, ROUTE);
  await press(page);
  await mascotClear(page);
  expect(
    await coveredTargets(page),
    'a target in the heap is above the screen or partly covered (SC 2.5.8)',
  ).toEqual([]);
  const found = await page.evaluate(() => {
    const shelf = document.querySelector('.header-slab')!;
    const feet = document.querySelector<HTMLElement>('.fall-hopper')!;
    const host = feet.parentElement!.getBoundingClientRect();
    const INTO_SURFACE = 4;
    const path = (
      JSON.parse(feet.dataset.stones ?? '[]') as { x: number; y: number }[]
    ).map(({ x, y }) => {
      const hit = document.elementFromPoint(
        x + host.left,
        y + host.top + INTO_SURFACE,
      );
      if (hit?.closest('[data-let-it-fall]')) return 'button';
      if (hit && shelf.contains(hit)) return 'menu';
      return hit?.closest('[data-fell]') ? 'heap' : 'nothing';
    });
    return {
      fell: shelf.hasAttribute('data-fell'),
      share: shelf.getBoundingClientRect().top / innerHeight,
      path,
    };
  });
  expect(found.fell, 'the menu bar stayed up').toBe(true);
  expect(
    Math.abs(found.share - SHELF_SHARE) * SHELF_ROOM.height,
    'the menu shelf is not two thirds down',
  ).toBeLessThanOrEqual(SHELF_TOLERANCE);
  expect(found.path, 'the mascot landed on nothing').not.toContain('nothing');
  expect(found.path.at(-1), 'the mascot did not end on Put It Back').toBe(
    'button',
  );
  expect(
    found.path.indexOf('menu'),
    'the mascot did not climb onto the menu',
  ).toBeGreaterThanOrEqual(0);
});

/* A seed whose heap at the desktop size has places to land on before Put It Back. */
const CLIMB_SEED = 6;

test('every place the mascot lands is a painted block or Put It Back, and it ends on Put It Back', async ({
  page,
}) => {
  await seedRandom(page, CLIMB_SEED);
  await page.setViewportSize({ width: DESKTOP, height: HEIGHT });
  await gotoSettled(page, ROUTE);
  await press(page);
  await mascotClear(page);
  const landings = await page.locator('.fall-hopper').evaluate((feet) => {
    const host = feet.parentElement!.getBoundingClientRect();
    const button = document.querySelector('[data-let-it-fall]')!;
    const stones: { x: number; y: number }[] = JSON.parse(
      (feet as HTMLElement).dataset.stones ?? '[]',
    );
    /* px below the sticker's edge, inside the surface it rests on. */
    const INTO_SURFACE = 4;
    const CLEAR = 'rgba(0, 0, 0, 0)';
    const groundOf = (el: Element | null): string => {
      for (let at = el; at; at = at.parentElement) {
        const fill = getComputedStyle(at).backgroundColor;
        if (fill !== CLEAR) return fill;
      }
      return CLEAR;
    };
    return stones.map(({ x, y }) => {
      const hit = document.elementFromPoint(
        x + host.left,
        y + host.top + INTO_SURFACE,
      );
      if (!hit) return 'nothing';
      if (button.contains(hit)) return 'Put It Back';
      const style = getComputedStyle(hit);
      const behind = groundOf(hit.parentElement);
      const shown =
        style.visibility === 'visible' &&
        Number(style.opacity) > 0 &&
        (hit instanceof HTMLImageElement ||
          (style.backgroundColor !== CLEAR &&
            style.backgroundColor !== behind) ||
          (parseFloat(style.borderTopWidth) > 0 &&
            style.borderTopColor !== CLEAR &&
            style.borderTopColor !== behind));
      return hit.closest('[data-fell]') && shown
        ? 'block'
        : `nothing (${hit.tagName})`;
    });
  });
  expect(
    landings.filter((on) => on === 'block').length,
    'the mascot never landed on the heap, so this test checks nothing',
  ).toBeGreaterThan(0);
  expect(
    landings.filter((on) => on !== 'block' && on !== 'Put It Back'),
    'the mascot landed on something not shown',
  ).toEqual([]);
  expect(landings.at(-1), 'the mascot did not end on Put It Back').toBe(
    'Put It Back',
  );
});

test('the mascot climbs onto the heap, covers no control, and hops home', async ({
  page,
}) => {
  await seedRandom(page, HEAP_SEED);
  await page.setViewportSize({ width: 390, height: HEIGHT });
  await gotoSettled(page, ROUTE);
  await press(page);
  await mascotClear(page);
  await page.keyboard.press('Escape');
  await expect(page.locator('.fall-hopper')).toHaveCount(0);
  const sticker = page.locator('.footer-mascot');
  await expect(sticker).not.toHaveAttribute('data-away');
  await expect(sticker).not.toHaveAttribute('data-hopped');
  await expect(sticker, 'the mascot kept its hop offsets').not.toHaveAttribute(
    'style',
    /./,
  );
});

test('without JavaScript there is no button', async ({ browser, baseURL }) => {
  const context = await browser.newContext({
    baseURL,
    javaScriptEnabled: false,
  });
  const page = await context.newPage();
  await page.goto(ROUTE);
  await expect(page.getByRole('button', FALL)).toHaveCount(0);
  await context.close();
});

test(
  'a talk deck has no button (script budget)',
  ENGINE_INVARIANT,
  async ({ request }) => {
    for (const route of TALK_ROUTES) {
      const html = await (await request.get(`${route}/`)).text();
      expect(html, `${route} ships Let It Fall`).not.toContain(
        'data-let-it-fall',
      );
    }
  },
);
