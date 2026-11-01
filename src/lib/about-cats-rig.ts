/*
 * Draws one About cat from its frames, die-cut stickers packed in one sheet per
 * cat (scripts/make-about-cats.mjs), and the toys it plays with. Poses and
 * moves are in about-cats-moves.ts; src/scripts/about-cats.ts owns the frame loop. Units
 * are CSS px, y down, the ground at y = 0 under the cat's origin.
 */
import { PAD, SHEET } from './about-cats-sheet';
import {
  DOWN_HOLD_MS,
  GROUND_DRAWINGS,
  HOLD_MS,
  POSE_FRAME,
  bridges,
  isSeated,
  routeStep,
  WALK,
  walkFrame,
  frameFor,
  type Frame,
  type Motion,
  type NamedPose,
} from './about-cats-frames';
import { pose } from './about-cats-moves';
import type { CatId, Pose, PropKind, PropState } from './about-cats-types';

const NS = 'http://www.w3.org/2000/svg';
const D = Math.PI / 180;

/** One step of the flip-book: 12 a second. A new frame waits until the last has shown this long, so every in-between is seen. */
const TICK_MS = 1000 / 12;
/** A frame wanted for less than this is a passing blip of the pose blend, not a pose: one 60Hz frame is 16.7ms. */
const BLIP_MS = 25;
/** Walk frames a fast gait may step at once: 2 of 8 keeps the 4 phases (contact and passing, each side). */
const MAX_WALK_STEP = 2;
/** ms a cat must stand still before it stops walking. */
const STILL_MS = 120;
/** The white rim and ink edge round each frame, in px: part of the drawing. */
const OUTLINE = 3;
/** The feather's string hangs from just under the band's top: --spacing-cat-band (140px) must stay above it. */
const STRING_TOP = -136;
/** The scratching post's height in px, cap aside; with it, it stays under the band. */
export const POST_HEIGHT = 92;
/** Where each turn of rope starts on the post's left edge, top to bottom, in px. */
const ROPE_TURNS = [-86, -78, -70, -62, -54, -46, -38, -30, -22, -14];
/** A small and a larger "z", drawn from the lower left of the small one. */
const ZZ = 'M0 0h4l-4 5h4M6 -9h6l-6 7h6';
const ZZ_HEIGHT = 14;
const ZZ_WIDTH = 12;
/** How far the "z" sits past the sleeping cat's head, and how far it rises to get there. */
const ZZ_AHEAD = 6;
const ZZ_RISE = 10;
/** Half the click box's least width: over 44px (SC 2.5.5), wider for a wider frame. */
export const HIT_HALF_WIDTH = 48;
/** The click box's least height: a curled-up cat is still a 44px target (SC 2.5.5). */
const HIT_MIN_HEIGHT = 44;
const WING_BEAT_MS = 16;

const f = (n: number): string => n.toFixed(2);
export const clamp = (v: number, lo: number, hi: number): number =>
  Math.max(lo, Math.min(hi, v));

type Attrs = Record<string, string | number>;

const set = (node: Element, name: string, value: string | number): void => {
  node.setAttribute(name, String(value));
};
const translate = (x: number, y: number): string =>
  `translate(${f(x)} ${f(y)})`;

const el = <K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Attrs,
  parent: Element,
): SVGElementTagNameMap[K] => {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) set(node, k, v);
  parent.append(node);
  return node;
};

/** A round-capped stroke in one of the cat's line colors. */
const line = (part: string, width: number): Attrs => ({
  class: `cat-line-${part}`,
  'stroke-width': width,
  'stroke-linecap': 'round',
});

const NAMED = Object.fromEntries(
  (Object.keys(POSE_FRAME) as NamedPose[]).map((name) => [name, pose(name)]),
) as Record<NamedPose, Pose>;

const STILL: Motion = {
  travelled: 0,
  moving: false,
  lift: 0,
};

/** A frame's drawn size and the cat's own size inside it, in px. */
const sizeOf = (id: CatId, frame: Frame) => {
  const [, , , , dw, dh, w, h] = SHEET[id][frame];
  return { dw, dh, w, h };
};

/** The rise from the side-on sit to standing, whose part-way drawings keep the front paws planted. */
const RISE: readonly Frame[] = ['sitside', 'risehalf', 'risehigh', 'stand'];
const RISE_TO = RISE.length - 1;

