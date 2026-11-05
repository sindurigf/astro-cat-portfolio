/*
 * The cat after its dive: it drops to the shaft's floor, then hops down the
 * page from one section to the next as the reader scrolls, landing on the
 * heading's top edge on the left and the top brick's edge on the right. A hop
 * may pass in front of a section; it only ever rests in the gap above one.
 * home-motion.ts drives it on its clock.
 */
import type { CatPose } from '../lib/home-cat';

/* Kept between the cat and the end of the edge it stands on. */
const CLEAR_PX = 8;
/* A spot is the cat's goal once its edge is above this share of the window. */
const ARRIVE_SHARE = 0.7;
const HOP_MS_BASE = 300;
const HOP_MS_PER_PX = 0.5;
const HOP_MS_MAX = 1100;
const HOP_HEIGHT_SHARE = 0.25;
const HOP_HEIGHT_MIN_PX = 12;
const HOP_HEIGHT_MAX_PX = 70;
const CROUCH_SHARE = 0.18;
const LAND_SHARE = 0.85;
/* Down the shaft from the mouth to its floor. */
const FALL_PX_PER_S = 1100;
const FALL_MS_MIN = 200;
const REST_POSES: readonly CatPose[] = ['sit', 'landing'];

interface Point {
  readonly x: number;
  readonly y: number;
}

interface Leg {
  readonly kind: 'hop' | 'fall';
  readonly from: Point;
  readonly to: Point;
  readonly ms: number;
  readonly height: number;
}

/* A place it rests: feet at `y`, with `room` free above its head before the brick over it. */
interface Spot extends Point {
  readonly room: number;
}

export interface Faller {
  /* The dive has ended at the mouth: the cat starts down the shaft. */
  readonly start: (clock: number) => void;
  /*
   * Moves it on. `still` (paused) holds it at rest where the reader has
   * scrolled to; with `atEnd` (reduced motion) it rests on the last edge of its
   * way down, placed once, so scrolling never moves it.
   */
  readonly step: (clock: number, still: boolean, atEnd?: boolean) => void;
  /* Layout changed: measure the edges again. */
  readonly measure: () => void;
}

const ease = (p: number): number => p * p * (3 - 2 * p);

