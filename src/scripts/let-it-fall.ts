/* Let It Fall: everything on screen drops and stacks into a heap, and the footer mascot climbs onto the button; the same button, Esc, keyboard focus elsewhere or a new window width puts it back. */
import {
  createHopper,
  ignoreCancel,
  type Foot,
  type Hopper,
} from './let-it-fall-mascot';

const LABEL_FALL = 'Let It Fall';
const LABEL_BACK = 'Put It Back';
const FELL = 'The page fell down. Press Put It Back to rebuild it.';
const BACK = 'The page is back in place.';
const NOTHING = 'Nothing on screen to drop. Scroll up and try again.';
/* Outermost of these move; their contents ride along. */
const BLOCKS = [
  '.header-slab',
  '.hero-window',
  'main :is(h1, h2, h3, p, ul, ol, figure, img, blockquote, table, pre, .card, .btn-primary, .btn-secondary, .badge, form > *)',
  /* The footer too: at the button on a phone, it is most of the screen. */
  'footer :is(.footer-stickers > li, nav li, .footer-copyright, .footer-ai)',
].join(', ');
const TARGETS = 'a[href], button, input, select, textarea, summary';
/* px: the room kept around a control that did not fall, the space between stacked blocks, and the heap's margin. */
const SOLID_GAP = 12;
const STACK_GAP = 4;
/* px between blocks when the heap packs tight to fit under Put It Back. */
const TIGHT_GAP = 1;
/* px kept clear under the risen Put It Back: its focus ring's reach, 12px, twice over. Matches tests/let-it-fall.spec.ts. */
const FLOAT_GAP = 24;
/* Rises without overshoot, so it never passes the top of the screen. */
const RISE_EASING = 'cubic-bezier(0.2, 0.8, 0.2, 1)';
const EDGE = 16;
/* A block narrower than this share of the screen is small: it tilts more and drops into the lowest gap. */
const SMALL_SHARE = 0.4;
/* A block taller than this share of the screen stays, and the blocks inside it fall. */
const TALLEST_SHARE = 0.6;
const WIDE_DRIFT = 14;
const WIDE_TURN_DEG = 2;
const SMALL_TURN_DEG = 8;
/* px: where a small block or the mascot may land is tried at this step, with this much random lean. */
const SLOT_STEP = 6;
const SLOT_JITTER = 10;
/* px: the bounce on landing and the mascot's hop height; ms between landings; the hop's share of --fall-time. */
const BOUNCE = 14;
const HOP_HEIGHT = 70;
const LAND_STAGGER_MS = 55;
const HOP_SHARE = 0.7;
const FALL_EASING = 'cubic-bezier(0.55, 0, 1, 0.45)';
const LAND_AT = 0.72;
const BOUNCE_AT = 0.86;
/* A second press this soon after the first is the same press, as when both wait on the first load. */
const REPEAT_MS = 300;

const button = document.querySelector<HTMLButtonElement>('[data-let-it-fall]');
const header = document.querySelector<HTMLElement>('.site-header');
const mascot = document.querySelector<HTMLImageElement>('.footer-mascot');
let hopper: Hopper | null = null;
const status = document.querySelector<HTMLElement>('[data-let-it-fall-status]');
if (!button || !status) {
  throw new Error('let-it-fall: the footer lacks its button or status.');
}

const motion = matchMedia('(prefers-reduced-motion: no-preference)');
const token = (name: string): string =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const MS_PER_S = 1000;
/* Minified CSS may write the time in seconds, as `.9s`. */
const fallTime = (): number => {
  const time = token('--fall-time');
  return parseFloat(time) * (time.endsWith('ms') ? 1 : MS_PER_S);
};

/* reduced-motion.css gives every property a 0.01ms transition, which reads as the old value until it ends: end it before measuring. */
const settleNow = (el: Element): void => {
  for (const animation of el.getAnimations()) {
    if (animation instanceof CSSTransition) animation.finish();
  }
};

const say = (text: string): void => {
  status.textContent = '';
  requestAnimationFrame(() => {
    status.textContent = text;
  });
};

const spread = (range: number): number => (Math.random() - 0.5) * 2 * range;

