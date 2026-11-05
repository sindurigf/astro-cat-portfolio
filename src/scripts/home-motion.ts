/*
 * The homepage's motion: the cat hopping on the meadow and the toys
 * rising past the fall. One loop drives both and both pause controls stop it
 * (SC 2.2.2). Reduced motion draws one still frame and hides the controls.
 */
import { NEXT_FRAME, createMotionLoop } from './motion-loop';
import type { CatPose } from '../lib/home-cat';
import type { Meadow } from './home-meadow';
import { createFaller } from './home-faller';
import { createHole } from './home-hole';
import { MAX_DELTA_MS } from '../lib/home-motion-step';

/* Slow, small motion: 30 frames a second is plenty and halves the main-thread cost. */
const MAX_FRAME_RATE = 30;
/* The stems sway slowly: every second frame (15 a second) is smooth enough and halves the costliest drawing. */
const MEADOW_FRAME_EVERY = 2;
const VIEW_MARGIN = '120px';

/* Cat: px from the band's edges and the mouth it never hops into. */
const EDGE_PX = 44;
const MOUTH_CLEAR_PX = 64;
const HOME_SHARE = 0.45;
const HOP_MIN_PX = 60;
const HOP_MAX_PX = 150;
const HOP_HEIGHT_MIN_PX = 26;
const HOP_HEIGHT_MAX_PX = 64;
const HOP_HEIGHT_PER_PX = 0.25;
const HOP_MS_MIN = 380;
const HOP_MS_MAX = 620;
const HOP_MS_BASE = 360;
const HOP_MS_PER_PX = 1.4;
const TURN_CHANCE = 0.2;
const CROUCH_MS = 150;
const LAND_MS = 130;
const REST_MS_MIN = 900;
const REST_MS_MAX = 2400;
const LOOK_REST_MS = 1500;
const LOOK_FROM = 0.3;
const LOOK_TO = 0.75;
const FIRST_REST_MS = 700;

/* Things: a 900px view takes about 26 seconds to cross. */
const RISE_PX_PER_S = 34;
const TURN_DEG = 4;
const TURN_MS_BASE = 7000;
const TURN_MS_STEP = 1300;
const FIRST_Y_PX = 140;

/* The yarn ball: tossed up out of view, or flipped where nothing may move. */
const TOSS_MS = 1200;
const TOSS_TURN_DEG = 540;
const TOSS_CLEAR_PX = 48;
const TOSS_EASING = 'cubic-bezier(.3, .1, .7, .6)';
const FLIP_MS = 1500;
const LOOK_UP_MS = 1400;

/* The dive: the cat leaps to the mouth, then drops in. */
const DIVE_LEAP_MS = 520;
const DIVE_DROP_MS = 260;
const DIVE_DROP_PX = 90;

const PAUSE_NAME = 'Pause animations';
const PLAY_NAME = 'Play animations';
const PAUSE_GLYPH = '❚❚';
const PLAY_GLYPH = '▶';

const random = (low: number, high: number): number =>
  low + Math.random() * (high - low);
const clamp = (value: number, low: number, high: number): number =>
  Math.min(high, Math.max(low, value));
const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => window.setTimeout(resolve, ms));

type Phase = 'rest' | 'crouch' | 'air' | 'land';

interface Hop {
  x: number;
  y: number;
  dir: 1 | -1;
  phase: Phase;
  since: number;
  length: number;
  from: number;
  to: number;
  height: number;
  looks: boolean;
}

interface Thing {
  readonly el: HTMLElement;
  readonly face: HTMLElement;
  readonly tilt: number;
  readonly turnMs: number;
  offset: number;
}

const required = <T extends Element>(root: ParentNode, selector: string): T => {
  const found = root.querySelector<T>(selector);
  if (!found) throw new Error(`home-motion: ${selector} is missing.`);
  return found;
};