/** px a part-way rising frame is drawn off center, before the flip: its front paw steps evenly from the side-on sit's to the stand's, which both stay centered like every other frame. */
const pawShift = (id: CatId, frame: Frame): number => {
  const at = RISE.indexOf(frame);
  if (at <= 0 || at >= RISE_TO) return 0;
  const paw = (f: Frame) => SHEET[id][f][8];
  const share = at / RISE_TO;
  return paw('sitside') + (paw('stand') - paw('sitside')) * share - paw(frame);
};

/** How long `frame` shows before the next may replace it; a cat already on the move changes at the walk's pace. */
const holdOf = (
  frame: Frame | null,
  hurried = false,
  sittingDown = false,
): number =>
  (!hurried &&
    frame &&
    ((sittingDown && DOWN_HOLD_MS[frame]) || HOLD_MS[frame])) ||
  TICK_MS;

/** The frame a pose is drawn as, standing still. */
const stillFrame = (p: Pose): Frame =>
  frameFor(grounded(p), NAMED, { ...STILL, lift: p.y });

const CAT_IDS = Object.keys(SHEET) as CatId[];

/** Height of a pose's highest drawn point above the ground, outline included, for the tallest cat. */
export const highestPoint = (p: Pose): number => {
  const frame = stillFrame(p);
  return (
    Math.max(...CAT_IDS.map((id) => sizeOf(id, frame).h)) +
    OUTLINE +
    liftOf(p) +
    (p.zz > 0 ? ZZ_HEIGHT : 0)
  );
};

/** How far a pose's drawing reaches left and right of its origin, outline included, for the widest cat. */
export const reachOf = (p: Pose): [number, number] => {
  const frame = stillFrame(p);
  const half =
    Math.max(
      ...CAT_IDS.map(
        (id) => sizeOf(id, frame).w / 2 + Math.abs(pawShift(id, frame)),
      ),
    ) + OUTLINE;
  const zz = p.zz > 0 ? ZZ_AHEAD + ZZ_WIDTH : 0;
  return p.face < 0 ? [-half - zz, half] : [-half, half + zz];
};

/** One frame of the sheet, shown through a window cut to its size. */
interface Layer {
  view: SVGSVGElement;
  image: SVGImageElement;
}

/** A cat's frame sheet as imported: its URL and size in px. */
export interface Sheet {
  src: string;
  width: number;
  height: number;
}

export interface CatRig {
  id: CatId;
  sheet: Sheet;
  /** Behind the cat, and over it (a box's front). */
  props: SVGGElement;
  propsFront: SVGGElement;
  root: SVGGElement;
  hit: SVGRectElement;
  zz: SVGPathElement;
  flip: SVGGElement;
  /** The window the current frame shows through. */
  layer: Layer;
  frame: Frame | null;
  shownAt: number;
  /** A frame waiting for the current one's step to end. */
  pending: boolean;
  /** The next frame cuts in at once: a resize or reduced motion. */
  cut: boolean;
  /** The frame the pose last asked for, and since when. */
  wanted: Frame | null;
  wantedAt: number;
  lastX: number;
  /** Where the cat was drawn when its walk frame last changed: a walk moves only with the frame. */
  stepX: number;
  movedAt: number;
  travelled: number;
}

export const createCatRig = (
  svg: SVGSVGElement,
  id: CatId,
  sheet: Sheet,
): CatRig => {
  /* Props behind the cat, then the cat, then props in front of it. */
  const props = el('g', {}, svg);
  const root = el('g', { class: 'cat-hit' }, svg);
  const hit = el('rect', { class: 'cat-hit-area' }, root);
  const flip = el('g', {}, root);
  /* Hidden until a frame is drawn: an empty window shows the whole sheet, and takes clicks. */
  const makeLayer = (): Layer => {
    const view = el(
      'svg',
      {
        overflow: 'hidden',
        'aria-hidden': 'true',
        focusable: 'false',
        visibility: 'hidden',
      },
      flip,
    );
    const image = el('image', {}, view);
    return { view, image };
  };
  const layer = makeLayer();
  /* Outside the flip, so the letter never reads backwards. */
  const zz = el(
    'path',
    {
      d: ZZ,
      ...line('z', 1.6),
      'stroke-linejoin': 'round',
      visibility: 'hidden',
    },
    root,
  );
  const propsFront = el('g', {}, svg);
  return {
    id,
    sheet,
    props,
    propsFront,
    root,
    hit,
    zz,
    flip,
    layer,
    frame: null,
    shownAt: -Infinity,
    pending: false,
    cut: true,
    wanted: null,
    wantedAt: 0,
    lastX: NaN,
    stepX: 0,
    movedAt: -Infinity,
    travelled: 0,
  };
};