/* A computed color's fourth number is its alpha; three numbers mean opaque. */
const RGBA_PARTS = 4;
const clear = (color: string): boolean => {
  const parts = color.match(/[\d.]+/g) ?? [];
  return parts.length === RGBA_PARTS && Number(parts[RGBA_PARTS - 1]) === 0;
};
/* The fill a block's text was drawn on, so it keeps its contrast wherever it lands (SC 1.4.3). */
const ground = (el: Element): string => {
  for (let at: Element | null = el; at; at = at.parentElement) {
    const fill = getComputedStyle(at).backgroundColor;
    if (!clear(fill)) return fill;
  }
  return getComputedStyle(document.body).backgroundColor;
};

let fallen: HTMLElement[] = [];
let lastPress = -Infinity;
let width = innerWidth;

const onScreen = (el: Element): boolean => {
  const { top, bottom, height } = el.getBoundingClientRect();
  return height > 0 && bottom > 0 && top < innerHeight;
};

/* A block already moved by its own transform, or inside a raised or clipping layer, would land above the button or vanish. */
const free = (el: Element): boolean => {
  if (getComputedStyle(el).transform !== 'none') return false;
  /* A moved block would become the containing block of a sticker placed against its card; a 1px screen reader label does not count. */
  const anchoredOutside = [...el.querySelectorAll<HTMLElement>('*')].some(
    (inner) =>
      /absolute|fixed/.test(getComputedStyle(inner).position) &&
      !el.contains(inner.offsetParent) &&
      inner.checkVisibility() &&
      inner.getBoundingClientRect().width > 1,
  );
  if (anchoredOutside) return false;
  for (
    let up = el.parentElement;
    up && up !== document.body;
    up = up.parentElement
  ) {
    const style = getComputedStyle(up);
    if (style.zIndex !== 'auto' || style.overflow !== 'visible') return false;
  }
  return true;
};

/* A sticky header's heap would stay on screen as the page scrolls: held in flow where it is now, it scrolls with the rest, and drops below the button's layer. */
const PINNED = ['position', 'z-index', 'top'];
const pin = (): void => {
  if (!header) return;
  /* A short screen's static header keeps its z-index, a raised layer its bar would not leave. */
  if (getComputedStyle(header).position !== 'sticky') {
    header.style.setProperty('z-index', 'auto');
    settleNow(header);
    return;
  }
  const stuck = header.getBoundingClientRect().top;
  header.style.setProperty('position', 'relative');
  header.style.setProperty('z-index', 'auto');
  header.style.setProperty(
    'top',
    `${stuck - header.getBoundingClientRect().top}px`,
  );
  settleNow(header);
};
const unpin = (): void => {
  for (const name of PINNED) header?.style.removeProperty(name);
};

type Spot = { left: number; right: number; top: number; bottom: number };
type Landing = {
  el: HTMLElement;
  x: number;
  y: number;
  turn: number;
  top: number;
  rank: number;
};

/* The heap's bounds and packing: its floor and ceiling, the space between blocks, and whether blocks tilt. */
type Room = { floor: number; ceiling: number; gap: number; tilt: boolean };

/*
 * The lowest bottom edge, at or above the floor, where a box of this span and
 * height fits clear of every spot, resting on the floor or a spot's top. Above
 * the ceiling only when no such place is below it.
 */
const lowestFit = (
  heap: Spot[],
  left: number,
  right: number,
  tall: number,
  room: Room,
): number => {
  const { floor, ceiling, gap } = room;
  const column = heap.filter(
    (spot) => left < spot.right + gap && spot.left - gap < right,
  );
  const grounds = [floor, ...column.map((spot) => spot.top - gap)]
    .filter((g) => g <= floor)
    .sort((a, b) => b - a);
  const free = (g: number) =>
    !column.some((spot) => g - tall < spot.bottom + gap && spot.top - gap < g);
  const fits = grounds.filter(free);
  return fits.find((g) => g - tall >= ceiling) ?? fits.at(-1) ?? floor;
};