const start = (): void => {
  const band = document.querySelector<HTMLElement>('[data-home-band]');
  if (!band) return;
  const hopper = required<HTMLElement>(band, '[data-home-hopper]');
  const sprite = required<HTMLElement>(hopper, '.home-cat');
  const mouth = required<HTMLElement>(document, '[data-home-mouth]');
  const drift = required<HTMLElement>(document, '[data-home-drift]');
  const yarn = required<HTMLButtonElement>(drift, '[data-home-yarn]');
  const yarnSpin = required<HTMLElement>(yarn, '.home-prop-spin');
  const pauses = [
    ...document.querySelectorAll<HTMLButtonElement>('[data-home-pause]'),
  ];
  const follow = required<HTMLButtonElement>(band, '[data-home-follow]');
  const faller = required<HTMLElement>(document, '[data-home-faller]');
  const fallerSpin = required<HTMLElement>(faller, '.home-faller-spin');
  const fallerSprite = required<HTMLElement>(faller, '.home-cat');
  const fall = drift.parentElement;
  const bands = fall
    ? [...fall.querySelectorAll<HTMLElement>(':scope > .band')]
    : [];
  createHole({ band, mouth });
  const fallen = createFaller({
    faller,
    spin: fallerSpin,
    sprite: fallerSprite,
    mouth,
    bands,
  });

  const things: Thing[] = [
    ...drift.querySelectorAll<HTMLElement>('[data-home-prop]'),
  ].map((el, index) => ({
    el,
    face: required<HTMLElement>(el, '.home-prop-face'),
    tilt: Number(el.dataset.tilt) || 0,
    turnMs: TURN_MS_BASE + index * TURN_MS_STEP,
    offset: 0,
  }));

  let paused = false;
  let meadow: Meadow | undefined;
  let clock = 0;
  let last = 0;
  let lookUntil = -1;
  let tossing = false;
  let roamMax = 0;
  let driftHeight = 0;
  let thingSize = 0;
  let meadowOnScreen = true;
  let meadowFrame = 0;
  const hop: Hop = {
    x: 0,
    y: 0,
    dir: 1,
    phase: 'rest',
    since: 0,
    length: FIRST_REST_MS,
    from: 0,
    to: 0,
    height: 0,
    looks: false,
  };

  const measure = (): void => {
    const box = band.getBoundingClientRect();
    roamMax = Math.max(
      EDGE_PX * 2,
      mouth.getBoundingClientRect().left - box.left - MOUTH_CLEAR_PX,
    );
    driftHeight = drift.clientHeight;
    thingSize = things[0]?.el.offsetHeight ?? 0;
  };

  const setPose = (pose: CatPose): void => {
    if (sprite.dataset.pose !== pose) sprite.dataset.pose = pose;
  };
  /* The atlas faces left: -1 mirrors it to face right. */
  const setFacing = (): void => {
    sprite.style.setProperty('--face', String(-hop.dir));
  };
  const place = (): void => {
    hopper.style.transform = `translate(${hop.x.toFixed(1)}px, ${hop.y.toFixed(1)}px)`;
  };

  const nextHop = (): void => {
    if (Math.random() < TURN_CHANCE) hop.dir = hop.dir === 1 ? -1 : 1;
    let to = hop.x + hop.dir * random(HOP_MIN_PX, HOP_MAX_PX);
    if (to < EDGE_PX || to > roamMax) {
      hop.dir = hop.dir === 1 ? -1 : 1;
      to = hop.x + hop.dir * random(HOP_MIN_PX, HOP_MAX_PX);
    }
    hop.from = hop.x;
    hop.to = clamp(to, EDGE_PX, roamMax);
    const distance = Math.abs(hop.to - hop.from);
    hop.height = Math.min(
      HOP_HEIGHT_MAX_PX,
      HOP_HEIGHT_MIN_PX + distance * HOP_HEIGHT_PER_PX,
    );
    hop.length = clamp(
      HOP_MS_BASE + distance * HOP_MS_PER_PX,
      HOP_MS_MIN,
      HOP_MS_MAX,
    );
    setFacing();
  };

  /* The cat's centre in band px: the hopper sits at the band's left edge and moves by translate. Once gone, no stem bends for it. */
  const catAt = (): number => (gone ? Number.NEGATIVE_INFINITY : hop.x);
  let dive = -1;
  let gone = false;
  let diveFrom = 0;
  const mouthX = (): number => {
    const box = band.getBoundingClientRect();
    const m = mouth.getBoundingClientRect();
    return m.left - box.left + m.width / 2;
  };
  /* Focus moves on to the next control, the fall's pause or else the yarn ball, so it is never lost (SC 2.4.3). */
  const fallIn = (): void => {
    if (gone) return;
    gone = true;
    if (follow === document.activeElement) {
      const next =
        pauses.find(
          (button) =>
            !button.hidden &&
            follow.compareDocumentPosition(button) &
              Node.DOCUMENT_POSITION_FOLLOWING,
        ) ?? yarn;
      next.focus();
    }
    hopper.dataset.gone = '';
    follow.disabled = true;
    fall?.toggleAttribute('data-cat-fell', true);
    fallen.start(clock);
    fallen.step(clock, paused || loop.reducedMotion(), loop.reducedMotion());
  };
  const stepDive = (): void => {
    const t = clock - dive;
    const to = mouthX();
    if (t < DIVE_LEAP_MS) {
      const p = t / DIVE_LEAP_MS;
      setPose('leap');
      hop.dir = to > diveFrom ? 1 : -1;
      setFacing();
      hop.x = diveFrom + (to - diveFrom) * p;
      hop.y = -HOP_HEIGHT_MAX_PX * 4 * p * (1 - p);
    } else if (t < DIVE_LEAP_MS + DIVE_DROP_MS) {
      hop.x = to;
      hop.y = ((t - DIVE_LEAP_MS) / DIVE_DROP_MS) * DIVE_DROP_PX;
    } else {
      fallIn();
    }
    place();
  };

  const stepCat = (): void => {
    fallen.step(clock, false);
    if (dive >= 0) {
      if (!gone) stepDive();
      return;
    }
    /* A focused cat sits still, so the meadow's edge never cuts its focus ring (SC 2.4.13). */
    if (follow.matches(':focus-visible')) {
      if (hop.phase !== 'rest') {
        if (hop.phase === 'air') hop.x = hop.to;
        hop.y = 0;
        hop.phase = 'rest';
        hop.since = clock;
        hop.length = FIRST_REST_MS;
      }
      setPose('sit');
      place();
      return;
    }
    const t = clock - hop.since;
    if (hop.phase === 'rest') {
      const looking =
        clock < lookUntil ||
        (hop.looks && t > hop.length * LOOK_FROM && t < hop.length * LOOK_TO);
      setPose(looking ? 'look' : 'sit');
      hop.y = 0;
      if (t >= hop.length && clock >= lookUntil) {
        hop.phase = 'crouch';
        hop.since = clock;
        nextHop();
      }
    } else if (hop.phase === 'crouch') {
      setPose('crouch');
      if (t >= CROUCH_MS) {
        hop.phase = 'air';
        hop.since = clock;
      }
    } else if (hop.phase === 'air') {
      const p = Math.min(1, t / hop.length);
      setPose('leap');
      hop.x = hop.from + (hop.to - hop.from) * p;
      hop.y = -hop.height * 4 * p * (1 - p);
      if (p >= 1) {
        hop.phase = 'land';
        hop.since = clock;
        hop.y = 0;
      }
    } else {
      setPose('landing');
      if (t >= LAND_MS) {
        hop.phase = 'rest';
        hop.since = clock;
        hop.length = random(REST_MS_MIN, REST_MS_MAX);
        hop.looks = hop.length > LOOK_REST_MS;
      }
    }
    place();
  };

  const cycle = (): number => driftHeight + thingSize;

  /* `offset` is how far a thing has risen from just below the fall's floor. */
  const spread = (): void => {
    things.forEach((thing, index) => {
      thing.offset =
        driftHeight - FIRST_Y_PX + (index * cycle()) / things.length;
    });
  };

  const thingY = (thing: Thing): number => {
    const loop = cycle();
    const risen = thing.offset + (clock / 1000) * RISE_PX_PER_S;
    return driftHeight - (((risen % loop) + loop) % loop);
  };

  const yarnThing = things.find((thing) => thing.el === yarn);

  /* Puts the yarn ball at `y` within the fall at the current clock. */
  const placeYarn = (y: number): void => {
    if (!yarnThing) return;
    yarnThing.offset = driftHeight - y - (clock / 1000) * RISE_PX_PER_S;
  };

  /* How far the focus ring reaches past the yarn ball's box: none when focus is not visible. */
  const ringReach = (): number => {
    const style = getComputedStyle(yarn);
    if (style.outlineStyle === 'none') return 0;
    return parseFloat(style.outlineOffset) + parseFloat(style.outlineWidth);
  };

  /* A focused yarn ball holds still with its ring wholly inside the fall, which clips, so focus never leaves sight (SC 2.4.11). */
  const holdFocusedYarn = (): void => {
    if (!yarnThing || !yarn.matches(':focus-within')) return;
    const reach = ringReach();
    placeYarn(clamp(thingY(yarnThing), reach, driftHeight - thingSize - reach));
  };

  const drawThings = (): void => {
    things.forEach((thing) => {
      thing.el.style.transform = `translate3d(0, ${thingY(thing).toFixed(1)}px, 0)`;
      const turn = TURN_DEG * Math.sin((clock / thing.turnMs) * Math.PI * 2);
      thing.face.style.rotate = `${(thing.tilt + turn).toFixed(2)}deg`;
    });
  };

  const loop = createMotionLoop({
    maxFrameRate: MAX_FRAME_RATE,
    canRun: () => !paused,
    resume: (now) => {
      last = now;
    },
    frame: (now) => {
      const held = yarnThing ? thingY(yarnThing) : 0;
      clock += Math.min(MAX_DELTA_MS, now - last);
      last = now;
      if (yarnThing && yarn.matches(':focus-within')) placeYarn(held);
      stepCat();
      meadowFrame += 1;
      if (meadowOnScreen && meadowFrame % MEADOW_FRAME_EVERY === 0)
        meadow?.draw(clock / 1000, false, catAt());
      drawThings();
      return NEXT_FRAME;
    },
    onReducedMotion: () => {
      show();
    },
  });

  const stopYarn = (): void => {
    yarnSpin.getAnimations().forEach((animation) => animation.cancel());
  };

  /* Timers keep counting on `clock`, so they are reset, not the clock: motion resumes from rest. */
  const still = (): void => {
    stopYarn();
    if (dive >= 0) fallIn();
    fallen.step(clock, true, true);
    hop.x = roamMax * HOME_SHARE;
    hop.y = 0;
    hop.dir = 1;
    hop.phase = 'rest';
    hop.since = clock;
    hop.length = FIRST_REST_MS;
    hop.looks = false;
    lookUntil = -1;
    setFacing();
    setPose('sit');
    place();
    meadow?.draw(clock / 1000, true, catAt());
    drawThings();
  };

  const state = (): 'running' | 'paused' =>
    !loop.reducedMotion() && !paused ? 'running' : 'paused';

  const show = (): void => {
    const reduced = loop.reducedMotion();
    band.dataset.homeMotion = state();
    if (fall) fall.dataset.homeMotion = state();
    pauses.forEach((button) => {
      if (reduced && button === document.activeElement) {
        document.querySelector('main')?.focus();
      }
      button.hidden = reduced;
      button.dataset.state = paused ? 'paused' : 'playing';
      const name = button.querySelector('[data-home-pause-name]');
      const glyph = button.querySelector('[data-home-pause-glyph]');
      if (name) name.textContent = paused ? PLAY_NAME : PAUSE_NAME;
      if (glyph) glyph.textContent = paused ? PLAY_GLYPH : PAUSE_GLYPH;
    });
    if (reduced) still();
  };

  const toggle = (): void => {
    paused = !paused;
    if (paused) {
      loop.stop();
      stopYarn();
      /* A hop may cross a section's text, so pausing sets the cat down at a rest spot. */
      fallen.step(clock, true);
    } else {
      loop.start();
    }
    show();
  };

  /* Puts the tossed yarn ball back just below the screen, so it rises into view. */
  const returnYarn = (): void => {
    const top = drift.getBoundingClientRect().top;
    placeYarn(Math.min(driftHeight, window.innerHeight - top));
  };

  /* Nothing moves while paused or under reduced motion: the yarn ball flips over in place. */
  const pressYarn = async (): Promise<void> => {
    if (tossing) return;
    tossing = true;
    try {
      if (paused || loop.reducedMotion()) {
        yarn.dataset.flipped = '';
        await wait(FLIP_MS);
        delete yarn.dataset.flipped;
        return;
      }
      lookUntil = clock + LOOK_UP_MS;
      const rise = yarn.getBoundingClientRect().bottom + TOSS_CLEAR_PX;
      const toss = yarnSpin.animate(
        [
          { transform: 'translateY(0) rotate(0deg)' },
          {
            transform: `translateY(${-rise}px) rotate(${TOSS_TURN_DEG}deg)`,
          },
        ],
        { duration: TOSS_MS, easing: TOSS_EASING, fill: 'forwards' },
      );
      try {
        await toss.finished;
        if (!yarn.matches(':focus-within')) returnYarn();
      } catch (error) {
        /* Cancelled by the pause control: the yarn ball stays where it was. */
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          throw error;
        }
      }
      stopYarn();
      drawThings();
    } finally {
      tossing = false;
    }
  };

  /* Paused or under reduced motion there is no dive: the cat rests at once where its way down has reached. */
  follow.addEventListener('click', () => {
    if (dive >= 0) return;
    dive = clock;
    diveFrom = hop.x;
    if (paused || loop.reducedMotion()) fallIn();
  });

  follow.hidden = false;
  yarn.hidden = false;

  pauses.forEach((button) => {
    button.addEventListener('click', toggle);
  });
  yarn.addEventListener('click', () => {
    void pressYarn();
  });
  yarn.addEventListener('focus', () => {
    holdFocusedYarn();
    drawThings();
  });

  new ResizeObserver(() => {
    measure();
    fallen.measure();
    fallen.step(clock, paused || loop.reducedMotion(), loop.reducedMotion());
    hop.x = clamp(hop.x, EDGE_PX, roamMax);
    place();
    drawThings();
  }).observe(drift);

  hopper.style.left = '0px';
  things.forEach((thing) => {
    thing.el.style.top = '0px';
  });
  loop.connect();
  measure();
  spread();
  hop.x = roamMax * HOME_SHARE;
  setFacing();
  place();
  drawThings();
  show();
  /* The stems are the costliest drawing: skip them while the meadow is out of view and only the fall moves. */
  loop.observe([band, drift], {
    rootMargin: VIEW_MARGIN,
    assumeOnScreen: true,
    onEntries: (entries) => {
      entries.forEach((entry) => {
        if (entry.target === band) meadowOnScreen = entry.isIntersecting;
      });
    },
  });
  loop.start();

  const haze = band.querySelector<HTMLCanvasElement>(
    '[data-home-stems="haze"]',
  );
  const back = band.querySelector<HTMLCanvasElement>(
    '[data-home-stems="back"]',
  );
  if (haze && back) {
    /* If the stems cannot load, the planted SVGs stay: the meadow is never empty. */
    void import('./home-meadow')
      .then(({ createMeadow }) => {
        meadow = createMeadow({ band, haze, back, mouth });
        band.dataset.stemsLive = '';
        meadow.draw(clock / 1000, state() === 'paused', catAt());
      })
      .catch((error: unknown) => {
        delete band.dataset.stemsLive;
        console.error(error);
      });
  }
};

start();
