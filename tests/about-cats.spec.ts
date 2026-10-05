import { expect, test, type Page } from './test';
import { gotoSettled } from './settle';
import {
  MIN_TARGET,
  SUBPIXEL_TOLERANCE,
  REFLOW_VIEWPORT,
  DESKTOP_VIEWPORT,
  PHONE_VIEWPORT,
} from './wcag';
import { AA_TEXT, NON_TEXT, PAGE_HELPERS } from './contrast';
import { NODE } from './tags';
import { readFileSync } from 'node:fs';
import {
  EDGE_MOVES,
  MOVES,
  type MoveName,
  duration,
  pose,
  poseAt,
  withTurn,
  type Move,
} from '../src/lib/about-cats-moves';
import {
  HIT_HALF_WIDTH,
  POST_HEIGHT,
  highestPoint,
  reachOf,
  stepTail,
} from '../src/lib/about-cats-rig';
import { CAT_INSPIRATION } from '../src/lib/credits';
import {
  CONTROL_ROOM,
  MAX_OVERHANG,
  TAIL_REST,
  TRACK_MARGIN,
  cupPush,
  planMove,
} from '../src/lib/about-cats';

/**
 * The About cats (src/components/ui/AboutCats.vue): each cat opens its photo,
 * its sleep control stops it (SC 2.2.2), stillness under reduced motion, and
 * never covering text. Their drawing and motion are decoration and not tested.
 */
const ROUTE = '/about/';
const CATS = ['pepper', 'mochi', 'biscuit'] as const;
const NAMES = { pepper: 'Pepper', mochi: 'Mochi', biscuit: 'Biscuit' } as const;

/** Long enough for several frames of any move; a still cat changes nothing in it. */
const STILL_WINDOW_MS = 800;

/** 1280x1024 at 400%: the SC 1.4.10 reflow case, short as well as narrow. */
const ZOOMED = { width: 320, height: 256 };

/** Tall enough that Pepper's and Mochi's bands are on screen at once; Biscuit's is below. */
const PEPPER_AND_MOCHI = { width: 1350, height: 4000 };

/** Leg height from the bottom of the click box; a raised card covers the last few px. */
const LEG_HEIGHT = 0.15;

/** A cat that lies down settles its tail within this. */
const SETTLE_MS = 3000;

/* Several moves, each followed by a pause of 1 to 3 s (PAUSE_MS in about-cats.ts). */
const PAUSES_WINDOW_MS = 8000;
/*
 * A pause ends in at most three empty frames: the one that finds nothing to draw, one timestamped
 * just before the pause ends, and a new move's unchanged first pose. Running through a pause is 20 or more.
 */
const MAX_EMPTY_FRAMES_IN_A_ROW = 6;

/*
 * Scroll anchoring picks its anchor near the top of the viewport, so each band
 * is tried at every offset from there down, while its drawing jumps a band.
 */
const ANCHOR_SWEEP_PX = 200;
const ANCHOR_STEP_PX = 4;
const DRAWING_JUMP_PX = 140;

/** Lying down plays out before the name changes; the longest move is well under this. */
const NAP_TIMEOUT_MS = 10_000;

/** Where the card placement is checked: small phone, phone, tablet, desktop. */
const CARD_VIEWPORTS = [
  { width: 320, height: 640 },
  PHONE_VIEWPORT,
  { width: 768, height: 1024 },
  { width: 1280, height: 900 },
];
/** AboutCats.vue's SIDE_BY_SIDE, 40rem: from here the card sits beside the cat. */
const SIDE_BY_SIDE_MIN = 640;
/** The 16px gap AboutCats.vue keeps, plus rounding. */
const CARD_NEAR = 24;

/** Past the card's 4px border, on its padding. */
const CARD_PADDING_HIT = 12;

const napControl = (page: Page, id: (typeof CATS)[number]) =>
  page.locator(`#cat-spot-${id} .cat-nap`);

/** The top-left corner of the viewport, outside the centred card. */
const BACKDROP_POINT = { x: 4, y: 4 };

const catButton = (page: Page, id: (typeof CATS)[number]) =>
  page.locator(`#cat-spot-${id} .cat-button`);

/** Where the cat stands, not how it is posed: a held cat still blinks. */
const place = (page: Page, id: (typeof CATS)[number]) =>
  page.locator(`#cat-spot-${id} .cat-hit`).getAttribute('transform');

/** Every drawn attribute of one cat but its blinks, so any movement changes the string. */
const drawing = (page: Page, id: (typeof CATS)[number]) =>
  page
    .locator(`#cat-spot-${id} .cat-hit`)
    .evaluate((node) =>
      node.outerHTML.replace(/ (?:x|y|width|height|visibility)="[^"]*"/g, ''),
    );

/** Checks of a held cat's place, each a still window apart. */
const HELD_CHECKS = 3;

/** data-cat-state, set by the colony when it changes: hidden (not stepped), playing, holding or asleep. */
const expectMood = (
  page: Page,
  id: (typeof CATS)[number],
  mood: 'hidden' | 'playing' | 'holding' | 'asleep' | RegExp,
  why: string,
) =>
  expect(catButton(page, id), why).toHaveAttribute('data-cat-state', mood, {
    timeout: NAP_TIMEOUT_MS,
  });

/**
 * Brings a cat's band on screen and waits for the colony to report it: until then
 * data-cat-state reads "hidden" whatever the cat is doing, so a test reads only its own state.
 */
const showCat = async (page: Page, id: (typeof CATS)[number]) => {
  await page.locator(`#cat-spot-${id}`).scrollIntoViewIfNeeded();
  await expectMood(
    page,
    id,
    /^(playing|holding|asleep)$/,
    `${NAMES[id]} stayed hidden on screen`,
  );
};