/* A block's box joined with every visible part it draws past it, as a label set over its card's edge; 1px screen reader labels aside. */
const reach = (el: Element): DOMRect =>
  [...el.querySelectorAll('*')]
    .filter((inner) => inner.checkVisibility())
    .map((inner) => inner.getBoundingClientRect())
    .filter((r) => r.width > 1 && r.height > 1)
    .reduce((all, r) => {
      const left = Math.min(all.left, r.left);
      const top = Math.min(all.top, r.top);
      return new DOMRect(
        left,
        top,
        Math.max(all.right, r.right) - left,
        Math.max(all.bottom, r.bottom) - top,
      );
    }, el.getBoundingClientRect());

/*
 * Wide blocks land first in a shuffled order, then small ones, widest first,
 * into the lowest gap. Each takes its tilted box's room, so no two overlap and
 * every target stays whole (SC 2.5.8).
 */
const stack = (blocks: HTMLElement[], room: Room, solid: Spot[]): Landing[] => {
  const screen = document.documentElement.clientWidth;
  const sized = blocks.map((el) => {
    const box = el.getBoundingClientRect();
    return {
      el,
      box,
      reach: reach(el),
      small: box.width < screen * SMALL_SHARE,
      key: Math.random(),
    };
  });
  const order = [
    ...sized.filter((b) => !b.small).sort((a, b) => a.key - b.key),
    ...sized.filter((b) => b.small).sort((a, b) => b.box.width - a.box.width),
  ];
  const heap = [...solid];
  const landings = order.map(({ el, box, reach: drawn, small }, rank) => {
    const turn = room.tilt ? spread(small ? SMALL_TURN_DEG : WIDE_TURN_DEG) : 0;
    /* What the block draws, turned about its own center as the transform turns it. */
    const centerX = box.left + box.width / 2;
    const centerY = box.top + box.height / 2;
    const turned = new DOMMatrix().rotate(turn);
    const corners = [
      [drawn.left, drawn.top],
      [drawn.right, drawn.top],
      [drawn.left, drawn.bottom],
      [drawn.right, drawn.bottom],
    ].map(([x, y]) =>
      turned.transformPoint(new DOMPoint(x - centerX, y - centerY)),
    );
    const minX = Math.min(...corners.map((c) => c.x));
    const minY = Math.min(...corners.map((c) => c.y));
    const wide = Math.max(...corners.map((c) => c.x)) - minX;
    const tall = Math.max(...corners.map((c) => c.y)) - minY;
    const lo = EDGE;
    const hi = Math.max(lo, screen - EDGE - wide);
    const home = centerX + minX;
    let left = Math.min(hi, Math.max(lo, home + spread(WIDE_DRIFT)));
    if (small) {
      let best = -Infinity;
      for (let x = lo; x <= hi; x += SLOT_STEP) {
        const ground =
          lowestFit(heap, x, x + wide, tall, room) +
          Math.random() * SLOT_JITTER;
        if (ground > best) {
          best = ground;
          left = x;
        }
      }
    }
    const bottom = lowestFit(heap, left, left + wide, tall, room);
    heap.push({ left, right: left + wide, top: bottom - tall, bottom });
    return {
      el,
      x: left - minX - centerX,
      y: bottom - tall - minY - centerY,
      turn,
      top: bottom - tall,
      rank,
    };
  });
  return landings;
};

/*
 * Where the mascot may stand is read from the landed page, not the plan: the top
 * edge of a painted, fallen surface (a fill or edge unlike its ground, or an image), or of Put It Back.
 */
const FEET_SHARE = 0.5;
/* px: how far apart the surfaces under its feet may be. */
const LEVEL_SLACK = 6;
/* px a focus ring reaches past its control: --focus-width + --focus-gap + --lift-control, as the press rule draws it. */
const ringReach = (): number =>
  ['--focus-width', '--focus-gap', '--lift-control']
    .map((name) => parseFloat(token(name)))
    .reduce((sum, px) => sum + px, 0);
/* px between its sticker's edge and the surface, so it rests on it without overlapping. */
const TOUCH = 1;
/* Points per side checked inside the mascot's box, which must be empty. */
const ROOM_PROBES = 4;