export const createFaller = ({
  faller,
  spin,
  sprite,
  mouth,
  bands,
}: {
  faller: HTMLElement;
  spin: HTMLElement;
  sprite: HTMLElement;
  mouth: HTMLElement;
  bands: readonly HTMLElement[];
}): Faller => {
  const art = sprite.firstElementChild ?? sprite;
  let spots: Spot[] = [];
  let artSize = { w: 0, h: 0 };
  let begun = false;
  /* The spot it last rested on; -1 while it is still coming down the shaft. */
  let at = -1;
  let legs: Leg[] = [];
  let legStart = 0;
  let dir = 1;

  const origin = (): Point => {
    const box = faller.getBoundingClientRect();
    return { x: box.left, y: box.top };
  };
  const local = (box: DOMRect, o: Point): DOMRect =>
    new DOMRect(box.left - o.x, box.top - o.y, box.width, box.height);

  /* Where its art sits with no translate, in the faller's px, per pose: measured once per layout. */
  const restBoxes = new Map<string, DOMRect>();
  const restBox = (): DOMRect => {
    const pose = sprite.dataset.pose ?? '';
    const known = restBoxes.get(pose);
    if (known) return known;
    const shown = spin.style.transform;
    spin.style.transform = '';
    const box = local(art.getBoundingClientRect(), origin());
    spin.style.transform = shown;
    restBoxes.set(pose, box);
    return box;
  };
  let shownAt = '';

  const measure = (): void => {
    restBoxes.clear();
    shownAt = '';
    const o = origin();
    /* It rests sitting and lands just before: head room measured for the taller of the two holds at rest. */
    const pose = sprite.dataset.pose;
    const boxes = REST_POSES.map((rest) => {
      sprite.dataset.pose = rest;
      return restBox();
    });
    if (pose) sprite.dataset.pose = pose;
    /* Its frame is wider than the sitting art; keeping the frame clear keeps every pose clear. */
    artSize = {
      w: Math.max(
        ...boxes.map((b) => b.width),
        spin.getBoundingClientRect().width,
      ),
      h: Math.max(...boxes.map((b) => b.height)),
    };
    const boxOf = (el: Element): DOMRect =>
      local(el.getBoundingClientRect(), o);
    const bricks = bands.map((section) =>
      [
        ...section.querySelectorAll<HTMLElement>(
          'h2, [data-close-row], .card, .card-block',
        ),
      ]
        .map((el) => ({ el, box: boxOf(el) }))
        .filter(({ box: b }) => b.width > 0),
    );
    const controls = [
      ...(faller.parentElement?.querySelectorAll('[data-home-pause]') ?? []),
    ]
      .map(boxOf)
      .filter((b) => b.width > 0);
    /* Everything it must keep its head clear of: bricks, their words and links, and the pause control. */
    const all = [
      ...bands.flatMap((section) =>
        [
          ...section.querySelectorAll(
            'h2, p, a, li, [data-close-row], .card, .card-block',
          ),
        ].map(boxOf),
      ),
      ...controls,
    ].filter((b) => b.width > 0);
    const over = (b: DOMRect, x: number): boolean =>
      b.left < x + artSize.w / 2 && b.right > x - artSize.w / 2;
    /* Feet on the topmost brick under it at `x`, and the room up to whatever is above its head there. */
    const standOn = (
      x: number,
      list: readonly { box: DOMRect }[],
    ): Spot | undefined => {
      const under = list.filter(({ box: b }) => over(b, x));
      if (under.length === 0) return undefined;
      return spotAt(x, Math.min(...under.map(({ box: b }) => b.top)));
    };
    function spotAt(x: number, y: number): Spot {
      const ceiling = Math.max(
        0,
        ...all
          .filter((b) => b.bottom <= y + 1 && over(b, x))
          .map((b) => b.bottom),
      );
      return { x, y, room: y - ceiling - artSize.h };
    }
    /* The first of `xs` with head room, else the roomiest. */
    const firstFree = (
      xs: readonly number[],
      list: readonly { box: DOMRect }[],
    ): Spot | undefined => {
      const found = xs
        .map((x) => standOn(x, list))
        .filter((s): s is Spot => s !== undefined);
      return (
        found.find((s) => s.room >= 0) ??
        found.sort((a, b) => b.room - a.room)[0]
      );
    };
    const firstBricks = bricks[0] ?? [];
    if (all.length === 0 || firstBricks.length === 0) {
      spots = [];
      return;
    }
    const m = local(mouth.getBoundingClientRect(), o);
    /* The shaft's floor: level with the first section's top, under the mouth. */
    spots = [
      spotAt(
        m.left + m.width / 2,
        Math.min(...firstBricks.map(({ box: b }) => b.top)),
      ),
    ];
    const half = artSize.w / 2 + CLEAR_PX;
    bricks.forEach((list, index) => {
      if (list.length === 0) return;
      const left = Math.min(...list.map(({ box: b }) => b.left));
      const edge = Math.max(...list.map(({ box: b }) => b.right));
      const xs: number[] = [];
      if (index % 2 === 0) {
        const heading =
          list.find(({ el }) => el.matches('h2, [data-close-row]')) ?? list[0]!;
        /* On the heading's right end, or just past it where the heading sits too high. */
        xs.push(heading.box.right - half, heading.box.right + half);
        for (let x = heading.box.right + 3 * half; x < edge; x += 2 * half)
          xs.push(x);
      } else {
        /* The section's top at its right end, moving left until its head is clear. */
        for (let x = edge - half; x > left + half; x -= 2 * half) xs.push(x);
      }
      const at = firstFree(xs, list);
      if (at) spots.push(at);
    });
  };

  /* The arc keeps under the brick above where it takes off. */
  const hop = (from: Spot | Point, to: Spot | Point): Leg => {
    const distance = Math.hypot(to.x - from.x, to.y - from.y);
    const room = 'room' in from ? from.room : HOP_HEIGHT_MAX_PX;
    return {
      kind: 'hop',
      from,
      to,
      ms: Math.min(HOP_MS_MAX, HOP_MS_BASE + distance * HOP_MS_PER_PX),
      height: Math.min(
        Math.max(0, room),
        Math.max(
          HOP_HEIGHT_MIN_PX,
          Math.min(HOP_HEIGHT_MAX_PX, distance * HOP_HEIGHT_SHARE),
        ),
      ),
    };
  };
  const drop = (from: Point, to: Point): Leg => ({
    kind: 'fall',
    from,
    to,
    ms: Math.max(FALL_MS_MIN, ((to.y - from.y) / FALL_PX_PER_S) * 1000),
    height: 0,
  });

  const goal = (): number => {
    /* A short last section never rises to the line, so the page's end reaches it. */
    const scrollEnd =
      document.documentElement.scrollHeight - window.innerHeight;
    if (window.scrollY >= scrollEnd - 1) return spots.length - 1;
    const line = window.innerHeight * ARRIVE_SHARE - origin().y;
    let index = 0;
    spots.forEach((s, i) => {
      if (s.y <= line) index = i;
    });
    return index;
  };

  const place = (feet: Point, pose: CatPose): void => {
    const key = `${feet.x.toFixed(1)} ${feet.y.toFixed(1)} ${pose} ${dir}`;
    if (key === shownAt) return;
    shownAt = key;
    if (sprite.dataset.pose !== pose) sprite.dataset.pose = pose;
    /* The atlas faces left: -1 mirrors it to face the way it goes. */
    sprite.style.setProperty('--face', String(-dir));
    const box = restBox();
    const x = feet.x - (box.left + box.width / 2);
    const y = feet.y - box.bottom;
    spin.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
  };

  const along = (leg: Leg, p: number): [Point, CatPose] => {
    if (leg.kind === 'fall') {
      const q = p * p;
      return [
        { x: leg.from.x, y: leg.from.y + (leg.to.y - leg.from.y) * q },
        'leap',
      ];
    }
    if (p < CROUCH_SHARE) return [leg.from, 'crouch'];
    if (p > LAND_SHARE) return [leg.to, 'landing'];
    const q = (p - CROUCH_SHARE) / (LAND_SHARE - CROUCH_SHARE);
    const e = ease(q);
    return [
      {
        x: leg.from.x + (leg.to.x - leg.from.x) * e,
        y:
          leg.from.y +
          (leg.to.y - leg.from.y) * e -
          leg.height * 4 * q * (1 - q),
      },
      'leap',
    ];
  };

  const start = (clock: number): void => {
    measure();
    begun = true;
    at = -1;
    const floor = spots[0];
    if (!floor) return;
    const mouthTop = { x: floor.x, y: Math.min(floor.y, artSize.h) };
    legs = [drop(mouthTop, floor)];
    legStart = clock;
  };

  const step = (clock: number, still: boolean, atEnd = false): void => {
    if (!begun || spots.length === 0) return;
    const target = goal();
    if (still) {
      legs = [];
      at = atEnd ? spots.length - 1 : Math.max(at, target, 0);
      place(spots[at]!, 'sit');
      return;
    }
    let leg = legs[0];
    while (leg && clock - legStart >= leg.ms) {
      legStart += leg.ms;
      legs.shift();
      if (legs.length === 0) at += 1;
      leg = legs[0];
    }
    if (!leg && at < target && at + 1 < spots.length) {
      legs = [hop(spots[at]!, spots[at + 1]!)];
      legStart = clock;
      leg = legs[0];
    }
    if (!leg) {
      place(spots[Math.max(at, 0)]!, 'sit');
      return;
    }
    if (leg.to.x !== leg.from.x) dir = leg.to.x > leg.from.x ? 1 : -1;
    const [feet, pose] = along(leg, (clock - legStart) / leg.ms);
    place(feet, pose);
  };

  return {
    start,
    step,
    measure: () => {
      if (!begun) return;
      measure();
      legs = [];
      at = Math.min(Math.max(at, 0), spots.length - 1);
    },
  };
};