/** Points at a cat and waits for it to stop, as a person aiming at it would. */
const pointAt = async (page: Page, id: (typeof CATS)[number]) => {
  const area = page.locator(`#cat-spot-${id} .cat-hit-area`);
  await area.scrollIntoViewIfNeeded();
  await area.hover({ force: true });
  await expectMood(
    page,
    id,
    /^(holding|asleep)$/,
    `${NAMES[id]} kept playing under the pointer`,
  );
  await expect(async () => {
    const before = await place(page, id);
    await page.waitForTimeout(STILL_WINDOW_MS);
    expect(await place(page, id)).toBe(before);
  }, `${NAMES[id]} kept moving under the pointer`).toPass({
    timeout: NAP_TIMEOUT_MS,
  });
  return area;
};

const expectStill = async (
  page: Page,
  id: (typeof CATS)[number],
  why: string,
) => {
  const before = await drawing(page, id);
  await page.waitForTimeout(STILL_WINDOW_MS);
  expect(await drawing(page, id), why).toBe(before);
};

/** Motion that stops within this needs no pause control. */
const SC_2_2_2_MS = 5000;

/** The post's cap and half its edge stroke above POST_HEIGHT. */
const POST_CAP = 6;

/** Sub-pixel rounding in a cat's place along the track, in px. */
const ROUNDING_PX = 1;

/** A frame at 60fps: fine enough to catch the top of every arc. */
const FRAME_MS = 1000 / 60;

const catBand = (): number => {
  const css = readFileSync('src/styles/global.css', 'utf8');
  const match = /^\s*--spacing-cat-band:\s*(\d+)px;/m.exec(css);
  if (!match) throw new Error('global.css defines no --spacing-cat-band in px');
  return Number(match[1]);
};

test('no move lifts any part of a cat above its band', NODE, () => {
  const band = catBand();
  const moves: [string, Move][] = [
    ...Object.entries(MOVES).map(
      ([name, make]) => [name, make()] as [string, Move],
    ),
  ];
  const tooHigh: string[] = [];
  for (const [name, move] of moves) {
    const start = move.steps[0].pose;
    for (let t = 0; t <= duration(move); t += FRAME_MS) {
      const p = poseAt(move, start, t);
      const height = highestPoint(p);
      if (height > band) {
        tooHigh.push(`${name} at ${Math.round(t)}ms: ${Math.round(height)}px`);
        break;
      }
    }
    if (move.propAt) {
      for (let t = 0; t <= duration(move); t += FRAME_MS) {
        const prop = move.propAt(t);
        /* The post stands up from its point; its cap and edge add a few px. */
        const top =
          -prop.y + (prop.kind === 'post' ? POST_HEIGHT + POST_CAP : 0);
        if (prop.o > 0 && top > band) {
          tooHigh.push(`${name}'s ${prop.kind} at ${Math.round(t)}ms`);
          break;
        }
      }
    }
  }
  expect(
    tooHigh,
    'a move rises above --spacing-cat-band into the text above',
  ).toEqual([]);
});

/** The sleep control's box: `.motion-toggle`, h-10 w-10. */
const CONTROL_SIZE = 40;
/** Band widths the cup push is proved at: phone, small phone and desktop. */
const CUP_WIDTHS = [320, 390, 1280];
/** Band widths from the 320px reflow width up. */
const BAND_WIDTHS = [320, 390, 768, 1280, 1920];
/** Tall enough to lay the page out as a phone or desktop would; the checks read every band, on screen or not. */
const GUARD_HEIGHT = 900;
/** Start positions tried along each track. */
const TRACK_STEPS = 24;

test(
  "no move the track allows takes a cat's hit box under its sleep control (SC 2.2.2)",
  NODE,
  () => {
    const under: string[] = [];
    for (const width of BAND_WIDTHS) {
      const min = TRACK_MARGIN;
      const max = width - TRACK_MARGIN - CONTROL_ROOM;
      for (const name of Object.keys(MOVES) as MoveName[]) {
        if (EDGE_MOVES.has(name)) continue;
        for (let i = 0; i <= TRACK_STEPS; i += 1) {
          const x = min + ((max - min) * i) / TRACK_STEPS;
          for (const facing of [1, -1]) {
            const plan = planMove(name, x, facing, min, max);
            if (!plan) continue;
            const start = plan.move.steps[0].pose;
            for (let t = 0; t <= duration(plan.move); t += FRAME_MS) {
              const at = x + plan.dir * poseAt(plan.move, start, t).x;
              if (
                at + HIT_HALF_WIDTH > width - CONTROL_SIZE ||
                at < min - ROUNDING_PX
              ) {
                under.push(`${name} at ${width}px from ${Math.round(x)}`);
                break;
              }
            }
          }
        }
      }
    }
    expect(under, 'a cat reaches under its sleep control').toEqual([]);
  },
);

test(
  'no drawing reaches more than MAX_OVERHANG past its band, from anywhere on the track, turns included',
  NODE,
  () => {
    const over: string[] = [];
    for (const width of BAND_WIDTHS) {
      const min = TRACK_MARGIN;
      const max = width - TRACK_MARGIN - CONTROL_ROOM;
      for (const name of Object.keys(MOVES) as MoveName[]) {
        for (let i = 0; i <= TRACK_STEPS; i += 1) {
          const x = min + ((max - min) * i) / TRACK_STEPS;
          for (const facing of [1, -1]) {
            const plan = EDGE_MOVES.has(name)
              ? { move: cupPush(x), dir: -1 }
              : planMove(name, x, facing, min, max);
            if (!plan) continue;
            /* As the colony plays it: a cat facing away turns first. */
            const from = { ...pose('sit'), face: facing * plan.dir };
            const move = from.face < 0 ? withTurn(plan.move, from) : plan.move;
            const start = { ...from, face: 1 };
            for (let t = 0; t <= duration(move); t += FRAME_MS) {
              const p = poseAt(move, start, t);
              const [back, ahead] = reachOf(p);
              const at = x + plan.dir * p.x;
              const left = plan.dir > 0 ? at + back : at - ahead;
              const right = plan.dir > 0 ? at + ahead : at - back;
              if (left < -MAX_OVERHANG || right > width + MAX_OVERHANG) {
                over.push(`${name} at ${width}px from ${Math.round(x)}`);
                break;
              }
            }
          }
        }
      }
    }
    expect(
      over,
      'a cat reaches past its band by more than MAX_OVERHANG',
    ).toEqual([]);
  },
);

