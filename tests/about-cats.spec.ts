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
import {
  createIdle,
  idleFrameMs,
  idleOffsets,
  rearmIdle,
  tickIdle,
} from '../src/lib/about-cats-idle';
import { isTricksData, tricksOf } from '../src/lib/about-cats-tricks';
import tricksData from '../src/lib/about-cats-tricks.json' with { type: 'json' };
import { CAT_INSPIRATION } from '../src/lib/credits';
import {
  CONTROL_ROOM,
  MAX_OVERHANG,
  NAP_AFTER_MS,
  POINTER_IDLE_MS,
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
/** Long enough for a loop running every frame to pass MAX_EMPTY_FRAMES_IN_A_ROW many times over. */
const LOOP_WINDOW_MS = 500;

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

/** The top-left corner of the viewport, outside the centered card. */
const BACKDROP_POINT = { x: 4, y: 4 };

const tricksButton = (page: Page, id: (typeof CATS)[number]) =>
  page.locator(`#cat-spot-${id} .cat-tricks-button`);

const tricksList = (page: Page, id: (typeof CATS)[number]) =>
  page.locator(`#cat-tricks-${id}`);

const { tricks: TRICKS } = tricksData;
const ICONS: Record<string, unknown[]> = tricksData.icons;

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

test(
  "the pounce's and the stalk's leap spans the air and the landing, so the paws touch down as the arc ends",
  NODE,
  () => {
    for (const name of ['pounce', 'stalk'] as const) {
      const move = MOVES[name]();
      const air = move.steps.findIndex(
        (s) =>
          JSON.stringify(s.pose) ===
          JSON.stringify(pose('air', { x: s.pose.x })),
      );
      expect(air, `${name} has no leap`).toBeGreaterThan(0);
      const airFrom = move.steps
        .slice(0, air)
        .reduce((sum, s) => sum + s.ms, 0);
      const landed = airFrom + move.steps[air].ms + move.steps[air + 1].ms;
      expect(
        move.mods.some((m) => m.from === airFrom && m.to === landed),
        `${name}'s arc does not run from take-off to touchdown`,
      ).toBe(true);
    }
  },
);

/** How far any pose value may sit from the plain sit pose at a move's end. */
const SIT_TOLERANCE = 0.01;

test(
  'every play move ends in a plain sit on the ground, so the cat settles and the next move starts from rest',
  NODE,
  () => {
    const start = pose('sit');
    const playMoves = (Object.keys(MOVES) as MoveName[]).filter(
      (name) => name !== 'sleep' && name !== 'wake',
    );
    for (const name of playMoves) {
      const end = poseAt(MOVES[name](), start, duration(MOVES[name]()));
      const sit = pose('sit', { x: end.x, face: end.face });
      const off = (Object.keys(sit) as (keyof typeof sit)[]).filter((key) => {
        const a = end[key];
        const b = sit[key];
        return Array.isArray(a) && Array.isArray(b)
          ? Math.abs(a[0] - b[0]) > SIT_TOLERANCE ||
              Math.abs(a[1] - b[1]) > SIT_TOLERANCE
          : Math.abs(Number(a) - Number(b)) > SIT_TOLERANCE;
      });
      expect(off, `${name} ends away from a plain sit`).toEqual([]);
    }
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

test(
  "every cat's tricks are named and drawn once each, and every play move is on a list",
  NODE,
  () => {
    const listed = new Set<string>();
    for (const id of CATS) {
      const names = tricksOf(id);
      const labels = names.map((name) => TRICKS[name].label);
      expect(new Set(labels).size, `${NAMES[id]} lists a trick twice`).toBe(
        labels.length,
      );
      for (const name of names) {
        listed.add(name);
        expect(
          ICONS[TRICKS[name].icon].length,
          `${name} has no icon`,
        ).toBeGreaterThan(0);
      }
    }
    for (const [name, trick] of Object.entries(TRICKS))
      expect(
        ICONS[trick.icon]?.length,
        `${name} names an icon that is not drawn`,
      ).toBeGreaterThan(0);
    const playMoves = (Object.keys(MOVES) as MoveName[]).filter(
      (name) => name !== 'sleep' && name !== 'wake',
    );
    expect(
      playMoves.filter((name) => !listed.has(name)),
      "a play move is on no cat's list",
    ).toEqual([]);
  },
);

test(
  'isTricksData accepts the shipped JSON and refuses a body that would fail at render',
  NODE,
  () => {
    expect(
      isTricksData(tricksData),
      'the shipped JSON fails its own guard',
    ).toBe(true);
    const without = (key: string) => {
      const copy = structuredClone(tricksData) as Record<
        string,
        Record<string, unknown>
      >;
      delete copy.tricks[key];
      return copy;
    };
    expect(isTricksData(without('random')), 'a missing Random').toBe(false);
    expect(isTricksData(without('fly')), 'a missing move').toBe(false);
    const noIcon = structuredClone(tricksData) as Record<
      string,
      Record<string, unknown>
    >;
    delete noIcon.icons.fly;
    expect(isTricksData(noIcon), 'a trick whose icon is not drawn').toBe(false);
    for (const body of [null, 'Not found', [], {}, { tricks: {}, icons: {} }])
      expect(isTricksData(body), `accepted ${JSON.stringify(body)}`).toBe(
        false,
      );
  },
);

test(
  'a resting cat idles in small offsets: breath, glance, ear and tail stay in range, and each really moves',
  NODE,
  () => {
    const MAX = { bt: 4, hr: 30, ears: 1, ta: 16 };
    const SPAN_MS = 120_000;
    const STEP_MS = 50;
    for (const roll of [() => 0, () => 0.9, () => 1, Math.random]) {
      const idle = createIdle();
      const seen = { bt: 0, hr: 0, ears: 0, tw: 0 };
      const outOfRange: string[] = [];
      for (let now = 0; now < SPAN_MS; now += STEP_MS) {
        tickIdle(idle, now, roll);
        const o = idleOffsets(idle, now);
        if (Math.abs(o.bt) > MAX.bt) outOfRange.push(`chest ${o.bt} at ${now}`);
        if (Math.abs(o.hr) > MAX.hr) outOfRange.push(`head ${o.hr} at ${now}`);
        if (Math.abs(o.ta) > MAX.ta) outOfRange.push(`tail ${o.ta} at ${now}`);
        if (o.ears < 0 || o.ears > MAX.ears)
          outOfRange.push(`ear ${o.ears} at ${now}`);
        seen.bt = Math.max(seen.bt, Math.abs(o.bt));
        seen.hr = Math.max(seen.hr, Math.abs(o.hr));
        seen.ears = Math.max(seen.ears, o.ears);
        seen.tw = Math.max(seen.tw, o.tw);
      }
      expect(outOfRange.slice(0, 3), 'an idle offset left its range').toEqual(
        [],
      );
      expect(seen.bt, 'the chest never moved').toBeGreaterThan(0);
      expect(seen.ears, 'no ear ever flicked').toBeGreaterThan(0);
      expect(seen.tw, 'the tail tip never twitched').toBeGreaterThan(0);
    }
    const glancing = createIdle();
    let turned = 0;
    for (let now = 0; now < SPAN_MS; now += STEP_MS) {
      tickIdle(glancing, now, () => 0.9);
      turned = Math.max(turned, Math.abs(idleOffsets(glancing, now).hr));
    }
    expect(turned, 'the head never turned').toBeGreaterThan(0);
  },
);

test(
  'after a move, resting cats start their timers again and do not flick, glance or twitch together',
  NODE,
  () => {
    const START_MS = 10_000;
    const MOVE_MS = 30_000;
    const resumeAt = START_MS + MOVE_MS;
    const cats = [0.1, 0.5, 0.9].map((fixed) => {
      const idle = createIdle();
      tickIdle(idle, START_MS, () => fixed);
      return { idle, fixed };
    });
    for (const { idle, fixed } of cats) {
      rearmIdle(idle);
      tickIdle(idle, resumeAt, () => fixed);
      const first = idleOffsets(idle, resumeAt);
      expect(
        [first.ears, first.hr, first.tw],
        'a cat flicked, glanced or twitched on its first frame after a move',
      ).toEqual([0, 0, 0]);
    }
    const firstFlick = cats.map(({ idle, fixed }) => {
      for (let now = resumeAt; now < resumeAt + 20_000; now += 50) {
        tickIdle(idle, now, () => fixed);
        if (idleOffsets(idle, now).ears > 0) return now;
      }
      return Infinity;
    });
    expect(
      new Set(firstFlick).size,
      `cats flicked an ear together after a move: ${firstFlick.join(', ')}`,
    ).toBe(firstFlick.length);
  },
);

test(
  'resting cats do not flick, glance or twitch together, and idle frames slow down while only the breath moves',
  NODE,
  () => {
    const START_MS = 10_000;
    const firstFlick = [0.1, 0.5, 0.9].map((fixed) => {
      const idle = createIdle();
      for (let now = START_MS; now < START_MS + 20_000; now += 50) {
        tickIdle(idle, now, () => fixed);
        if (idleOffsets(idle, now).ears > 0) return now;
      }
      return Infinity;
    });
    expect(
      new Set(firstFlick).size,
      `cats flicked an ear together: ${firstFlick.join(', ')}`,
    ).toBe(firstFlick.length);
    expect(
      Math.min(...firstFlick),
      'a cat flicked on its first idle frame',
    ).toBeGreaterThan(START_MS);
    const idle = createIdle();
    tickIdle(idle, START_MS, () => 0.5);
    const calm = idleFrameMs(idle, START_MS);
    let busy = Infinity;
    for (let now = START_MS; now < START_MS + 20_000; now += 50) {
      tickIdle(idle, now, () => 0.5);
      busy = Math.min(busy, idleFrameMs(idle, now));
    }
    expect(
      idleFrameMs(createIdle(), 0),
      'a cat that has not yet had an event draws at the busy rate',
    ).toBe(calm);
    expect(
      busy,
      'a flick or glance drew no faster than the breath',
    ).toBeLessThan(calm);
  },
);

/** A head turned at least this far, in degrees, has turned to the pointer; under this, it is level again. */
const HEAD_TURNED_DEG = 5;
const HEAD_LEVEL_DEG = 1;
/** How far a cat's head is turned, in degrees, read from its drawn transform. */
const headTurn = (page: Page, id: (typeof CATS)[number]) =>
  page.locator(`#cat-spot-${id} .cat-fill`).evaluate((fill) => {
    /* The head is the one part placed with a translate and a single-argument rotate. */
    for (const part of fill.querySelectorAll('[transform]')) {
      const turn = /translate\([^)]*\) rotate\(([-\d.]+)\)/.exec(
        part.getAttribute('transform') ?? '',
      );
      if (turn) return Math.abs(Number(turn[1]));
    }
    throw new Error('The cat has no head turn to read.');
  });

/* Window for counting animation frames: none in it means the renderer, not the cat loop, has stopped. */
const FRAME_COUNT_MS = 500;

/** What a stuck cat's page shows: its reported state, band visibility, tab visibility and frame rate. */
const catState = async (page: Page, id: (typeof CATS)[number]) => {
  try {
    const state = await page.evaluate(
      ([spotId, windowMs]) =>
        new Promise<Record<string, unknown>>((resolve) => {
          const spot = document.getElementById(String(spotId));
          let frames = 0;
          let done = false;
          const count = () => {
            if (done) return;
            frames += 1;
            requestAnimationFrame(count);
          };
          requestAnimationFrame(count);
          setTimeout(() => {
            done = true;
            resolve({
              state: spot
                ?.querySelector('[data-cat-state]')
                ?.getAttribute('data-cat-state'),
              bandVisible: spot?.hasAttribute('data-cat-visible'),
              documentHidden: document.hidden,
              framesIn500ms: frames,
            });
          }, Number(windowMs));
        }),
      [`cat-spot-${id}`, FRAME_COUNT_MS] as const,
    );
    return JSON.stringify({ ...state, headTurn: await headTurn(page, id) });
  } catch (error) {
    return `the page state could not be read: ${String(error)}`;
  }
};

/** Frames a loaded runner draws late, beyond the 5 s bound for lying down. */
const SLEEP_MARGIN_MS = 1000;
/** A cat counts as settled once its drawing has not changed for this long. */
const QUIET_MS = 500;
/* Frames as well as time: a starved runner can draw no frame for QUIET_MS while the cat is still mid-move. */
const QUIET_FRAMES = 10;
/** Resolves true once a cat's drawing is unchanged for QUIET_MS and QUIET_FRAMES frames, or false if it is still changing after `limitMs`. */
const settles = (page: Page, id: (typeof CATS)[number], limitMs: number) =>
  page.evaluate(
    ([spotId, quietMs, quietFrames, maxMs]) =>
      new Promise<boolean>((resolve) => {
        const drawing = document
          .getElementById(String(spotId))
          ?.querySelector('.cat-svg');
        if (!drawing) throw new Error(`#${spotId} has no .cat-svg to watch.`);
        let changed = false;
        const observer = new MutationObserver(() => {
          changed = true;
        });
        observer.observe(drawing, {
          attributes: true,
          childList: true,
          subtree: true,
        });
        let started = -1;
        let changedAt = -1;
        let still = 0;
        const check = (now: number) => {
          if (started < 0) started = changedAt = now;
          if (changed || observer.takeRecords().length > 0) {
            changed = false;
            changedAt = now;
            still = 0;
          } else {
            still += 1;
          }
          if (
            still >= Number(quietFrames) &&
            now - changedAt >= Number(quietMs)
          ) {
            observer.disconnect();
            resolve(true);
          } else if (now - started >= Number(maxMs)) {
            observer.disconnect();
            resolve(false);
          } else {
            requestAnimationFrame(check);
          }
        };
        requestAnimationFrame(check);
      }),
    [`cat-spot-${id}`, QUIET_MS, QUIET_FRAMES, limitMs] as const,
  );

/** Counts the changes to one cat's drawing (its SVG, props included, not its controls) over a window: a redraw rewrites its paths. */
const MUTATION_WINDOW_MS = 1200;
const drawnIn = (
  page: Page,
  id: (typeof CATS)[number],
  windowMs = MUTATION_WINDOW_MS,
) =>
  page.evaluate(
    ([spotId, ms]) =>
      new Promise<number>((resolve) => {
        const drawing = document
          .getElementById(String(spotId))
          ?.querySelector('.cat-svg');
        if (!drawing) throw new Error(`#${spotId} has no .cat-svg to watch.`);
        let count = 0;
        const observer = new MutationObserver((records) => {
          count += records.length;
        });
        observer.observe(drawing, {
          attributes: true,
          childList: true,
          subtree: true,
        });
        setTimeout(() => {
          count += observer.takeRecords().length;
          observer.disconnect();
          resolve(count);
        }, Number(ms));
      }),
    [`cat-spot-${id}`, windowMs] as const,
  );

/** Animation frames in which one cat's drawing changed over a window. */
const framesDrawnIn = (page: Page, id: (typeof CATS)[number], ms: number) =>
  page.evaluate(
    ([spotId, windowMs]) =>
      new Promise<number>((resolve) => {
        const drawing = document
          .getElementById(String(spotId))
          ?.querySelector('.cat-svg');
        const observer = new MutationObserver(() => {});
        if (drawing)
          observer.observe(drawing, {
            attributes: true,
            childList: true,
            subtree: true,
          });
        let frames = 0;
        const request = window.requestAnimationFrame.bind(window);
        window.requestAnimationFrame = (callback) =>
          request((now) => {
            callback(now);
            if (observer.takeRecords().length > 0) frames += 1;
          });
        setTimeout(() => {
          observer.disconnect();
          window.requestAnimationFrame = request;
          resolve(frames);
        }, Number(windowMs));
      }),
    [`cat-spot-${id}`, ms] as const,
  );

/** A resting cat is drawn at most this often, in frames a second: the quick idle rate, well below the animation frame rate. */
const IDLE_MAX_FPS = 25;
/** Frames that must show a resting cat is idling, not frozen, in the window. */
const IDLE_MIN_FRAMES = 3;

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
        'the inspiration link is told apart by color alone',
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
        `a toy or prop stayed out after ${NAMES[id]} fell asleep`,
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
      /* The outline color reads as the text color even with no ring drawn. */
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

  test("the paw opens the cat's tricks, Random first and focused, each row a 44px target, and Escape returns focus to it", async ({
    page,
  }) => {
    await gotoSettled(page, ROUTE);
    const id = 'pepper';
    await showCat(page, id);
    const paw = tricksButton(page, id);
    await expect(paw).toHaveAccessibleName(`Choose a trick for ${NAMES[id]}`);
    await expect(
      paw,
      'the closed paw is not exposed as collapsed from load',
    ).toHaveAttribute('aria-expanded', 'false');
    await page.keyboard.press('Shift');
    await paw.focus();
    await page.keyboard.press('Enter');
    const list = tricksList(page, id);
    await expect(list).toBeVisible();
    await expect(
      paw,
      'an open list is not exposed as expanded',
    ).toMatchAriaSnapshot(
      `- button "Choose a trick for ${NAMES[id]}" [expanded]`,
    );
    const rows = list.getByRole('button');
    await expect(rows.first()).toHaveAccessibleName('Random');
    await expect(rows).toHaveCount(tricksOf(id).length + 1);
    for (const height of await rows.evaluateAll((nodes) =>
      nodes.map((node) => node.getBoundingClientRect().height),
    ))
      expect(height, 'a trick row is shorter than 44px').toBeGreaterThanOrEqual(
        MIN_TARGET - SUBPIXEL_TOLERANCE,
      );
    await expect(
      rows.first(),
      'opening the list left focus on the paw',
    ).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(list).toBeHidden();
    await expect(paw, 'Escape lost focus').toBeFocused();
    await expect(
      paw,
      'a closed list is still exposed as expanded',
    ).toHaveAttribute('aria-expanded', 'false');
  });

  test('a picked trick plays, and a sleeping cat gets up for it', async ({
    page,
  }) => {
    await gotoSettled(page, ROUTE);
    const id = 'mochi';
    await showCat(page, id);
    await napControl(page, id).click();
    await expectMood(page, id, 'asleep', `${NAMES[id]} did not go to sleep`);
    const wing = page.locator(`#cat-spot-${id} .cat-prop-wing`);
    await expect(wing).toHaveCount(0);
    await tricksButton(page, id).click();
    const row = tricksList(page, id).getByRole('button', {
      name: TRICKS.fly.label,
    });
    await row.focus();
    await page.keyboard.press('Enter');
    await expect(tricksList(page, id)).toBeHidden();
    await expect(
      napControl(page, id),
      `${NAMES[id]} stayed asleep for the trick`,
    ).toHaveAccessibleName(`Put ${NAMES[id]} to sleep`);
    await expect(wing.first(), 'the picked fly never appeared').toBeAttached({
      timeout: NAP_TIMEOUT_MS,
    });
  });

  test('a trick list still loading is announced in a status region and takes focus when it arrives', async ({
    page,
  }) => {
    const id = 'pepper';
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    await page.route('**/about-cats-tricks*.json', async (route) => {
      await held;
      await route.fulfill({ json: tricksData });
    });
    await gotoSettled(page, ROUTE);
    await showCat(page, id);
    await page.keyboard.press('Shift');
    await tricksButton(page, id).focus();
    await page.keyboard.press('Enter');
    await expect(
      tricksList(page, id).getByRole('status'),
      'the loading note is not in a status region',
    ).toHaveText('Loading tricks.');
    release();
    await expect(
      tricksList(page, id).getByRole('button', { name: 'Random' }),
      'focus stayed on the paw when the list arrived',
    ).toBeFocused();
    await expect(tricksList(page, id).getByRole('status')).toBeHidden();
  });

  test('a trick list that cannot load says so, and loads on the next open', async ({
    page,
  }) => {
    const id = 'pepper';
    const TRICKS_JSON = '**/about-cats-tricks*.json';
    const bodies = [
      { status: 404, body: 'Not found' },
      { status: 200, body: '{}' },
    ];
    for (const failure of bodies) {
      await page.route(TRICKS_JSON, (route) => route.fulfill(failure));
      await gotoSettled(page, ROUTE);
      await showCat(page, id);
      await tricksButton(page, id).click();
      await expect(
        tricksList(page, id),
        `a ${failure.status} body ${failure.body} left no note`,
      ).toContainText('The tricks did not load');
      await page.keyboard.press('Escape');
      await page.unroute(TRICKS_JSON);
      await tricksButton(page, id).click();
      await expect(
        tricksList(page, id).getByRole('button', { name: 'Random' }),
        'the next open did not load the tricks',
      ).toBeVisible();
    }
  });

  test('on a phone a trick that needs room still plays and one that cannot fit is not offered', async ({
    page,
  }) => {
    await page.setViewportSize(PHONE_VIEWPORT);
    await gotoSettled(page, ROUTE);
    const id = 'biscuit';
    await showCat(page, id);
    await tricksButton(page, id).click();
    const list = tricksList(page, id);
    await expect(
      list.getByRole('button', { name: TRICKS.yarn.label }),
      'a trick that cannot fit the band is offered',
    ).toHaveCount(0);
    await list.getByRole('button', { name: TRICKS.fly.label }).click();
    await expect(
      page.locator(`#cat-spot-${id} .cat-prop-wing`).first(),
      'the picked fly never appeared',
    ).toBeAttached({ timeout: NAP_TIMEOUT_MS });

    await page.setViewportSize(REFLOW_VIEWPORT);
    await showCat(page, id);
    await tricksButton(page, id).click();
    await expect(list).toBeVisible();
    await expect(
      list.getByRole('button', { name: TRICKS.look.label }),
    ).toBeAttached();
    await expect(
      list.getByRole('button', { name: TRICKS.fly.label }),
      'a trick that cannot fit the band is offered',
    ).toHaveCount(0);
  });

  test('a held cat relaxes its head once the pointer goes idle, even with every other cat on screen asleep', async ({
    browser,
  }) => {
    const context = await browser.newContext({ viewport: PEPPER_AND_MOCHI });
    const page = await context.newPage();
    await gotoSettled(page, ROUTE);
    await napControl(page, 'mochi').click();
    await expectMood(page, 'mochi', 'asleep', 'Mochi did not fall asleep');
    expect(
      await settles(page, 'mochi', SC_2_2_2_MS + SLEEP_MARGIN_MS),
      'Mochi was still moving after lying down',
    ).toBe(true);
    /* Biscuit is below the viewport, so only Pepper's own schedule can wake the loop. */
    await pointAt(page, 'pepper');
    await expect
      .poll(() => headTurn(page, 'pepper'), {
        message: 'a held cat never turned its head to the pointer',
        timeout: POINTER_IDLE_MS,
      })
      .toBeGreaterThan(HEAD_TURNED_DEG);
    try {
      await expect
        .poll(() => headTurn(page, 'pepper'), {
          message: 'a held cat kept its head turned to an idle pointer',
          timeout: POINTER_IDLE_MS + SC_2_2_2_MS,
        })
        .toBeLessThan(HEAD_LEVEL_DEG);
    } catch (error) {
      if (error instanceof Error) {
        error.message += `\nCat state: ${await catState(page, 'pepper')}`;
      }
      throw error;
    }
    await context.close();
  });

  test('a held cat, a sleeping cat and every cat under reduced motion are not redrawn (SC 2.2.2, 2.3.3)', async ({
    browser,
  }) => {
    /* Up to about 25 s of waits by design (pointer idle, two settles, three windows), before page loads. */
    test.slow();
    const context = await browser.newContext({ viewport: PEPPER_AND_MOCHI });
    const page = await context.newPage();
    await gotoSettled(page, ROUTE);
    await pointAt(page, 'pepper');
    /* A held cat relaxes its head once the pointer has been idle for POINTER_IDLE_MS; settling before that is not the end. */
    await page.waitForTimeout(POINTER_IDLE_MS);
    /* The relax starts on the colony's next frame, not on a timer: let two frames run so it has begun before quiet is measured. */
    /* If the loop is parked on its wake timer (other cats resting), that frame can come later; the quiet window covers it. */
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
    expect(
      await settles(page, 'pepper', SC_2_2_2_MS),
      'a held cat was still moving 5 s after the pointer went idle',
    ).toBe(true);
    expect(
      await drawnIn(page, 'pepper'),
      'a held cat that has settled was redrawn',
    ).toBe(0);
    await napControl(page, 'mochi').click();
    await expectMood(page, 'mochi', 'asleep', 'Mochi did not fall asleep');
    expect(
      await settles(page, 'mochi', SC_2_2_2_MS + SLEEP_MARGIN_MS),
      'a sleeping cat was still moving 5 s after lying down (SC 2.2.2)',
    ).toBe(true);
    expect(await drawnIn(page, 'mochi'), 'a sleeping cat was redrawn').toBe(0);
    await context.close();

    const still = await browser.newContext({
      reducedMotion: 'reduce',
      viewport: PEPPER_AND_MOCHI,
    });
    const quiet = await still.newPage();
    await gotoSettled(quiet, ROUTE);
    await quiet.waitForTimeout(STILL_WINDOW_MS);
    for (const id of CATS)
      expect(
        await drawnIn(quiet, id),
        `${NAMES[id]} was redrawn under reduced motion`,
      ).toBe(0);
    await still.close();
  });

  test('a resting cat is drawn at the idle rate, not every animation frame', async ({
    browser,
  }) => {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 4200 },
    });
    await context.addInitScript(() => {
      /* Near 1: the longest pause after a move, and no other random move or idle event inside the window. */
      Math.random = () => 0.99;
    });
    const page = await context.newPage();
    await gotoSettled(page, ROUTE);
    const id = 'biscuit';
    await showCat(page, id);
    await tricksButton(page, id).click();
    await tricksList(page, id)
      .getByRole('button', { name: tricksData.tricks.look.label })
      .click();
    /* Look Around, a turn to face its way first, then a pause: the window sits inside the pause. */
    const AFTER_LOOK_MS = duration(MOVES.look()) + 2200;
    await page.waitForTimeout(AFTER_LOOK_MS);
    const WINDOW_MS = 1200;
    const frames = await framesDrawnIn(page, id, WINDOW_MS);
    expect(
      frames,
      'a resting cat was never drawn, so it was not idling',
    ).toBeGreaterThanOrEqual(IDLE_MIN_FRAMES);
    expect(
      frames,
      'a resting cat was drawn nearly every animation frame',
    ).toBeLessThanOrEqual((IDLE_MAX_FPS * WINDOW_MS) / 1000);
    await context.close();
  });

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
    await expect(
      page.locator('.cat-tricks-button'),
      'a trick list shows while nothing moves',
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
  test('a cat whose card stays open past its nap time does not keep the loop running', async ({
    browser,
  }) => {
    const context = await browser.newContext({ viewport: PEPPER_AND_MOCHI });
    const page = await context.newPage();
    await page.clock.install();
    await gotoSettled(page, ROUTE);
    await napControl(page, 'mochi').click();
    await expectMood(page, 'mochi', 'asleep', 'Mochi did not fall asleep');
    expect(
      await settles(page, 'mochi', SC_2_2_2_MS + SLEEP_MARGIN_MS),
      'Mochi was still moving after lying down',
    ).toBe(true);
    await catButton(page, 'pepper').focus();
    await page.keyboard.press('Enter');
    await expect(
      page.getByRole('dialog', { name: NAMES.pepper }),
    ).toBeVisible();
    /* A cat with its card open never naps, so its nap time passes without being used. */
    await page.clock.fastForward(NAP_AFTER_MS + POINTER_IDLE_MS);
    /* The jump runs no frames, so she first finishes turning to sit. */
    expect(
      await settles(page, 'pepper', SC_2_2_2_MS + SLEEP_MARGIN_MS),
      'Pepper was still moving with her card open',
    ).toBe(true);
    const frames = await page.evaluate(
      (ms) =>
        new Promise<number>((resolve) => {
          let count = 0;
          const request = window.requestAnimationFrame.bind(window);
          window.requestAnimationFrame = (callback) =>
            request((now) => {
              count += 1;
              callback(now);
            });
          setTimeout(() => {
            window.requestAnimationFrame = request;
            resolve(count);
          }, ms);
        }),
      LOOP_WINDOW_MS,
    );
    expect(
      frames,
      'the loop kept running frames for a cat whose card is open',
    ).toBeLessThanOrEqual(MAX_EMPTY_FRAMES_IN_A_ROW);
    await context.close();
  });

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
    test(`each sleep control is on top at its center at ${viewport.width}px (SC 2.2.2)`, async ({
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

  test('the drawings are hidden from assistive technology', async ({
    page,
  }) => {
    await gotoSettled(page, ROUTE);
    for (const id of CATS) {
      const drawings = page.locator(`#cat-spot-${id} svg`);
      await expect(
        drawings.nth(2),
        'the cat, its sleep icon and the trick icons',
      ).toBeAttached();
      for (const svg of await drawings.all())
        await expect(svg).toHaveAttribute('aria-hidden', 'true');
    }
  });

  test('without JavaScript there are no cats', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto(ROUTE);
    await expect(page.locator('.cat-button')).toHaveCount(0);
    await context.close();
  });
});