/** Half the click box's width and its height above the cat's feet, for a frame. */
export const hitBox = (id: CatId, frame: Frame) => {
  const { w, h } = sizeOf(id, frame);
  return {
    half: Math.max(HIT_HALF_WIDTH, w / 2 + OUTLINE),
    tall: Math.max(HIT_MIN_HEIGHT, h + OUTLINE),
  };
};

/** Loads the cat's frames, once: called when its band first comes into view, so an unseen cat costs no download. */
export const loadSheet = (rig: CatRig): void => {
  const { image } = rig.layer;
  if (!image.hasAttribute('href')) set(image, 'href', rig.sheet.src);
};

/** Shows `frame` in `layer`, its ground line at y = 0 and centered on x = 0. */
const drawFrame = (rig: CatRig, layer: Layer, frame: Frame): void => {
  const [sx, sy, sw, sh, dw, dh, , h] = SHEET[rig.id][frame];
  const { width, height } = rig.sheet;
  set(layer.view, 'x', f(-dw / 2 + pawShift(rig.id, frame)));
  set(layer.view, 'y', f(-(PAD + h)));
  set(layer.view, 'width', dw);
  set(layer.view, 'height', dh);
  set(layer.view, 'viewBox', `${sx} ${sy} ${sw} ${sh}`);
  set(layer.image, 'width', width);
  set(layer.image, 'height', height);
};

/** What stepFrame keeps between frames. */
type FrameStep = Pick<
  CatRig,
  'frame' | 'shownAt' | 'pending' | 'cut' | 'stepX' | 'wanted' | 'wantedAt'
>;

/**
 * Moves `s` toward the frame `wanted`, returning true when the frame changes.
 * Frames cut, never fade: a fade doubles the legs. Each holds a full step, so a
 * quick move still shows its in-between, and a walk advances one frame at a time.
 */
const stepFrame = (
  s: FrameStep,
  wanted: Frame,
  now: number,
  x: number,
  hurried: boolean,
): boolean => {
  if (wanted !== s.wanted) {
    s.wanted = wanted;
    s.wantedAt = now;
  }
  const at = s.frame === null ? -1 : WALK.indexOf(s.frame);
  const to = WALK.indexOf(wanted);
  const blip =
    !s.cut &&
    to < 0 &&
    !(s.frame && bridges(s.frame, wanted)) &&
    now - s.wantedAt < BLIP_MS;
  if (blip) {
    s.pending = wanted !== s.frame;
    return false;
  }
  const ahead = (to - at + WALK.length) % WALK.length;
  /* Within a walk: hold while the body is still, else step toward `wanted` without skipping a phase. */
  const route = s.frame && !s.cut ? routeStep(s.frame, wanted) : null;
  const next =
    at >= 0 && to >= 0
      ? x === s.stepX
        ? s.frame!
        : walkFrame(at + Math.min(ahead, MAX_WALK_STEP))
      : (route ?? wanted);
  s.pending =
    next !== s.frame &&
    now - s.shownAt < holdOf(s.frame, hurried, isSeated(wanted));
  if (next === s.frame) s.cut = false;
  if (next === s.frame || s.pending) return false;
  /* A cut counts as a full step already shown, so the next frame need not wait. */
  s.shownAt = s.cut ? now - TICK_MS : now;
  s.cut = false;
  s.stepX = x;
  s.frame = next;
  /* Part-way along a route: the next frame follows when this one's hold ends. */
  s.pending = next !== wanted && !(WALK.includes(next) && to >= 0);
  return true;
};

/** The two crouch drawings a creeping cat swaps between, one per step. */
const CREEP: readonly Frame[] = ['crouch', 'crouchdown'];
/** px a creeping cat covers per drawing, about a third of a walk stride. */
export const CREEP_STEP_PX = 13;

/**
 * The crouch drawing a creeping cat shows, or null when it is not creeping:
 * the body moves only when the drawing changes, so its paws never glide, and a
 * stopped cat settles on the crouch.
 */