test(
  'the cup push from anywhere on the track stays in the band, clear of the sleep control, and ends where another move fits, so the cat never freezes',
  NODE,
  () => {
    for (const width of CUP_WIDTHS) {
      const min = TRACK_MARGIN;
      const max = width - TRACK_MARGIN - CONTROL_ROOM;
      for (let i = 0; i <= TRACK_STEPS; i += 1) {
        const x = min + ((max - min) * i) / TRACK_STEPS;
        const push = cupPush(x);
        const start = push.steps[0].pose;
        let nearest = x;
        let farthest = x;
        for (let t = 0; t <= duration(push); t += FRAME_MS) {
          const at = x - poseAt(push, start, t).x;
          nearest = Math.min(nearest, at);
          farthest = Math.max(farthest, at);
        }
        expect(
          nearest,
          'the cat leaves the band at its left end',
        ).toBeGreaterThanOrEqual(0);
        expect(
          farthest + HIT_HALF_WIDTH,
          'the cat reaches under its sleep control',
        ).toBeLessThanOrEqual(width - CONTROL_SIZE);
        const end = x - poseAt(push, start, duration(push)).x;
        expect(end, 'the cat ends off its track').toBeGreaterThanOrEqual(min);
        const next = (Object.keys(MOVES) as MoveName[]).filter(
          (name) => !EDGE_MOVES.has(name) && planMove(name, end, 1, min, max),
        );
        expect(next, 'no move fits once the cup is pushed').not.toEqual([]);
      }
    }
  },
);

test(
  'lying down and getting up end within 5 s with two slow frames to spare, a turn to face the band included (SC 2.2.2)',
  NODE,
  () => {
    const facingAway = { ...pose('sit'), face: -1 };
    const moves: [string, Move][] = [
      ['sleep', MOVES.sleep()],
      ['sleep after a turn', withTurn(MOVES.sleep(true), facingAway)],
      ['wake', withTurn(MOVES.wake(), facingAway)],
    ];
    for (const [name, move] of moves) {
      expect(
        duration(move),
        `${name} leaves no room within 5 s for a slow device's last frames`,
      ).toBeLessThanOrEqual(SC_2_2_2_MS - SLOW_FRAMES_SPARE * SLOW_FRAME_MS);
    }
    expect(
      duration(withTurn(MOVES.sleep(true), facingAway)),
      'turning before lying down takes longer than lying down',
    ).toBeLessThanOrEqual(duration(MOVES.sleep()));
  },
);

/** Frames this far apart, as a loaded device drew them in CI; the tail must still settle in time. */
const SLOW_FRAME_MS = 530;
/** Frames a slow device may still draw after a move ends: the move's last, and the tail's. */
const SLOW_FRAMES_SPARE = 2;
/** A tail swung this far, in degrees per segment, then left to settle. */
const TAIL_SWING = 40;
const TAIL_SEGMENTS = 8;

test(
  'a tail settles in real time even at two frames a second, so a sleeping cat is still within 5 s (SC 2.2.2)',
  NODE,
  () => {
    const tail = {
      tailAngle: [] as number[],
      tailSpeed: [] as number[],
      physAt: 0,
    };
    stepTail(tail, Array(TAIL_SEGMENTS).fill(0), 0);
    const swung = Array(TAIL_SEGMENTS).fill(TAIL_SWING);
    let now = 0;
    do {
      now += SLOW_FRAME_MS;
      stepTail(tail, swung, now);
    } while (
      now < SC_2_2_2_MS &&
      tail.tailSpeed.some((v) => Math.abs(v) > TAIL_REST)
    );
    expect(
      now,
      'the tail was still swinging 5 s after it was left to settle',
    ).toBeLessThan(SC_2_2_2_MS);
  },
);