/* Seen against what lies behind it: an image, or a fill or edge unlike the ground its parent stands on. */
const painted = (el: Element): boolean => {
  const style = getComputedStyle(el);
  if (style.visibility !== 'visible' || Number(style.opacity) === 0) {
    return false;
  }
  if (el instanceof HTMLImageElement || el instanceof SVGSVGElement) {
    return true;
  }
  const behind = el.parentElement ? ground(el.parentElement) : '';
  const fill =
    !clear(style.backgroundColor) && style.backgroundColor !== behind;
  const edge =
    parseFloat(style.borderTopWidth) > 0 &&
    !clear(style.borderTopColor) &&
    style.borderTopColor !== behind;
  return fill || edge;
};

type Edge = { el: Element; a: DOMPoint; b: DOMPoint };

/* The top edges of every painted part of the heap, turned as their block is turned, and Put It Back's. */
const topEdges = (): Edge[] => {
  const parts = fallen.flatMap((block) =>
    [block, ...block.querySelectorAll('*')].map((el) => ({ el, block })),
  );
  const edges = parts
    .filter(({ el }) => el instanceof HTMLElement && painted(el))
    .map(({ el, block }) => {
      const box = el.getBoundingClientRect();
      const turn = new DOMMatrix(getComputedStyle(block).transform);
      const angle = Math.atan2(turn.b, turn.a);
      const half = {
        w: (el as HTMLElement).offsetWidth / 2,
        h: (el as HTMLElement).offsetHeight / 2,
      };
      const cx = box.left + box.width / 2;
      const cy = box.top + box.height / 2;
      const corner = (dx: number, dy: number) =>
        new DOMPoint(
          cx + dx * Math.cos(angle) - dy * Math.sin(angle),
          cy + dx * Math.sin(angle) + dy * Math.cos(angle),
        );
      return { el, a: corner(-half.w, -half.h), b: corner(half.w, -half.h) };
    })
    .filter(({ a, b }) => Math.abs(b.x - a.x) > 1);
  const own = button.getBoundingClientRect();
  return [
    ...edges,
    {
      el: button,
      a: new DOMPoint(own.left, own.top),
      b: new DOMPoint(own.right, own.top),
    },
  ];
};

/* y of the highest visible top edge straight down at x: one nothing covers there. */
const surfaceAt = (edges: Edge[], x: number): number | null => {
  const under = edges
    .filter(({ a, b }) => x >= Math.min(a.x, b.x) && x <= Math.max(a.x, b.x))
    .map(({ el, a, b }) => ({
      el,
      y: a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x),
    }))
    .filter(({ y }) => y >= 0 && y < innerHeight)
    .sort((p, q) => p.y - q.y);
  const seen = under.find(({ el, y }) => {
    const hit = document.elementFromPoint(x, y + LEVEL_SLACK / 2);
    return hit !== null && el.contains(hit);
  });
  return seen ? seen.y : null;
};