export const creepFrame = (
  s: Pick<FrameStep, 'frame' | 'stepX'>,
  x: number,
  moving: boolean,
): Frame | null => {
  if (s.frame === null || !CREEP.includes(s.frame)) return null;
  if (!moving) return 'crouch';
  if (Math.abs(x - s.stepX) < CREEP_STEP_PX) return s.frame;
  return s.frame === 'crouch' ? 'crouchdown' : 'crouch';
};

/**
 * Where the cat is drawn: while a walk or creeping crouch frame shows, where that
 * frame began, so a planted paw never slides; a stopped crouch catches up in place.
 */
export const drawnXOf = (
  s: Pick<FrameStep, 'frame' | 'stepX'>,
  x: number,
  moving: boolean,
): number => {
  if (s.frame === null) return x;
  if (WALK.includes(s.frame) || s.frame === 'crouchdown') return s.stepX;
  return s.frame === 'crouch' && moving ? s.stepX : x;
};

/** True while a frame waits its turn or has not yet shown a full step: the loop draws until both end. */
export const isStepping = (
  rig: Pick<CatRig, 'shownAt' | 'pending'> & { frame?: Frame | null },
  now: number,
): boolean => rig.pending || now - rig.shownAt < holdOf(rig.frame ?? null);

/** Makes the next frame show at once: a jump cut (resize, reduced motion). */
export const settleFrame = (rig: CatRig): void => {
  rig.shownAt = -Infinity;
  rig.pending = false;
  rig.cut = true;
};

/** px the paws stand above the ground: a climb raises the whole cat onto the upper brick. */
const feetUp = (p: Pose): number =>
  p.rot === 0
    ? Math.max(0, p.by - Math.max(p.fN[1], p.fF[1], p.hN[1], p.hF[1]))
    : 0;

/** px the drawing is raised: a jump's lift and a climb's height. */
const liftOf = (p: Pose): number => Math.max(0, p.y) + feetUp(p);

/** The pose as if its paws were on the ground, to compare with the named poses. */
const grounded = (p: Pose): Pose => ({ ...p, by: p.by - feetUp(p) });

/** A drawing is only ever lifted and turned to face its way, never squashed, stretched or tilted: the drawings face left. */
const spriteTransform = (face: number, lift: number): string =>
  `translate(0 ${f(-lift)}) scale(${face < 0 ? 1 : -1} 1)`;

export const renderCat = (
  rig: CatRig,
  p: Pose,
  now: number,
  x: number,
  groundY: number,
): void => {
  const step = Number.isNaN(rig.lastX) ? 0 : Math.abs(x - rig.lastX);
  rig.lastX = x;
  if (step > 0) rig.movedAt = now;
  /* A frame drawn too soon after the last moves the cat too little to tell: walking lasts until it has stood still a while. */
  const moving = now - rig.movedAt < STILL_MS;
  rig.travelled = moving ? rig.travelled + step : 0;
  const posed = frameFor(grounded(p), NAMED, {
    travelled: rig.travelled,
    moving,
    lift: p.y,
  });
  const wanted =
    (posed === 'crouch' ? creepFrame(rig, x, moving) : null) ?? posed;

  if (stepFrame(rig, wanted, now, x, moving)) {
    drawFrame(rig, rig.layer, rig.frame!);
    set(rig.layer.view, 'visibility', 'visible');
    set(rig.root, 'data-frame', rig.frame!);
  }
  const shown = rig.frame ?? wanted;

  const { w, h } = sizeOf(rig.id, shown);
  /* A jump leaves the ground only on its air drawing: push-off and landing stay on the floor. */
  const lift = GROUND_DRAWINGS.has(shown) ? feetUp(p) : liftOf(p);
  const { half, tall } = hitBox(rig.id, shown);
  /* The drawing is flipped to face its way, so its paw shift lands mirrored. */
  set(rig.hit, 'x', f(-half - p.face * pawShift(rig.id, shown)));
  set(rig.hit, 'width', f(2 * half));
  set(rig.hit, 'y', f(-(tall + lift)));
  set(rig.hit, 'height', f(tall + lift));

  const sleeping = p.zz > 0;
  set(rig.zz, 'visibility', sleeping ? 'visible' : 'hidden');
  if (sleeping) {
    const zx = p.face * (w / 2 + ZZ_AHEAD) - (p.face < 0 ? ZZ_WIDTH : 0);
    set(rig.zz, 'transform', translate(zx, -h - lift + ZZ_RISE * (1 - p.zz)));
    set(rig.zz, 'opacity', f(Math.min(1, 2 * p.zz)));
  }

  const drawnX = drawnXOf(rig, x, moving);
  set(rig.root, 'transform', translate(drawnX, groundY));
  set(rig.flip, 'transform', spriteTransform(p.face, lift));
};