test.describe('About cats', () => {
  test('each cat is a named button that opens its photo in a dialog, Close first, and returns focus', async ({
    page,
  }) => {
    await gotoSettled(page, ROUTE);
    for (const id of CATS) {
      const button = catButton(page, id);
      await expect(button).toHaveAccessibleName(`Meet ${NAMES[id]}`);
      await expect(button).toHaveAttribute('aria-haspopup', 'dialog');
      await button.focus();
      await page.keyboard.press('Enter');
      const dialog = page.getByRole('dialog', { name: NAMES[id] });
      await expect(
        dialog,
        `${NAMES[id]}'s dialog did not open from the keyboard`,
      ).toBeVisible();
      const close = dialog.getByRole('button', { name: 'Close' });
      await expect(close, 'Close is not first in the card').toBeFocused();
      const size = await close.boundingBox();
      expect(
        size?.height,
        'Close target height (SC 2.5.8)',
      ).toBeGreaterThanOrEqual(MIN_TARGET - SUBPIXEL_TOLERANCE);
      expect(
        size?.width,
        'Close target width (SC 2.5.8)',
      ).toBeGreaterThanOrEqual(MIN_TARGET - SUBPIXEL_TOLERANCE);
      await expect(
        dialog.getByRole('heading', { level: 2, name: NAMES[id] }),
        'the name sticker is not the dialog heading',
      ).toBeVisible();
      await expect(
        dialog.getByRole('img'),
        `${NAMES[id]}'s dialog shows no photo with alt text`,
      ).toHaveAttribute('alt', new RegExp(NAMES[id]));
      await page.keyboard.press('Escape');
      await expect(
        dialog,
        `${NAMES[id]}'s dialog did not close on Escape`,
      ).toBeHidden();
      await expect(
        button,
        `focus did not return to ${NAMES[id]} after the dialog closed`,
      ).toBeFocused();
    }
  });

  test('a pointer click anywhere on a drawn cat, even between its legs, opens its dialog', async ({
    page,
  }) => {
    await gotoSettled(page, ROUTE);
    for (const id of CATS) {
      const area = await pointAt(page, id);
      const box = await area.boundingBox();
      expect(box, `${NAMES[id]} is not drawn`).not.toBeNull();
      if (!box) return;
      await page.mouse.click(
        box.x + box.width / 2,
        box.y + box.height * (1 - LEG_HEIGHT),
      );
      const dialog = page.getByRole('dialog', { name: NAMES[id] });
      await expect(
        dialog,
        `a click at ${NAMES[id]}'s feet missed`,
      ).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(dialog).toBeHidden();
    }
  });

  test('pointing at a playing cat stops it where it is', async ({ page }) => {
    await gotoSettled(page, ROUTE);
    for (const id of CATS) {
      await pointAt(page, id);
      const held = await place(page, id);
      for (let i = 0; i < HELD_CHECKS; i += 1) {
        await page.waitForTimeout(STILL_WINDOW_MS);
        expect(
          await place(page, id),
          `${NAMES[id]} moved off while pointed at`,
        ).toBe(held);
      }
    }
  });

  for (const colorScheme of ['dark', 'light'] as const) {
    test(`the card's name sticker and thank-you reach 4.5:1, the link underlined, in ${colorScheme} mode (SC 1.4.3, 1.4.1)`, async ({
      browser,
    }) => {
      const context = await browser.newContext({ colorScheme });
      const page = await context.newPage();
      await gotoSettled(page, ROUTE);
      await catButton(page, 'pepper').focus();
      await page.keyboard.press('Enter');
      const dialog = page.getByRole('dialog', { name: NAMES.pepper });
      await expect(dialog).toContainText(
        `Thank you for the inspiration, ${CAT_INSPIRATION.name}.`,
      );
      const link = dialog.getByRole('link', { name: CAT_INSPIRATION.name });
      await expect(link).toHaveAttribute('href', CAT_INSPIRATION.href);
      const found = await page.evaluate(`(() => {
        const link = document.querySelector('.cat-dialog a');
        ${PAGE_HELPERS}
        return [link.parentElement, link, document.querySelector('.cat-name')].map((node) => {
          const style = getComputedStyle(node);
          const fg = parse(style.color);
          const bg = effectiveBackground(node);
          return {
            ratio: fg && bg ? ratio(fg, bg) : 0,
            underline: style.textDecorationLine.includes('underline'),
          };
        });
      })()`);
      const [line, anchor, sticker] = found as {
        ratio: number;
        underline: boolean;
      }[];
      expect(
        sticker.ratio,
        'the gold name sticker is under 4.5:1',
      ).toBeGreaterThanOrEqual(AA_TEXT);
      expect(
        line.ratio,
        'the thank-you line is under 4.5:1',
      ).toBeGreaterThanOrEqual(AA_TEXT);
      expect(
        anchor.ratio,
        'the inspiration link is under 4.5:1',
      ).toBeGreaterThanOrEqual(AA_TEXT);
      expect(
        anchor.underline,
        'the inspiration link is told apart by colour alone',
      ).toBe(true);
      await context.close();
    });
  }

  for (const viewport of CARD_VIEWPORTS) {
    test.describe(`at ${viewport.width}px`, () => {
      test.use({ viewport });

      test('the card opens inside the screen (SC 1.4.10) and beside its cat, not over it', async ({
        page,
      }) => {
        const sideBySide = viewport.width >= SIDE_BY_SIDE_MIN;
        await gotoSettled(page, ROUTE);
        for (const id of CATS) {
          const button = catButton(page, id);
          await page
            .locator(`#cat-spot-${id}`)
            .evaluate((node) => node.scrollIntoView({ block: 'center' }));
          await button.focus();
          await page.keyboard.press('Enter');
          const dialog = page.getByRole('dialog', { name: NAMES[id] });
          await expect(dialog).toBeVisible();
          const found = await page.evaluate((catId) => {
            const box = document
              .querySelector('.cat-dialog')!
              .getBoundingClientRect();
            const spot = document.getElementById(`cat-spot-${catId}`)!;
            const cat = spot
              .querySelector('.cat-hit-area')!
              .getBoundingClientRect();
            const band = spot.getBoundingClientRect();
            const inside =
              box.left >= 0 &&
              box.top >= 0 &&
              box.right <= document.documentElement.clientWidth &&
              box.bottom <= window.innerHeight;
            const overlaps =
              box.left < cat.right &&
              cat.left < box.right &&
              box.top < cat.bottom &&
              cat.top < box.bottom;
            /* Distance between the two boxes; 0 where they overlap. */
            const beside = Math.max(
              0,
              box.left - cat.right,
              cat.left - box.right,
            );
            const aboveOrBelow = Math.max(
              0,
              box.top - band.bottom,
              band.top - box.bottom,
            );
            return { inside, overlaps, beside, aboveOrBelow };
          }, id);
          expect(found.inside, `${NAMES[id]}'s card runs off the screen`).toBe(
            true,
          );
          if (sideBySide)
            expect(found.overlaps, `${NAMES[id]}'s card covers her`).toBe(
              false,
            );
          expect(
            sideBySide ? found.beside : found.aboveOrBelow,
            `${NAMES[id]}'s card opens away from her`,
          ).toBeLessThanOrEqual(CARD_NEAR);
          await page.keyboard.press('Escape');
          await expect(dialog).toBeHidden();
        }
      });
    });
  }

  test('at 400% zoom the card scrolls, so its name and Close are reachable (SC 1.4.10)', async ({
    browser,
  }) => {
    const context = await browser.newContext({ viewport: ZOOMED });
    const page = await context.newPage();
    await gotoSettled(page, ROUTE);
    await catButton(page, 'pepper').focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: NAMES.pepper });
    await expect(dialog).toBeVisible();
    const name = dialog.getByRole('heading', { name: NAMES.pepper });
    await name.scrollIntoViewIfNeeded();
    await expect(
      name,
      'the cat name cannot be scrolled into view',
    ).toBeInViewport();
    const close = dialog.getByRole('button', { name: 'Close' });
    await close.scrollIntoViewIfNeeded();
    await expect(close, 'Close cannot be scrolled into view').toBeInViewport();
    await close.click();
    await expect(dialog).toBeHidden();
    await context.close();
  });

  test('a sleeping cat is not redrawn while another cat plays on screen', async ({
    browser,
  }) => {
    const context = await browser.newContext({ viewport: PEPPER_AND_MOCHI });
    const page = await context.newPage();
    await gotoSettled(page, ROUTE);
    await napControl(page, 'pepper').click();
    await expectMood(page, 'pepper', 'asleep', 'Pepper did not fall asleep');
    await expectMood(
      page,
      'mochi',
      'playing',
      'Mochi is not playing beside her',
    );
    await expect(async () => {
      const writes = await page.evaluate(
        (ms) =>
          new Promise<number>((resolve) => {
            let count = 0;
            const observer = new MutationObserver((records) => {
              count += records.length;
            });
            const spot = document.getElementById('cat-spot-pepper');
            if (spot)
              observer.observe(spot, { attributes: true, subtree: true });
            setTimeout(() => {
              observer.disconnect();
              resolve(count);
            }, ms);
          }),
        STILL_WINDOW_MS,
      );
      expect(writes, 'the sleeping cat kept being redrawn').toBe(0);
    }).toPass({ timeout: SC_2_2_2_MS + SETTLE_MS });
    await context.close();
  });

  test('opening and closing the card leaves a cat asleep or playing as it was', async ({
    page,
  }) => {
    await gotoSettled(page, ROUTE);
    await napControl(page, 'pepper').click();
    await expectMood(page, 'pepper', 'asleep', 'Pepper did not fall asleep');
    for (const [id, mood] of [
      ['pepper', 'asleep'],
      ['mochi', /^(playing|holding)$/],
    ] as const) {
      await showCat(page, id);
      await catButton(page, id).focus();
      await page.keyboard.press('Enter');
      const dialog = page.getByRole('dialog', { name: NAMES[id] });
      await expect(dialog).toBeVisible();
      await dialog.getByRole('button', { name: 'Close' }).click();
      await expect(dialog).toBeHidden();
      await expectMood(page, id, mood, `closing the card changed ${NAMES[id]}`);
    }
  });

  test('a click on the backdrop closes the card; Enter on the thank-you link does not', async ({
    page,
  }) => {
    await gotoSettled(page, ROUTE);
    await catButton(page, 'mochi').focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: NAMES.mochi });
    await expect(dialog).toBeVisible();
    const link = dialog.getByRole('link', { name: CAT_INSPIRATION.name });
    await link.evaluate((node) =>
      node.addEventListener('click', (event) => event.preventDefault()),
    );
    await link.focus();
    await page.keyboard.press('Enter');
    await expect(dialog, 'Enter on the link closed the card').toBeVisible();
    await page.mouse.click(BACKDROP_POINT.x, BACKDROP_POINT.y);
    await expect(dialog, 'a backdrop click left the card open').toBeHidden();
  });

  test('a sleeping cat scrolled away and back is still asleep', async ({
    page,
  }) => {
    await gotoSettled(page, ROUTE);
    await napControl(page, 'pepper').click();
    await expectMood(page, 'pepper', 'asleep', 'Pepper did not fall asleep');
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expectMood(page, 'pepper', 'hidden', 'Pepper is still on screen');
    await catButton(page, 'pepper').scrollIntoViewIfNeeded();
    await expectMood(page, 'pepper', 'asleep', 'Pepper woke off screen');
  });

  test('a click on the card itself, padding included, leaves it open', async ({
    page,
  }) => {
    await gotoSettled(page, ROUTE);
    const button = catButton(page, 'mochi');
    await button.focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: NAMES.mochi });
    await expect(dialog).toBeVisible();
    const card = await page.locator('.cat-card').boundingBox();
    expect(card, 'the card is not drawn').not.toBeNull();
    if (!card) return;
    await page.mouse.click(card.x + CARD_PADDING_HIT, card.y + card.height / 2);
    await expect(dialog, 'a click on the card padding closed it').toBeVisible();
  });

  test('keyboard focus holds a cat still, and Tab goes from the cat to its sleep control', async ({
    page,
  }) => {
    await gotoSettled(page, ROUTE);
    const id = 'pepper';
    await showCat(page, id);
    // Holds follow keyboard use, so a key comes first, as it would for a keyboard user.
    await page.keyboard.press('Shift');
    await catButton(page, id).focus();
    await expectMood(
      page,
      id,
      'holding',
      `${NAMES[id]} kept moving while focused`,
    );
    await page.keyboard.press('Tab');
    await expect(
      napControl(page, id),
      `Tab from ${NAMES[id]} did not reach her sleep control`,
    ).toBeFocused();
    await expectMood(
      page,
      id,
      'playing',
      `${NAMES[id]} stayed held once focus left`,
    );
  });

  test('the sleep control stops its cat within 5 s and wakes it again (SC 2.2.2)', async ({
    page,
  }) => {
    await gotoSettled(page, ROUTE);
    for (const id of CATS) {
      const control = napControl(page, id);
      await control.scrollIntoViewIfNeeded();
      await expect(control).toHaveAccessibleName(`Put ${NAMES[id]} to sleep`);
      const lastChange = await page.evaluate(
        ({ id, watch }) =>
          new Promise<number>((resolve) => {
            const spot = document.getElementById(`cat-spot-${id}`);
            const control = spot?.querySelector<HTMLElement>('.cat-nap');
            if (!spot || !control) return resolve(Infinity);
            const cat = spot.querySelector('.cat-hit') ?? spot;
            let last = 0;
            const observer = new MutationObserver(() => {
              last = performance.now();
            });
            observer.observe(cat, { attributes: true, subtree: true });
            const clicked = performance.now();
            control.click();
            setTimeout(() => {
              observer.disconnect();
              resolve(last === 0 ? 0 : last - clicked);
            }, watch);
          }),
        { id, watch: SC_2_2_2_MS + STILL_WINDOW_MS * 2 },
      );
      expect(
        lastChange,
        `${NAMES[id]} was still moving 5 s after the control`,
      ).toBeLessThanOrEqual(SC_2_2_2_MS);
      await expect(
        control,
        'the control does not offer to wake the cat once it is asleep',
      ).toHaveAccessibleName(`Wake ${NAMES[id]}`);
      await expect(
        page.locator(`#cat-spot-${id} .cat-prop`),
        `a toy or box stayed out after ${NAMES[id]} fell asleep`,
      ).toHaveCount(0);
      await control.click();
      await expectMood(
        page,
        id,
        /^(playing|holding)$/,
        `${NAMES[id]} did not wake`,
      );
      await expect(control).toHaveAccessibleName(`Put ${NAMES[id]} to sleep`);
    }
  });

  for (const colorScheme of ['dark', 'light'] as const) {
    test(`the sleep control is a 24px target whose icon and edge reach 3:1 in ${colorScheme} mode (SC 2.5.8, 1.4.11)`, async ({
      browser,
    }) => {
      const context = await browser.newContext({ colorScheme });
      const page = await context.newPage();
      await gotoSettled(page, ROUTE);
      for (const id of CATS) {
        const box = await napControl(page, id).boundingBox();
        expect(
          box?.width,
          `${NAMES[id]}'s sleep control width`,
        ).toBeGreaterThanOrEqual(MIN_TARGET - SUBPIXEL_TOLERANCE);
        expect(
          box?.height,
          `${NAMES[id]}'s sleep control height`,
        ).toBeGreaterThanOrEqual(MIN_TARGET - SUBPIXEL_TOLERANCE);
      }
      const ratios = await page.evaluate(`(() => {
        ${PAGE_HELPERS}
        return [...document.querySelectorAll('.cat-nap')].map((button) => {
          const style = getComputedStyle(button);
          const own = effectiveBackground(button);
          const ground = effectiveBackground(button.parentElement);
          const icon = parse(style.color);
          const edge = parse(style.borderTopColor);
          return {
            icon: icon && own ? ratio(icon, own) : 0,
            edge: edge && ground ? ratio(edge, ground) : 0,
          };
        });
      })()`);
      for (const value of ratios as { icon: number; edge: number }[]) {
        expect(
          value.icon,
          'the sleep icon is under 3:1',
        ).toBeGreaterThanOrEqual(NON_TEXT);
        expect(
          value.edge,
          'the sleep control edge is under 3:1',
        ).toBeGreaterThanOrEqual(NON_TEXT);
      }
      await context.close();
    });
  }

  for (const colorScheme of ['dark', 'light'] as const) {
    test(`the sleep control keeps 3:1 when hovered and focused in ${colorScheme} mode (SC 1.4.11)`, async ({
      browser,
    }) => {
      const context = await browser.newContext({ colorScheme });
      const page = await context.newPage();
      await gotoSettled(page, ROUTE);
      const control = napControl(page, 'pepper');
      const measure = () =>
        page.evaluate(`(() => {
          const button = document.querySelector('#cat-spot-pepper .cat-nap');
          ${PAGE_HELPERS}
          const style = getComputedStyle(button);
          const own = effectiveBackground(button);
          const icon = parse(style.color);
          const ring = parse(style.outlineColor);
          const ground = effectiveBackground(button.parentElement);
          return {
            icon: icon && own ? ratio(icon, own) : 0,
            ring: ring && ground ? ratio(ring, ground) : 0,
            drawn: style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0,
          };
        })()`) as Promise<{ icon: number; ring: number; drawn: boolean }>;
      await control.hover();
      expect(
        (await measure()).icon,
        'the hovered sleep icon is under 3:1',
      ).toBeGreaterThanOrEqual(NON_TEXT);
      await page.mouse.move(0, 0);
      await page.keyboard.press('Shift');
      await control.focus();
      const focused = await measure();
      expect(
        focused.icon,
        'the focused sleep icon is under 3:1',
      ).toBeGreaterThanOrEqual(NON_TEXT);
      /* The outline colour reads as the text colour even with no ring drawn. */
      expect(focused.drawn, 'the focused sleep control draws no ring').toBe(
        true,
      );
      expect(
        focused.ring,
        'the focus ring is under 3:1',
      ).toBeGreaterThanOrEqual(NON_TEXT);
      await context.close();
    });
  }

  test('under reduced motion the cats sit still with no sleep control', async ({
    browser,
  }) => {
    const context = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await context.newPage();
    await gotoSettled(page, ROUTE);
    await expect(page.getByRole('button', { name: /^Meet / })).toHaveCount(
      CATS.length,
    );
    await expect(
      page.locator('.cat-nap'),
      'a sleep control shows while nothing moves',
    ).toHaveCount(0);
    for (const id of CATS) {
      await page.locator(`#cat-spot-${id}`).scrollIntoViewIfNeeded();
      await expectStill(page, id, `${NAMES[id]} moved under reduced motion`);
      const button = catButton(page, id);
      await button.focus();
      await page.keyboard.press('Enter');
      await expect(page.getByRole('dialog', { name: NAMES[id] })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(
        button,
        'under reduced motion a cat is only met',
      ).toHaveAccessibleName(`Meet ${NAMES[id]}`);
    }
    await context.close();
  });

  test('a cat reports hidden until its band is on screen, then its own state', async ({
    page,
  }) => {
    await gotoSettled(page, ROUTE);
    const spot = page.locator('#cat-spot-biscuit');
    await expect(
      spot,
      'Biscuit starts on screen, so this proves nothing',
    ).not.toBeInViewport();
    /* "hidden" is also the state before any report: wait for an observer made after the page's to report, so the page's has too. */
    await spot.evaluate(
      (node) =>
        new Promise<void>((resolve) => {
          const seen = new IntersectionObserver(() => {
            seen.disconnect();
            requestAnimationFrame(() => resolve());
          });
          seen.observe(node);
        }),
    );
    await expectMood(
      page,
      'biscuit',
      'hidden',
      'Biscuit claims a state off screen',
    );
    await spot.scrollIntoViewIfNeeded();
    await expectMood(
      page,
      'biscuit',
      /^(playing|holding|asleep)$/,
      'Biscuit stayed hidden on screen',
    );
  });

  test('the cats stop drawing once they are off screen', async ({ page }) => {
    await gotoSettled(page, ROUTE);
    await page.locator('#cat-spot-biscuit').scrollIntoViewIfNeeded();
    await expectMood(
      page,
      'biscuit',
      /^(playing|holding|asleep)$/,
      'Biscuit never came on screen',
    );
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    for (const id of CATS)
      await expectMood(page, id, 'hidden', `${NAMES[id]} is still on screen`);
    const writes = await page.evaluate(
      (ms) =>
        new Promise<number>((resolve) => {
          let count = 0;
          const observer = new MutationObserver((records) => {
            count += records.length;
          });
          for (const spot of document.querySelectorAll('.cat-spot'))
            observer.observe(spot, { attributes: true, subtree: true });
          setTimeout(() => {
            observer.disconnect();
            resolve(count);
          }, ms);
        }),
      STILL_WINDOW_MS,
    );
    expect(writes, 'the cats kept drawing while off screen').toBe(0);
  });

  /* Counted in a row, not in total: a loaded machine runs fewer frames, never longer empty runs. */
  test('a cat pausing between moves runs no empty animation frames', async ({
    browser,
  }) => {
    const context = await browser.newContext({ viewport: PEPPER_AND_MOCHI });
    const page = await context.newPage();
    await gotoSettled(page, ROUTE);
    for (const id of ['pepper', 'mochi'] as const) {
      await napControl(page, id).click();
      await expectMood(page, id, 'asleep', `${NAMES[id]} did not fall asleep`);
    }
    await catButton(page, 'biscuit').scrollIntoViewIfNeeded();
    await expectMood(page, 'biscuit', 'playing', 'Biscuit is not playing');
    const { emptyInARow, drawn } = await page.evaluate(
      (ms) =>
        new Promise<{ emptyInARow: number; drawn: number }>((resolve) => {
          const counts = { emptyInARow: 0, drawn: 0 };
          let run = 0;
          const observer = new MutationObserver(() => {});
          for (const spot of document.querySelectorAll('.cat-spot'))
            observer.observe(spot, { attributes: true, subtree: true });
          const request = window.requestAnimationFrame.bind(window);
          window.requestAnimationFrame = (callback) =>
            request((now) => {
              callback(now);
              if (observer.takeRecords().length > 0) {
                counts.drawn += 1;
                run = 0;
              } else {
                run += 1;
                counts.emptyInARow = Math.max(counts.emptyInARow, run);
              }
            });
          setTimeout(() => {
            observer.disconnect();
            resolve(counts);
          }, ms);
        }),
      PAUSES_WINDOW_MS,
    );
    expect(
      drawn,
      'Biscuit drew nothing, so no pause was measured',
    ).toBeGreaterThan(0);
    expect(
      emptyInARow,
      'the loop kept running animation frames through a pause with nothing to draw',
    ).toBeLessThanOrEqual(MAX_EMPTY_FRAMES_IN_A_ROW);
    await context.close();
  });

  for (const viewport of [REFLOW_VIEWPORT, PHONE_VIEWPORT, DESKTOP_VIEWPORT]) {
    test(`each sleep control is on top at its centre at ${viewport.width}px (SC 2.2.2)`, async ({
      browser,
    }) => {
      const context = await browser.newContext({ viewport });
      const page = await context.newPage();
      await gotoSettled(page, ROUTE);
      for (const id of CATS) {
        const control = napControl(page, id);
        await control.scrollIntoViewIfNeeded();
        const onTop = await control.evaluate((node) => {
          const box = node.getBoundingClientRect();
          const hit = document.elementFromPoint(
            box.left + box.width / 2,
            box.top + box.height / 2,
          );
          return Boolean(hit && node.contains(hit));
        });
        expect(onTop, `${NAMES[id]}'s sleep control is covered`).toBe(true);
      }
      await context.close();
    });
  }

  for (const width of BAND_WIDTHS) {
    test(`no cat band, widened by MAX_OVERHANG, covers text or a control, and the page does not scroll sideways, at ${width}px`, async ({
      browser,
    }) => {
      const context = await browser.newContext({
        viewport: { width, height: GUARD_HEIGHT },
      });
      const page = await context.newPage();
      await gotoSettled(page, ROUTE);
      const found = await page.evaluate((overhang) => {
        const bands = [
          ...document.querySelectorAll<HTMLElement>('.cat-spot'),
        ].map((spot) => {
          const box = spot.getBoundingClientRect();
          return {
            id: spot.id,
            left: box.left - overhang,
            right: box.right + overhang,
            top: box.top,
            bottom: box.bottom,
          };
        });
        const hits: string[] = [];
        const check = (rect: DOMRect, what: string) => {
          for (const band of bands)
            if (
              rect.width > 0 &&
              rect.right > band.left &&
              rect.left < band.right &&
              rect.bottom > band.top &&
              rect.top < band.bottom
            )
              hits.push(`${band.id}: ${what}`);
        };
        const walker = document.createTreeWalker(
          document.body,
          NodeFilter.SHOW_TEXT,
        );
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          const text = node.textContent?.trim();
          const parent = node.parentElement;
          if (
            !text ||
            !parent ||
            parent.closest('.cat-spot, dialog, .sr-only, [hidden]')
          )
            continue;
          const range = document.createRange();
          range.selectNodeContents(node);
          for (const rect of range.getClientRects())
            check(rect, `"${text.slice(0, 40)}"`);
        }
        for (const el of document.querySelectorAll<HTMLElement>(
          'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])',
        )) {
          /* Not the cats' own buttons, nor a container the bands sit in. */
          if (
            el.closest('.cat-spot, dialog, [hidden]') ||
            el.querySelector('.cat-spot')
          )
            continue;
          check(el.getBoundingClientRect(), el.outerHTML.slice(0, 60));
        }
        const root = document.documentElement;
        return { hits, scrolls: root.scrollWidth > root.clientWidth };
      }, MAX_OVERHANG);
      expect(
        found.hits,
        'a cat band, overhang included, overlaps text or a control',
      ).toEqual([]);
      expect(found.scrolls, 'the page scrolls sideways').toBe(false);
      await context.close();
    });
  }

  test('a moving cat never scrolls the page under the reader (SC 2.4.11)', async ({
    browser,
  }) => {
    /* About 900 frames (3 cats, 51 offsets, 6 frames each): 15 s at 60 fps, slower under load. */
    test.slow();
    /* Reduced motion keeps the cats still, so only the test's jump moves a drawing. */
    const context = await browser.newContext({
      reducedMotion: 'reduce',
      viewport: DESKTOP_VIEWPORT,
    });
    const page = await context.newPage();
    await gotoSettled(page, ROUTE);
    await expect(page.locator('svg.cat-svg[viewBox]')).toHaveCount(CATS.length);

    const dragged = await page.evaluate(
      async ({ cats, sweep, step, jump }) => {
        const frames = (count: number) =>
          new Promise<void>((done) => {
            let left = count;
            const next = () =>
              --left <= 0 ? done() : requestAnimationFrame(next);
            requestAnimationFrame(next);
          });
        const found: string[] = [];
        for (const id of cats) {
          const spot = document.getElementById(`cat-spot-${id}`);
          const svg = spot?.querySelector('svg.cat-svg');
          const box = svg?.getAttribute('viewBox');
          if (!spot || !svg || !box) throw new Error(`${id} has no drawing.`);
          const [x, y, width, height] = box.split(' ').map(Number);
          for (let offset = 0; offset <= sweep; offset += step) {
            window.scrollTo(
              0,
              spot.getBoundingClientRect().top + window.scrollY - offset,
            );
            await frames(2);
            const before = window.scrollY;
            svg.setAttribute('viewBox', `${x} ${y + jump} ${width} ${height}`);
            await frames(2);
            const after = window.scrollY;
            svg.setAttribute('viewBox', box);
            await frames(2);
            if (after !== before) {
              found.push(
                `${id} at ${offset}px from the top: scrollY ${before} to ${after}`,
              );
            }
          }
        }
        return found;
      },
      {
        cats: CATS,
        sweep: ANCHOR_SWEEP_PX,
        step: ANCHOR_STEP_PX,
        jump: DRAWING_JUMP_PX,
      },
    );
    expect(
      dragged,
      'the page scrolled with a cat, so a scroll anchor sits in a cat band',
    ).toEqual([]);
    await context.close();
  });

  test('a drawn cat is at least 24 by 24px (SC 2.5.8)', async ({ page }) => {
    await gotoSettled(page, ROUTE);
    for (const id of CATS) {
      const box = await page
        .locator(`#cat-spot-${id} .cat-hit-area`)
        .boundingBox();
      expect(box?.width, `${NAMES[id]}'s target width`).toBeGreaterThanOrEqual(
        MIN_TARGET - SUBPIXEL_TOLERANCE,
      );
      expect(
        box?.height,
        `${NAMES[id]}'s target height`,
      ).toBeGreaterThanOrEqual(MIN_TARGET - SUBPIXEL_TOLERANCE);
    }
  });

  for (const colorScheme of ['dark', 'light'] as const) {
    test(`the sticker edge is at least 3:1 against the page in ${colorScheme} mode (SC 1.4.11)`, async ({
      browser,
    }) => {
      const context = await browser.newContext({ colorScheme });
      const page = await context.newPage();
      await gotoSettled(page, ROUTE);
      const ratios = await page.evaluate(`(() => {
        ${PAGE_HELPERS}
        return [...document.querySelectorAll('.cat-spot')].map((spot) => {
          const edge = spot.querySelector('.cat-edge');
          const fill = edge ? parse(getComputedStyle(edge).fill) : null;
          const ground = effectiveBackground(spot);
          return fill && ground ? ratio(fill, ground) : 0;
        });
      })()`);
      for (const value of ratios as number[]) {
        expect(
          value,
          'the cat edge fails SC 1.4.11 against its ground',
        ).toBeGreaterThanOrEqual(NON_TEXT);
      }
      await context.close();
    });
  }

  test('the drawings are hidden from assistive technology and the AI label is on the page', async ({
    page,
  }) => {
    await gotoSettled(page, ROUTE);
    for (const id of CATS) {
      const drawings = page.locator(`#cat-spot-${id} svg`);
      await expect(drawings, 'the cat and its sleep icon').toHaveCount(2);
      for (const svg of await drawings.all())
        await expect(svg).toHaveAttribute('aria-hidden', 'true');
    }
    await expect(
      page.getByText('The moving cats are drawn with AI.'),
    ).toBeVisible();
  });

  test('without JavaScript there are no cats and the AI label stays', async ({
    browser,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto(ROUTE);
    await expect(page.locator('.cat-button')).toHaveCount(0);
    await expect(
      page.getByText('The moving cats are drawn with AI.'),
    ).toBeVisible();
    await context.close();
  });
});