/* Nothing painted, no text and no control, nor another control's ring, inside the mascot's box; `overPage`: the page that stays may lie under it, as under the risen Put It Back. */
const roomFor = (
  controls: DOMRect[],
  left: number,
  top: number,
  wide: number,
  tall: number,
  overPage = false,
): boolean => {
  if (
    top < 0 ||
    left < 0 ||
    left + wide > document.documentElement.clientWidth
  ) {
    return false;
  }
  const reach = ringReach();
  const clash = controls.some(
    (c) =>
      left < c.right + reach &&
      c.left - reach < left + wide &&
      top < c.bottom + reach &&
      c.top - reach < top + tall,
  );
  if (clash) return false;
  for (let i = 0; i < ROOM_PROBES; i++) {
    for (let j = 0; j < ROOM_PROBES; j++) {
      const hit = document.elementFromPoint(
        left + (wide * (i + 0.5)) / ROOM_PROBES,
        top + (tall * (j + 0.5)) / ROOM_PROBES,
      );
      if (!hit) continue;
      const text = [...hit.childNodes].some(
        (node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim(),
      );
      const page = !overPage && (painted(hit) || text);
      if (page || hit.closest('[data-fell]') || hit.closest(TARGETS)) {
        return false;
      }
    }
  }
  return true;
};

/* Every shown control but Put It Back, measured once for the whole search. */
const controlBoxes = (): DOMRect[] =>
  [...document.querySelectorAll(TARGETS)]
    .filter((el) => el !== button && el.checkVisibility())
    .map((el) => el.getBoundingClientRect());

type Hop = {
  x: number;
  y: number;
  scale: number;
  foot: Foot;
  wide: number;
  tall: number;
};
/* The mascot shrinks to these to fit, as on a wide screen where the heap reaches the top. */
const HOP_SCALES = [1, 0.75, 0.5];

/* Where the mascot could stand with its middle at x: on the surfaces under its feet, level enough, with room above. */
const standAt = (
  edges: Edge[],
  controls: DOMRect[],
  x: number,
  wide: number,
  tall: number,
): number | null => {
  const reach = (wide * FEET_SHARE) / 2;
  const levels = [x - reach, x, x + reach].map((at) => surfaceAt(edges, at));
  if (levels.some((y) => y === null)) return null;
  const ys = levels as number[];
  if (Math.max(...ys) - Math.min(...ys) > LEVEL_SLACK) return null;
  const y = Math.min(...ys) - TOUCH;
  return roomFor(controls, x - wide / 2, y - tall, wide, tall) ? y : null;
};

/* On Put It Back, its seat: on the edge, or above the focus ring while keyboard focus shows it (SC 2.4.11). */
const seat = (): number =>
  button.getBoundingClientRect().top -
  (button.matches(':focus-visible') ? ringReach() : 0) -
  TOUCH;

/* On top of Put It Back, clear of its label; else the highest place on the heap. At the largest size that fits. */
const perch = (edges: Edge[], controls: DOMRect[]): Hop | null => {
  if (!mascot) return null;
  const box = mascot.getBoundingClientRect();
  if (!box.width) return null;
  const ratio = box.width / box.height;
  const screen = document.documentElement.clientWidth;
  const own = button.getBoundingClientRect();
  const hop = (
    x: number,
    y: number,
    scale: number,
    wide: number,
    tall: number,
  ): Hop => ({
    x: x - wide / 2 - box.left,
    y: y - tall - box.top,
    scale,
    foot: { x, y },
    wide,
    tall,
  });
  for (const scale of HOP_SCALES) {
    const wide = box.height * ratio * scale;
    const tall = box.height * scale;
    const middle = own.left + own.width / 2;
    const y = seat();
    if (roomFor(controls, middle - wide / 2, y - tall, wide, tall, true)) {
      return hop(middle, y, scale, wide, tall);
    }
  }
  for (const scale of HOP_SCALES) {
    const wide = box.height * ratio * scale;
    const tall = box.height * scale;
    let best: { x: number; y: number } | null = null;
    for (
      let x = EDGE + wide / 2;
      x + wide / 2 <= screen - EDGE;
      x += SLOT_STEP
    ) {
      const y = standAt(edges, controls, x, wide, tall);
      if (y !== null && (!best || y < best.y)) best = { x, y };
    }
    if (best) return hop(best.x, best.y, scale, wide, tall);
  }
  return null;
};

/* px between the mascot's hops, at least; longer when more hops than this would be needed. */
const STRIDE = 70;
const MAX_HOPS = 5;

/* Visible places to land on the way from the footer to the perch, then the perch. */
const stones = (edges: Edge[], controls: DOMRect[], spot: Hop): Foot[] => {
  if (!mascot) return [];
  const box = mascot.getBoundingClientRect();
  const from = box.left + box.width / 2;
  const toward = Math.sign(spot.foot.x - from);
  const stride = Math.max(STRIDE, Math.abs(spot.foot.x - from) / MAX_HOPS);
  const steps: Foot[] = [];
  for (
    let x = from + toward * stride;
    toward !== 0 && (spot.foot.x - x) * toward > stride / 2;
    x += toward * stride
  ) {
    const y = standAt(edges, controls, x, spot.wide, spot.tall);
    if (y !== null) steps.push({ x, y });
  }
  return [...steps, spot.foot];
};

const HOP_VARS = ['--hop-x', '--hop-y', '--hop-scale'];

/* The mascot leaps on an arc to the spot, or home for null; under reduced motion it is simply there. */
const hopTo = (spot: Hop | null): void => {
  if (!mascot) return;
  const from = getComputedStyle(mascot).transform;
  for (const animation of mascot.getAnimations()) animation.cancel();
  if (spot) {
    mascot.style.setProperty('--hop-x', `${spot.x}px`);
    mascot.style.setProperty('--hop-y', `${spot.y}px`);
    mascot.style.setProperty('--hop-scale', String(spot.scale));
    mascot.setAttribute('data-hopped', '');
  } else {
    mascot.removeAttribute('data-hopped');
    for (const name of HOP_VARS) mascot.style.removeProperty(name);
  }
  if (!motion.matches) return;
  const start = from === 'none' ? new DOMMatrix() : new DOMMatrix(from);
  const end = spot
    ? new DOMMatrix().translate(spot.x, spot.y).scale(spot.scale)
    : new DOMMatrix();
  const high = Math.min(start.f, end.f) - HOP_HEIGHT;
  mascot.animate(
    [
      { transform: start.toString() },
      {
        transform: `translate(${(start.e + end.e) / 2}px, ${high}px) scale(${(start.a + end.a) / 2})`,
        offset: 0.5,
      },
      { transform: end.toString() },
    ],
    { duration: fallTime() * HOP_SHARE, easing: 'ease-in-out' },
  );
};

const FALL_VARS = ['--fall-x', '--fall-y', '--fall-turn', '--fall-ground'];

/* Home at once: drops the clip and offsets, so a block is measured where it rests. */
const home = (el: HTMLElement): void => {
  for (const animation of el.getAnimations()) animation.cancel();
  el.removeAttribute('data-fall-block');
  el.removeAttribute('data-fall-raised');
  for (const name of FALL_VARS) el.style.removeProperty(name);
  if (header?.contains(el)) unpin();
};

const drop = ({ el, x, y, turn, rank }: Landing): Animation | null => {
  el.style.setProperty('--fall-x', `${x}px`);
  el.style.setProperty('--fall-y', `${y}px`);
  el.style.setProperty('--fall-turn', `${turn}deg`);
  el.style.setProperty('--fall-ground', ground(el));
  el.setAttribute('data-fall-block', '');
  el.setAttribute('data-fell', '');
  /* Above content that stays, as a tall card or the footer band: it comes later and would paint over the heap. */
  const style = getComputedStyle(el);
  if (style.zIndex === 'auto') {
    el.setAttribute(
      'data-fall-raised',
      style.position === 'static' ? 'static' : '',
    );
  }
  if (!motion.matches) return null;
  const at = (lift: number) =>
    `translate(${x}px, ${y - lift}px) rotate(${turn}deg)`;
  return el.animate(
    [
      { transform: 'none', easing: FALL_EASING },
      { transform: at(0), offset: LAND_AT, easing: 'ease-out' },
      { transform: at(BOUNCE), offset: BOUNCE_AT, easing: 'ease-in' },
      { transform: at(0) },
    ],
    {
      duration: fallTime(),
      delay: rank * LAND_STAGGER_MS,
      fill: 'backwards',
    },
  );
};

const FLOAT_VARS = ['--float-x', '--float-y'];

/*
 * Put It Back rises to the top of the screen, centered, with room above it for
 * the mascot and below any header still stuck there; returns where it ends up.
 */
const floatButton = (): DOMRect => {
  const from = getComputedStyle(button).transform;
  for (const animation of button.getAnimations()) animation.cancel();
  button.removeAttribute('data-floating');
  /* Its place in the layout: the box less its own hover or press `translate`. */
  const box = button.getBoundingClientRect();
  const { translate } = getComputedStyle(button);
  const lift =
    translate === 'none'
      ? new DOMMatrix()
      : new DOMMatrix(`translate(${translate.split(' ').join(', ')})`);
  const own = new DOMRect(
    box.left - lift.e,
    box.top - lift.f,
    box.width,
    box.height,
  );
  const stuck =
    header &&
    !fallen.some((el) => header.contains(el)) &&
    getComputedStyle(header).position === 'sticky'
      ? header.getBoundingClientRect().bottom
      : 0;
  const seat = (mascot?.getBoundingClientRect().height ?? 0) + ringReach();
  const top = Math.max(0, stuck) + EDGE + seat;
  const left = (document.documentElement.clientWidth - own.width) / 2;
  button.style.setProperty('--float-x', `${left - own.left}px`);
  button.style.setProperty('--float-y', `${top - own.top}px`);
  button.setAttribute('data-floating', '');
  settleNow(button);
  /* Where it rests once risen, the safe-area inset included: its own `transform`, measured from the layout box. */
  const shift = new DOMMatrix(getComputedStyle(button).transform);
  const risen = new DOMRect(
    own.left + shift.e,
    own.top + shift.f,
    own.width,
    own.height,
  );
  if (motion.matches) {
    button.animate([{ transform: from }, { transform: shift.toString() }], {
      duration: fallTime(),
      easing: RISE_EASING,
    });
  }
  return risen;
};

/* Put It Back goes home with the page. */
const sinkButton = (): void => {
  const from = getComputedStyle(button).transform;
  for (const animation of button.getAnimations()) animation.cancel();
  button.removeAttribute('data-floating');
  const clean = () => {
    for (const name of FLOAT_VARS) button.style.removeProperty(name);
  };
  if (!motion.matches) {
    clean();
    return;
  }
  void button
    .animate([{ transform: from }, { transform: 'none' }], {
      duration: fallTime(),
      easing: token('--ease-fall'),
    })
    .finished.then(() => {
      if (!button.hasAttribute('data-floating')) clean();
    }, ignoreCancel);
};

const fall = (): void => {
  /* A press mid-climb: the climbing blocks snap home first, or their clip and transforms would hide them from the next fall. */
  for (const el of document.querySelectorAll<HTMLElement>(
    '[data-fall-block]',
  )) {
    home(el);
  }
  /* A mascot still hopping home is measured from home, not mid-air. */
  for (const animation of mascot?.getAnimations() ?? []) animation.cancel();
  hopper?.stop();
  pin();
  const tallest = innerHeight * TALLEST_SHARE;
  const candidates = [...document.querySelectorAll<HTMLElement>(BLOCKS)].filter(
    (el) =>
      onScreen(el) && free(el) && el.getBoundingClientRect().height <= tallest,
  );
  fallen = candidates.filter(
    (el) => !candidates.some((other) => other !== el && other.contains(el)),
  );
  if (!fallen.some((el) => header?.contains(el))) unpin();
  if (!fallen.length) {
    say(NOTHING);
    return;
  }
  /* Marked before measuring: a falling footer row shrinks to its link. */
  for (const el of fallen) {
    el.setAttribute('data-fall-block', '');
    settleNow(el);
  }
  /* Put It Back rises first, centered at its new label's width: the heap fills the screen below it. */
  button.textContent = LABEL_BACK;
  const lifted = floatButton();
  const toSpot = ({ left, right, top, bottom }: DOMRect): Spot => ({
    left: left - SOLID_GAP,
    right: right + SOLID_GAP,
    top: top - SOLID_GAP,
    bottom: bottom + SOLID_GAP,
  });
  /* Every control that stays is solid: the heap lands on it, never over it. */
  const solid = [...document.querySelectorAll(TARGETS)]
    .filter(
      (el) =>
        el !== button &&
        onScreen(el) &&
        el.checkVisibility() &&
        !fallen.some((block) => block.contains(el)),
    )
    .map((el) => toSpot(el.getBoundingClientRect()));
  /*
   * Under Put It Back's gap: packed loosely and tilted, then tightly and level,
   * and if it still does not fit, moved down past the screen's bottom, where scrolling reaches it.
   */
  const ceiling = lifted.bottom + FLOAT_GAP;
  let room: Room = {
    floor: innerHeight - EDGE,
    ceiling,
    gap: STACK_GAP,
    tilt: true,
  };
  const highestOf = (all: Landing[]) => Math.min(...all.map(({ top }) => top));
  let landings = stack(fallen, room, solid);
  if (highestOf(landings) < ceiling) {
    room = { ...room, gap: TIGHT_GAP, tilt: false };
    landings = stack(fallen, room, solid);
  }
  /* Still too tall: the whole heap moves down by the overflow, below the screen's bottom edge. */
  const sink = Math.max(0, ceiling - highestOf(landings));
  landings = landings.map((landing) => ({
    ...landing,
    y: landing.y + sink,
    top: landing.top + sink,
  }));
  const moves = landings
    .map(drop)
    .filter((a): a is Animation => a !== null)
    .map((a) => a.finished);
  if (motion.matches && mascot) hopper ??= createHopper(mascot);
  const pile = fallen;
  void Promise.all(moves)
    .then(async () => {
      if (!mascot || fallen !== pile) return;
      /* A block's own transitions, as a card's lift, start a frame later and must end before the heap is read. */
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const settling = pile.flatMap((el) =>
        el.getAnimations({ subtree: true }),
      );
      /* One cut short, as by a hover, has settled just the same. */
      await Promise.allSettled(settling.map((a) => a.finished));
      if (fallen !== pile) return;
      /* Read from the landed heap, so every landing is on something seen. */
      const edges = topEdges();
      const controls = controlBoxes();
      const spot = perch(edges, controls);
      if (!spot) return;
      if (hopper && motion.matches) {
        try {
          await hopper.climb(
            stones(edges, controls, spot).map(hopper.local),
            spot.scale,
          );
          return;
        } catch (error) {
          if (error instanceof DOMException && error.name === 'AbortError') {
            return;
          }
          /* The drawing failed to load: the mascot stays home, and the next press tries again. */
          reportError(error);
          hopper.stop();
          hopper = null;
          return;
        }
      }
      /* Lazy below the fold; it must be drawn before it is shown on the perch. */
      mascot.loading = 'eager';
      await mascot.decode();
      if (fallen === pile) hopTo(spot);
    })
    .catch(ignoreCancel);
  width = innerWidth;
  button.textContent = LABEL_BACK;
  say(FELL);
};

const restore = (): void => {
  /* The page may have scrolled since the fall: home for the header is where it sticks now, and its blocks climb from where they lie. */
  const before = header?.getBoundingClientRect().top ?? 0;
  if (header?.style.position) {
    unpin();
    pin();
  }
  const shift = (header?.getBoundingClientRect().top ?? 0) - before;
  if (mascot?.hasAttribute('data-hopped')) hopTo(null);
  void hopper?.goHome().catch(ignoreCancel);
  sinkButton();
  for (const el of fallen) {
    const lies = getComputedStyle(el).transform;
    const from =
      shift && header?.contains(el)
        ? new DOMMatrix()
            .translate(0, -shift)
            .multiply(new DOMMatrix(lies === 'none' ? undefined : lies))
            .toString()
        : lies;
    el.removeAttribute('data-fell');
    if (!motion.matches) {
      home(el);
      continue;
    }
    for (const animation of el.getAnimations()) animation.cancel();
    const climb = el.animate([{ transform: from }, { transform: 'none' }], {
      duration: fallTime(),
      easing: token('--ease-fall'),
    });
    void climb.finished.then(() => {
      if (!el.hasAttribute('data-fell')) home(el);
    }, ignoreCancel);
  }
  fallen = [];
  button.textContent = LABEL_FALL;
  say(BACK);
};

button.addEventListener('on-demand', () => {
  const now = performance.now();
  if (now - lastPress < REPEAT_MS) return;
  lastPress = now;
  if (fallen.length) restore();
  else fall();
});
/* Reduced motion switched on mid-climb: the mascot is home at once. */
motion.addEventListener('change', () => {
  if (!motion.matches) hopper?.stop();
});
addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && fallen.length) restore();
});
/* SC 2.4.11: keyboard focus never lands on a block out of place. A click or tap on a link or button in the heap focuses without :focus-visible, so it still works; a text field puts the page back. */
addEventListener('focusin', (event) => {
  const target = event.target;
  if (
    fallen.length &&
    target !== button &&
    target instanceof Element &&
    target.matches(':focus-visible')
  ) {
    restore();
  }
});
/* Offsets are measured for one width; a rotated phone or a zoom would leave the heap in the wrong place. */
addEventListener('resize', () => {
  if (fallen.length && innerWidth !== width) restore();
});