export interface PropRig {
  node: SVGGElement;
  draw: (state: PropState, now: number) => void;
  remove: () => void;
}

/* Props share the cat classes, so they follow the theme too. */
/* `front` is drawn over the cat: the yarn ball held in its paws. */
export const createProp = (
  parent: SVGGElement,
  front: SVGGElement,
  kind: PropKind,
): PropRig => {
  /* The yarn ball is held in the paws, so it draws over the cat. */
  const node = el('g', { class: 'cat-prop' }, kind === 'yarn' ? front : parent);
  const remove = (): void => {
    node.remove();
  };
  const solid = (part: string): Attrs => ({
    class: `cat-prop-solid cat-prop-${part}`,
    'stroke-width': 1.8,
    'stroke-linejoin': 'round',
  });
  if (kind === 'toy') {
    const string = el(
      'path',
      { class: 'cat-prop-string', 'stroke-width': 1.2 },
      node,
    );
    const pom = el('g', {}, node);
    el(
      'path',
      {
        d: 'M0 0q-5 4 -6 11M0 0q0 6 1 12M0 0q5 3 6 10',
        class: 'cat-prop-feather',
        'stroke-width': 2.2,
        'stroke-linecap': 'round',
      },
      pom,
    );
    el('circle', { r: 4.2, ...solid('toy') }, pom);
    return {
      node,
      remove,
      draw: (s) => {
        const px = s.x + (s.y - STRING_TOP) * Math.sin(s.r * D);
        const py = STRING_TOP + (s.y - STRING_TOP) * Math.cos(s.r * D);
        set(string, 'd', `M${f(s.x)} ${STRING_TOP}L${f(px)} ${f(py)}`);
        set(pom, 'transform', translate(px, py));
        set(node, 'opacity', f(s.o));
      },
    };
  }
  if (kind === 'fly') {
    const wings = [-2.2, 2.2].map((cx) =>
      el(
        'ellipse',
        { cx, cy: -2.5, rx: 3, ry: 1.4, class: 'cat-prop-wing' },
        node,
      ),
    );
    el('ellipse', { rx: 2.2, ry: 1.6, class: 'cat-prop-body' }, node);
    return {
      node,
      remove,
      draw: (s, now) => {
        set(node, 'transform', translate(s.x, s.y));
        set(node, 'opacity', f(s.o));
        wings.forEach((w, i) => {
          set(
            w,
            'ry',
            f(0.4 + 1.3 * Math.abs(Math.sin(now / WING_BEAT_MS + i))),
          );
        });
      },
    };
  }
  if (kind === 'cup') {
    el(
      'path',
      {
        d: 'M5 -9a4 4 0 0 1 0 6.5',
        class: 'cat-prop-string',
        'stroke-width': 2,
      },
      node,
    );
    el('path', { d: 'M-5.5 -12h11l-1 12h-9z', ...solid('cup') }, node);
  } else if (kind === 'post') {
    el(
      'rect',
      {
        x: -5,
        y: -POST_HEIGHT,
        width: 10,
        height: POST_HEIGHT,
        ...solid('card'),
      },
      node,
    );
    el(
      'path',
      {
        d: ROPE_TURNS.map((y) => `M-5 ${y}l10 3`).join(''),
        class: 'cat-prop-rope',
        'stroke-width': 1.3,
      },
      node,
    );
    el(
      'rect',
      {
        x: -10,
        y: -POST_HEIGHT - 4,
        width: 20,
        height: 5,
        ...solid('card'),
      },
      node,
    );
  } else {
    el(
      'path',
      { d: 'M4 4q9 5 16 3', class: 'cat-prop-yarn-end', 'stroke-width': 1.5 },
      node,
    );
    el('circle', { r: 6, ...solid('toy') }, node);
    el(
      'path',
      {
        d: 'M-4 -3.5q4 3 8 0M-5 0.5q5 3 10 0M-2 -5q2.5 5 0 10',
        class: 'cat-prop-rope',
        'stroke-width': 1.1,
      },
      node,
    );
  }
  return {
    node,
    remove,
    draw: (s) => {
      set(node, 'transform', `${translate(s.x, s.y)} rotate(${f(s.r)})`);
      set(node, 'opacity', f(s.o));
    },
  };
};
