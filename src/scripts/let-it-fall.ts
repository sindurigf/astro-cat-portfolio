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
/* The main menu bar: a shelf in the heap about two thirds down, and the mascot's ledge on its climb. */
const LEDGE = '.header-slab';
const LEDGE_SHARE = 2 / 3;
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
const PINNED = [
  'position',
  'z-index',
  'top',
  'pointer-events',
  'background-color',
];
/* Its bar has fallen: the empty box left behind neither hides nor blocks the page that stays under it. */
const empty = (): void => {
  header?.style.setProperty('pointer-events', 'none');
  header?.style.setProperty('background-color', 'transparent');
};
const pin = (): void => {
  if (!header) return;
  /* A short screen's static header keeps its z-index, a raised layer its bar would not leave. */
  if (getComputedStyle(header).position !== 'sticky') {
    header.style.setProperty('z-index', 'auto');
    empty();
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
  empty();
  settleNow(header);
};
const unpin = (): void => {
  for (const name of PINNED) header?.style.removeProperty(name);
};

/* `bare`: nothing rests on it, as the mascot's clear stretch on the menu shelf. */
type Spot = {
  left: number;
  right: number;
  top: number;
  bottom: number;
  bare?: boolean;
};
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
  const grounds = [
    floor,
    ...column.filter((spot) => !spot.bare).map((spot) => spot.top - gap),
  ]
    .filter((g) => g <= floor)
    .sort((a, b) => b - a);
  const free = (g: number) =>
    !column.some((spot) => g - tall < spot.bottom + gap && spot.top - gap < g);
  const fits = grounds.filter(free);
  /* Nowhere free: on top of everything in its column. */
  const over = Math.min(floor, ...column.map((spot) => spot.top - gap));
  return fits.find((g) => g - tall >= ceiling) ?? fits.at(-1) ?? over;
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

/* Each block takes its tilted box's room, so no two overlap and every target stays whole (SC 2.5.8). */
const stack = (
  blocks: HTMLElement[],
  room: Room,
  solid: Spot[],
): { landings: Landing[]; heap: Spot[] } => {
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
  /*
   * Wide blocks first, shuffled; then small ones, widest first, into the lowest
   * gaps, bare labels before painted ones, so painted blocks the mascot can climb top the heap.
   */
  const shows = (el: Element) =>
    [el, ...el.querySelectorAll('*')].some((part) => painted(part));
  const small = sized
    .filter((b) => b.small)
    .sort((a, b) => b.box.width - a.box.width);
  const order = [
    ...sized.filter((b) => !b.small).sort((a, b) => a.key - b.key),
    ...small.filter((b) => !shows(b.el)),
    ...small.filter((b) => shows(b.el)),
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
  return { landings, heap };
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
const surfaceAt = (
  edges: Edge[],
  x: number,
): { y: number; el: Element } | null => {
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
  return seen ? { y: seen.y, el: seen.el } : null;
};

/* Nothing fallen and no control inside the mascot's box, nor painting or text unless `overPage`: the page that stays may lie behind it, as it does over the heap and the risen Put It Back. */
const roomFor = (
  controls: Guard[],
  left: number,
  top: number,
  wide: number,
  tall: number,
  overPage = false,
  under: Element[] = [],
): boolean => {
  if (
    top < 0 ||
    left < 0 ||
    left + wide > document.documentElement.clientWidth
  ) {
    return false;
  }
  /* A control it stands on is under its feet, not in its box. */
  const clash = controls
    .filter(({ el }) => !under.some((part) => el.contains(part)))
    .map(({ box }) => box)
    .some(
      (c) =>
        left < c.right &&
        c.left < left + wide &&
        top < c.bottom &&
        c.top < top + tall,
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

const grow = (box: DOMRect, by: number): DOMRect =>
  new DOMRect(
    box.left - by,
    box.top - by,
    box.width + 2 * by,
    box.height + 2 * by,
  );

type Guard = { el: Element; box: DOMRect };

/*
 * Every shown control but Put It Back, measured once for the whole search. Their
 * rings never show while fallen: keyboard focus on one puts the page back.
 */
const controlBoxes = (): Guard[] =>
  [...document.querySelectorAll(TARGETS)]
    .filter((el) => el !== button && el.checkVisibility())
    .map((el) => ({ el, box: grow(el.getBoundingClientRect(), TOUCH) }));

/* Put It Back with its focus ring's reach: kept clear wherever the mascot stands but on it. */
const buttonGuard = (): Guard => ({
  el: button,
  box: grow(button.getBoundingClientRect(), ringReach()),
});

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
/* px: the mascot's height while it climbs, at most its phone size (the floor of --size-footer-mascot; the two must agree). */
const CLIMB_HEIGHT = 96;
const climbHeight = (): number =>
  Math.min(CLIMB_HEIGHT, mascot?.getBoundingClientRect().height ?? 0);

/* Where the mascot could stand with its middle at x: on the surfaces under its feet, level enough, with room above. */
const standAt = (
  edges: Edge[],
  controls: Guard[],
  x: number,
  wide: number,
  tall: number,
): number | null => {
  const reach = (wide * FEET_SHARE) / 2;
  const levels = [x - reach, x, x + reach].map((at) => surfaceAt(edges, at));
  if (levels.some((level) => level === null)) return null;
  const found = levels as { y: number; el: Element }[];
  const ys = found.map(({ y }) => y);
  if (Math.max(...ys) - Math.min(...ys) > LEVEL_SLACK) return null;
  const y = Math.min(...ys) - TOUCH;
  const under = found.map(({ el }) => el);
  return roomFor(controls, x - wide / 2, y - tall, wide, tall, true, under)
    ? y
    : null;
};

/* On Put It Back, its seat: on the edge, or above the focus ring while keyboard focus shows it (SC 2.4.11). */
const seat = (): number =>
  button.getBoundingClientRect().top -
  (button.matches(':focus-visible') ? ringReach() : 0) -
  TOUCH;

/* On top of Put It Back, clear of its label; else the highest place on the heap. At the largest size that fits. */
const perch = (edges: Edge[], controls: Guard[]): Hop | null => {
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
    const tall = climbHeight() * scale;
    const wide = tall * ratio;
    const middle = own.left + own.width / 2;
    const y = seat();
    if (roomFor(controls, middle - wide / 2, y - tall, wide, tall, true)) {
      return hop(middle, y, tall / box.height, wide, tall);
    }
  }
  for (const scale of HOP_SCALES) {
    const tall = climbHeight() * scale;
    const wide = tall * ratio;
    let best: { x: number; y: number } | null = null;
    for (
      let x = EDGE + wide / 2;
      x + wide / 2 <= screen - EDGE;
      x += SLOT_STEP
    ) {
      const y = standAt(edges, [...controls, buttonGuard()], x, wide, tall);
      if (y !== null && (!best || y < best.y)) best = { x, y };
    }
    if (best) return hop(best.x, best.y, tall / box.height, wide, tall);
  }
  return null;
};

/*
 * Visible places to land on the way from the footer: up the heap, onto the ledge
 * beside Put It Back when there is one, then the perch.
 */
const stones = (
  edges: Edge[],
  controls: Guard[],
  spot: Hop,
  ledge: Element | undefined,
): Foot[] => {
  if (!mascot) return [];
  const guard = [...controls, buttonGuard()];
  const box = mascot.getBoundingClientRect();
  const onLedge = edges.filter(({ el }) => ledge?.contains(el));
  const heap = edges.filter(({ el }) => !ledge?.contains(el) && el !== button);
  /* On the menu shelf, as near its clear stretch in the middle as it has room. */
  const screen = document.documentElement.clientWidth;
  const middle = screen / 2;
  const across = (pick: Edge[]): Foot[] => {
    const found: Foot[] = [];
    for (
      let x = EDGE + spot.wide / 2;
      x + spot.wide / 2 <= screen - EDGE;
      x += SLOT_STEP
    ) {
      const y = standAt(pick, guard, x, spot.wide, spot.tall);
      if (y !== null) found.push({ x, y });
    }
    return found;
  };
  const nearest = (all: Foot[], x: number) =>
    all.reduce<Foot | null>(
      (best, place) =>
        !best || Math.abs(place.x - x) < Math.abs(best.x - x) ? place : best,
      null,
    );
  const highestOf = (all: Foot[]) =>
    all.reduce<Foot | null>(
      (best, place) => (!best || place.y < best.y ? place : best),
      null,
    );
  const ledgeStone = nearest(across(onLedge), middle);
  const shelfTop = ledge?.getBoundingClientRect().top ?? box.bottom;
  const places = across(heap);
  /* Below the shelf: the highest place with headroom, if any. */
  const lower = highestOf(places.filter(({ y }) => y > shelfTop));
  /* Above it: the highest place, and one about halfway up from the shelf. */
  const upperPlaces = places.filter(({ y }) => y <= shelfTop);
  const highest = highestOf(upperPlaces);
  const halfway = highest
    ? upperPlaces
        .filter(({ y }) => y > highest.y + spot.tall / 2)
        .reduce<Foot | null>(
          (best, place) =>
            !best ||
            Math.abs(place.y - (shelfTop + highest.y) / 2) <
              Math.abs(best.y - (shelfTop + highest.y) / 2)
              ? place
              : best,
          null,
        )
    : null;
  return [lower, ledgeStone, halfway, highest, spot.foot].filter(
    (place): place is Foot => place !== null,
  );
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
  const seat = climbHeight() + ringReach();
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

/*
 * The header bar as a shelf about two thirds down: the wide blocks land under
 * it, it sits on them as low as that allows, and the small blocks fill the gaps
 * and land on it, around a clear stretch kept for the mascot.
 */
const shelve = (
  shelf: HTMLElement,
  blocks: HTMLElement[],
  room: Room,
  solid: Spot[],
): Landing[] => {
  const screen = document.documentElement.clientWidth;
  const wide = blocks.filter(
    (el) => el.getBoundingClientRect().width >= screen * SMALL_SHARE,
  );
  const small = blocks.filter((el) => !wide.includes(el));
  const under = stack(wide, room, solid);
  const drawn = reach(shelf);
  const wideTop = wide.length
    ? Math.min(...under.heap.slice(solid.length).map(({ top }) => top))
    : room.floor;
  /* Rings of controls in the heap never show while it is down, so a hop's headroom is the mascot and a gap. */
  const headroom = climbHeight() + room.gap;
  const highestShelf = room.ceiling + headroom;
  let top = Math.max(
    highestShelf,
    Math.min(innerHeight * LEDGE_SHARE, wideTop - room.gap - drawn.height),
  );
  /* Never over a control that stays: up above it, or no shelf at all. */
  const blocking = () =>
    solid.find(
      (spot) =>
        drawn.left < spot.right &&
        spot.left < drawn.right &&
        top < spot.bottom &&
        spot.top < top + drawn.height,
    );
  for (let over = blocking(); over; over = blocking()) {
    top = over.top - drawn.height;
    if (top < highestShelf)
      return stack([shelf, ...blocks], room, solid).landings;
  }
  /* Too little room above them for the shelf: the wide blocks move down under it. */
  const drop = Math.max(0, top + drawn.height + room.gap - wideTop);
  const lowered = (spot: Spot): Spot => ({
    ...spot,
    top: spot.top + drop,
    bottom: spot.bottom + drop,
  });
  const below = under.heap.slice(solid.length).map(lowered);
  const middle = screen / 2;
  const stretch = climbHeight() + 2 * SLOT_STEP;
  const spots: Spot[] = [
    ...solid,
    ...below,
    { left: drawn.left, right: drawn.right, top, bottom: top + drawn.height },
    {
      left: middle - stretch / 2,
      right: middle + stretch / 2,
      top: top - headroom,
      bottom: top,
      bare: true,
    },
  ];
  /* A hop's headroom kept under Put It Back too, so the mascot can stand on top of the heap. */
  const above = stack(
    small,
    { ...room, ceiling: room.ceiling + headroom },
    spots,
  ).landings;
  return [
    { el: shelf, x: 0, y: top - drawn.top, turn: 0, top, rank: 0 },
    ...under.landings.map((landing) => ({
      ...landing,
      y: landing.y + drop,
      top: landing.top + drop,
      rank: landing.rank + 1,
    })),
    ...above.map((landing) => ({
      ...landing,
      rank: landing.rank + under.landings.length + 1,
    })),
  ];
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
  /* Every control that stays, and the mascot waiting at home, are solid: the heap lands on them, never over them. */
  const solid = [
    ...[...document.querySelectorAll(TARGETS)]
      .filter(
        (el) =>
          el !== button &&
          onScreen(el) &&
          el.checkVisibility() &&
          !fallen.some((block) => block.contains(el)),
      )
      .map((el) => toSpot(el.getBoundingClientRect())),
    ...(mascot && onScreen(mascot)
      ? [toSpot(mascot.getBoundingClientRect())]
      : []),
  ];
  /*
   * Packed loosely and tilted, then tightly and level; if it still does not fit
   * under Put It Back, the whole heap moves down past the screen's bottom, where scrolling reaches it.
   */
  const ceiling = lifted.bottom + FLOAT_GAP;
  const loose: Room = {
    floor: innerHeight - EDGE,
    ceiling,
    gap: STACK_GAP,
    tilt: true,
  };
  const tight: Room = { ...loose, gap: TIGHT_GAP, tilt: false };
  const highestOf = (all: Landing[]) => Math.min(...all.map(({ top }) => top));
  const ledge = fallen.find((el) => el.matches(LEDGE));
  const heaped = fallen.filter((el) => el !== ledge);
  const plan = (room: Room): Landing[] =>
    ledge
      ? shelve(ledge, heaped, room, solid)
      : stack(heaped, room, solid).landings;
  let landings = plan(loose);
  if (highestOf(landings) < ceiling) landings = plan(tight);
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
            stones(edges, controls, spot, ledge).map(hopper.local),
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
