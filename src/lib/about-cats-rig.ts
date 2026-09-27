/*
 * Draws one About cat as a jointed SVG sticker. Poses and moves are in
 * about-cats-moves.ts; AboutCats.vue owns the frame loop. Units are CSS px,
 * y down, the ground at y = 0 under the cat's origin.
 */
import type { CatId, Pose, PropKind, PropState } from './about-cats-types';

const NS = 'http://www.w3.org/2000/svg';
const D = Math.PI / 180;

/** Sticker edge and its offset shadow, as on the site's cards. */
const EDGE = 5;
const SHADOW = 3;
const LEG_W = 7.5;
const TAIL_W = 7;
const TAIL_SEGS = 8;
const TAIL_SEG = 4.2;
const UPPER = 9.5;
const LOWER = 9.5;
const BODY_LEN = 30;
const HEAD_RX = 13;
const HEAD_RY = 11.5;
const DETAIL = 0.9;

/** Near-critical spring: the tail follows through once and settles, never swings. */
const TAIL_STIFFNESS = 0.12;
const TAIL_DAMPING = 0.62;
const PHYS_STEP_MS = 1000 / 60;
const PHYS_MAX_STEPS = 4;

const EARS = 'M-11 -4L-12 -19.5L-2 -10.5ZM2 -10.5L10.5 -19.5L11 -4Z';
/** Mochi's orange front ear, inset from the ear's edge. */
const FRONT_EAR_PATCH = 'M2.6 -11L10 -18.4L10.4 -5.2Z';
const EYE_CENTRES: readonly (readonly [number, number])[] = [
  [-1, -1],
  [7, -1.5],
];
/** Eye radius and pupil radius in px: Pepper's green eyes and Biscuit's big amber ones have pupils. */
const EYES: Record<CatId, { r: number; pupil: number }> = {
  pepper: { r: 2.1, pupil: 0.9 },
  mochi: { r: 1.8, pupil: 0 },
  biscuit: { r: 3, pupil: 1.3 },
};
/** The pupils sit a little forward in the eye, so the cat looks where it faces. */
const PUPIL_AHEAD = 0.4;
const WHISKERS = 'M11 3l9 -3M11 4.4l10 0.5M11 5.8l9 3.5';
/** Where Pepper's back stripes cross the body, as fractions of its length. */
const STRIPES = [0.3, 0.5, 0.7];
/** The feather wand hangs from here, above the cat's band. */
const STRING_TOP = -100;
/** The scratching post's height in px, cap aside; with it, it stays under the band. */
export const POST_HEIGHT = 92;
/** A small, snug box: a resting cat's head and back show over its rim. */
const BOX_HALF = 22;
const BOX_HEIGHT = 15;
/** A small and a larger "z", drawn from the lower left of the small one. */
const ZZ = 'M0 0h4l-4 5h4M6 -9h6l-6 7h6';
const ZZ_HEIGHT = 14;
/** Where the "z" rests from the head centre, and how far it rises to get there. */
const ZZ_AHEAD = 14;
const ZZ_ABOVE = 24;
const ZZ_RISE = 10;
/** Half the click box's width: the whole cat either way it faces, over 24px (SC 2.5.8). */
export const HIT_HALF_WIDTH = 48;
const WING_BEAT_MS = 16;

interface Point {
  x: number;
  y: number;
}
const pt = (x: number, y: number): Point => ({ x, y });
const f = (n: number): string => n.toFixed(2);
export const clamp = (v: number, lo: number, hi: number): number =>
  Math.max(lo, Math.min(hi, v));

const el = <K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
  parent: Element,
): SVGElementTagNameMap[K] => {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  parent.append(node);
  return node;
};

/** Two-bone inverse kinematics; `sign` picks which way the joint bends. */
const ik = (
  a: Point,
  t: Point,
  sign: number,
  scale: number,
): [Point, Point] => {
  const upper = UPPER * scale;
  const lower = LOWER * scale;
  const dx = t.x - a.x;
  const dy = t.y - a.y;
  const d = Math.hypot(dx, dy) || 0.001;
  const reach = clamp(d, Math.abs(upper - lower) + 0.5, upper + lower - 0.01);
  const ux = dx / d;
  const uy = dy / d;
  const bend =
    Math.acos(
      clamp(
        (upper * upper + reach * reach - lower * lower) / (2 * upper * reach),
        -1,
        1,
      ),
    ) * sign;
  const joint = pt(
    a.x + upper * (ux * Math.cos(bend) - uy * Math.sin(bend)),
    a.y + upper * (ux * Math.sin(bend) + uy * Math.cos(bend)),
  );
  return [joint, pt(a.x + ux * reach, a.y + uy * reach)];
};

const smoothClosed = (pts: Point[]): string => {
  const n = pts.length;
  let d = `M${f(pts[0].x)} ${f(pts[0].y)}`;
  for (let i = 0; i < n; i += 1) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    d += `C${f(p1.x + (p2.x - p0.x) / 6)} ${f(p1.y + (p2.y - p0.y) / 6)} ${f(p2.x - (p3.x - p1.x) / 6)} ${f(p2.y - (p3.y - p1.y) / 6)} ${f(p2.x)} ${f(p2.y)}`;
  }
  return `${d}Z`;
};

interface Layer {
  group: SVGGElement;
  farLegs: [SVGPathElement, SVGPathElement];
  tail: SVGPathElement;
  body: SVGPathElement;
  haunch: SVGEllipseElement;
  legs: [SVGPathElement, SVGPathElement];
  head: SVGGElement;
  ears: SVGPathElement;
}

export interface CatRig {
  id: CatId;
  /** Behind the cat, and over it (a box's front). */
  props: SVGGElement;
  propsFront: SVGGElement;
  root: SVGGElement;
  hit: SVGRectElement;
  zz: SVGPathElement;
  flip: SVGGElement;
  layers: Layer[];
  bodyClip: SVGPathElement;
  marks: SVGGElement;
  /** Pepper's tabby stripes and Mochi's patch; none for Biscuit. */
  stripes: SVGPathElement[];
  patch: SVGEllipseElement | null;
  tailMarks: SVGPathElement;
  eyesOpen: SVGGElement;
  eyesShut: SVGPathElement;
  earPatch: SVGPathElement | null;
  mouth: SVGEllipseElement;
  tailAngle: number[];
  tailSpeed: number[];
  physAt: number;
  /** Head centre in the svg's coordinates, for the pointer-watcher. */
  head: Point;
}

let uid = 0;

/*
 * Colours are classes, not attributes: the stylesheet maps them to tokens per
 * cat and per theme, and the CSP refuses `style` attributes.
 */
export const createCatRig = (svg: SVGSVGElement, id: CatId): CatRig => {
  uid += 1;
  const key = `cat${uid}`;
  const defs = el('defs', {}, svg);
  const bodyClip = el('path', {}, el('clipPath', { id: `${key}-b` }, defs));
  el(
    'ellipse',
    { rx: HEAD_RX, ry: HEAD_RY },
    el('clipPath', { id: `${key}-h` }, defs),
  );
  /* Props behind the cat, then the cat, then props in front of it. */
  const props = el('g', {}, svg);
  const root = el('g', { class: 'cat-hit' }, svg);
  const hit = el(
    'rect',
    { class: 'cat-hit-area', x: -HIT_HALF_WIDTH, width: 2 * HIT_HALF_WIDTH },
    root,
  );
  const flip = el('g', {}, root);

  const layer = (tone: 'shadow' | 'edge' | 'fill', extra: number): Layer => {
    const group = el(
      'g',
      tone === 'shadow'
        ? { class: 'cat-shadow', transform: `translate(${SHADOW} ${SHADOW})` }
        : { class: tone === 'edge' ? 'cat-edge' : 'cat-fill' },
      flip,
    );
    const stroke = (width: number, part: string): SVGPathElement =>
      el(
        'path',
        {
          class: `cat-line-${part}`,
          'stroke-width': width + extra,
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
        },
        group,
      );
    const solid = (part: string): Record<string, string | number> => ({
      class: `cat-solid-${part}`,
      'stroke-width': extra,
      'stroke-linejoin': 'round',
    });
    const farLegs: [SVGPathElement, SVGPathElement] = [
      stroke(LEG_W, 'far'),
      stroke(LEG_W, 'far'),
    ];
    const tail = stroke(TAIL_W, id === 'mochi' ? 'patch' : 'fur');
    const body = el('path', solid('fur'), group);
    const haunch = el('ellipse', solid('fur'), group);
    const legs: [SVGPathElement, SVGPathElement] = [
      stroke(LEG_W, 'fur'),
      stroke(LEG_W, 'fur'),
    ];
    const head = el('g', {}, group);
    const ears = el('path', { d: EARS, ...solid('fur') }, head);
    el('ellipse', { rx: HEAD_RX, ry: HEAD_RY, ...solid('fur') }, head);
    return { group, farLegs, tail, body, haunch, legs, head, ears };
  };

  const layers = [layer('shadow', EDGE), layer('edge', EDGE), layer('fill', 0)];
  const top = layers[2];

  const marks = el('g', { 'clip-path': `url(#${key}-b)` }, top.group);
  top.group.insertBefore(marks, top.haunch);
  /* Made once and moved each frame; building them per frame was most of a draw. */
  const stripes =
    id === 'pepper'
      ? STRIPES.map(() =>
          el(
            'path',
            {
              class: 'cat-line-mark',
              'stroke-width': 2.4,
              'stroke-linecap': 'round',
            },
            marks,
          ),
        )
      : [];
  const patch =
    id === 'mochi'
      ? el('ellipse', { rx: 9, ry: 6.5, class: 'cat-solid-patch' }, marks)
      : null;
  const tailMarks = el(
    'path',
    {
      class: 'cat-line-mark',
      'stroke-width': TAIL_W,
      'stroke-dasharray': id === 'mochi' ? '4 5' : '3 4',
    },
    top.group,
  );
  top.group.insertBefore(tailMarks, top.body);

  const headMarks = el('g', { 'clip-path': `url(#${key}-h)` }, top.head);
  if (id === 'pepper') {
    el(
      'path',
      {
        d: 'M-4 -10l1.5 -4M0 -11v-4',
        class: 'cat-line-mark',
        'stroke-width': 2.2,
        'stroke-linecap': 'round',
      },
      headMarks,
    );
  }
  if (id === 'mochi')
    el('circle', { cx: 6, cy: -8, r: 7, class: 'cat-solid-mark' }, headMarks);

  /* Mochi's front ear is orange, as in her photos; it turns with the ears. */
  const earPatch =
    id === 'mochi'
      ? el('path', { d: FRONT_EAR_PATCH, class: 'cat-solid-patch' }, top.head)
      : null;
  if (earPatch) top.head.insertBefore(earPatch, top.ears.nextSibling);

  const eye = EYES[id];
  const eyesOpen = el('g', {}, top.head);
  for (const [cx, cy] of EYE_CENTRES) {
    el('circle', { cx, cy, r: eye.r, class: 'cat-solid-eye' }, eyesOpen);
    if (eye.pupil > 0)
      el(
        'circle',
        { cx: cx + PUPIL_AHEAD, cy, r: eye.pupil, class: 'cat-solid-pupil' },
        eyesOpen,
      );
  }
  const eyesShut = el(
    'path',
    {
      d: 'M-3 -1q2 1.8 4 0M5 -1.5q2 1.8 4 0',
      class: 'cat-line-lid',
      'stroke-width': 1.1,
      'stroke-linecap': 'round',
    },
    top.head,
  );
  const mouth = el(
    'ellipse',
    { cx: 9, cy: 5, rx: 2.3, ry: 0, class: 'cat-solid-mouth' },
    top.head,
  );
  el(
    'path',
    {
      d: WHISKERS,
      class: 'cat-line-whisker',
      'stroke-width': DETAIL,
      'stroke-linecap': 'round',
    },
    top.head,
  );
  /* Outside the flip, so the letter never reads backwards. */
  const zz = el(
    'path',
    {
      d: ZZ,
      class: 'cat-line-z',
      'stroke-width': 1.6,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      visibility: 'hidden',
    },
    root,
  );

  const propsFront = el('g', {}, svg);

  return {
    id,
    props,
    propsFront,
    root,
    hit,
    zz,
    flip,
    layers,
    bodyClip,
    marks,
    stripes,
    patch,
    tailMarks,
    eyesOpen,
    eyesShut,
    earPatch,
    mouth,
    tailAngle: [],
    tailSpeed: [],
    physAt: 0,
    head: pt(0, 0),
  };
};

const stepTail = (rig: CatRig, targets: number[], now: number): void => {
  if (rig.tailAngle.length === 0) {
    rig.tailAngle = [...targets];
    rig.tailSpeed = targets.map(() => 0);
    rig.physAt = now;
    return;
  }
  let steps = Math.min(
    PHYS_MAX_STEPS,
    Math.floor((now - rig.physAt) / PHYS_STEP_MS),
  );
  rig.physAt += steps * PHYS_STEP_MS;
  if (now - rig.physAt > PHYS_STEP_MS * PHYS_MAX_STEPS) rig.physAt = now;
  while (steps > 0) {
    steps -= 1;
    for (let i = 0; i < TAIL_SEGS; i += 1) {
      const want =
        i === 0
          ? targets[0]
          : rig.tailAngle[i - 1] + (targets[i] - targets[i - 1]);
      rig.tailSpeed[i] +=
        (want - rig.tailAngle[i]) * TAIL_STIFFNESS -
        rig.tailSpeed[i] * TAIL_DAMPING;
      rig.tailAngle[i] += rig.tailSpeed[i];
    }
  }
};

/** Resets the tail so a jump cut (resize, reduced motion) does not swing it. */
export const settleTail = (rig: CatRig): void => {
  rig.tailAngle = [];
};

interface Skeleton {
  centre: Point;
  length: number;
  half: number;
  hip: Point;
  shoulder: Point;
  head: Point;
  at: (u: number, v: number) => Point;
}

const skeleton = (p: Pose): Skeleton => {
  const b = p.ba * D;
  const along = pt(Math.cos(b), -Math.sin(b));
  const up = pt(-Math.sin(b), -Math.cos(b));
  const centre = pt(0, -p.by - p.y);
  const length = BODY_LEN * (2 - p.sq);
  const half = (p.bt * p.sq) / 2;
  const hip = pt(
    centre.x - (along.x * length) / 2,
    centre.y - (along.y * length) / 2,
  );
  const shoulder = pt(
    centre.x + (along.x * length) / 2,
    centre.y + (along.y * length) / 2,
  );
  const at = (u: number, v: number): Point =>
    pt(hip.x + along.x * u + up.x * v, hip.y + along.y * u + up.y * v);
  return {
    centre,
    length,
    half,
    hip,
    shoulder,
    head: pt(shoulder.x + p.hx, shoulder.y + p.hy),
    at,
  };
};

const tailTargets = (p: Pose, seconds: number): number[] =>
  Array.from(
    { length: TAIL_SEGS },
    (_, i) =>
      p.ta -
      p.ba +
      p.tc * i +
      p.tw * Math.sin(seconds * 9 - i * 0.8) * Math.max(0, (i - 4) / 3),
  );

const rotateAbout = (q: Point, c: Point, degrees: number): Point => {
  const a = degrees * D;
  const dx = q.x - c.x;
  const dy = q.y - c.y;
  return pt(
    c.x + dx * Math.cos(a) - dy * Math.sin(a),
    c.y + dx * Math.sin(a) + dy * Math.cos(a),
  );
};

/** The "z"'s lower left in the cat's ground coordinates, rising as `zz` goes to 1. */
const zzAt = (p: Pose, head: Point): Point =>
  pt(p.face * (head.x + ZZ_AHEAD), head.y - ZZ_ABOVE + ZZ_RISE * (1 - p.zz));

type Paw = 'fN' | 'fF' | 'hN' | 'hF';

/** Each leg's hip or shoulder, knee and paw, as drawn: a paw its leg cannot reach stops short. */
const legBones = (p: Pose): Record<Paw, [Point, Point, Point]> => {
  const { centre, length, half, at } = skeleton(p);
  const front = at(length - 3, -half * 0.3);
  const hind = at(3, -half * 0.3);
  const bone = (from: Point, k: Paw, sign: number): [Point, Point, Point] => {
    const target = pt(centre.x + p[k][0], centre.y + p[k][1]);
    return [from, ...ik(from, target, sign, k[0] === 'f' ? p.fl : p.hl)];
  };
  return {
    fN: bone(front, 'fN', 1),
    fF: bone(pt(front.x - 3, front.y), 'fF', 1),
    hN: bone(hind, 'hN', -1),
    hF: bone(pt(hind.x + 3, hind.y), 'hF', -1),
  };
};

/** Past its highest point a pose's drawing reaches this much more, kept as the band's headroom rule. */
const STROKE_REACH = EDGE + LEG_W / 2;
/** Half the widest edge stroke, a leg's: how far a drawing reaches past a point sideways. */
const SIDE_REACH = (LEG_W + EDGE) / 2;
/** The "z" glyph's width, drawn right from its lower left whichever way the cat faces. */
const ZZ_WIDTH = 12;

/*
 * A pose's outermost drawn points, facing right, before its edge.
 * The tail is taken straight at its targets; the spring only lags behind them.
 */
const outline = (p: Pose): Point[] => {
  const { centre, half, at, length, head } = skeleton(p);
  const headPoint = (q: Point): Point => {
    const turned = rotateAbout(q, pt(0, 0), p.hr);
    return pt(head.x + turned.x, head.y + turned.y);
  };
  const ears = [pt(-12, -19.5), pt(10.5, -19.5)].map((tip) =>
    rotateAbout(tip, pt(0, -8), -30 * p.ears),
  );
  const points: Point[] = [
    at(length * 0.5, half * 1.05),
    at(-2, half),
    at(length + 2, half * 0.95),
    at(-6, 0),
    at(length + 7, 0),
    headPoint(pt(0, -HEAD_RY)),
    headPoint(pt(HEAD_RX, 0)),
    headPoint(pt(-HEAD_RX, 0)),
    ...ears.map(headPoint),
    ...Object.values(legBones(p)).map(([, , end]) => end),
  ];
  let q = at(-4, 0);
  for (const angle of tailTargets(p, 0)) {
    q = pt(
      q.x + TAIL_SEG * Math.cos(angle * D),
      q.y + TAIL_SEG * Math.sin(angle * D),
    );
    points.push(q);
  }
  return points.map((point) => rotateAbout(point, centre, p.rot));
};

/** Height of a pose's highest drawn point above the ground, edge included. */
export const highestPoint = (p: Pose): number => {
  const tops = outline(p).map((q) => q.y);
  if (p.zz > 0) tops.push(zzAt(p, skeleton(p).head).y - ZZ_HEIGHT);
  return -Math.min(...tops) + STROKE_REACH;
};

/** How far a pose's drawing reaches left and right of its origin, edge included. */
export const reachOf = (p: Pose): [number, number] => {
  const xs = outline(p).map((q) => p.face * q.x);
  if (p.zz > 0) {
    const z = zzAt(p, skeleton(p).head);
    xs.push(z.x, z.x + ZZ_WIDTH);
  }
  return [Math.min(...xs) - SIDE_REACH, Math.max(...xs) + SIDE_REACH];
};

export const renderCat = (
  rig: CatRig,
  p: Pose,
  now: number,
  x: number,
  groundY: number,
): void => {
  const { centre, length, half, hip, shoulder, head, at } = skeleton(p);
  const body = smoothClosed([
    at(-6, half * 0.2),
    at(-2, half),
    at(length * 0.5, half * 1.05),
    at(length + 2, half * 0.95),
    at(length + 7, 0),
    at(length + 3, -half * 0.95),
    at(length * 0.5, -half),
    at(-2, -half * 0.95),
    at(-6.5, -half * 0.3),
  ]);
  rig.bodyClip.setAttribute('d', body);

  const bones = legBones(p);
  const leg = (k: Paw): string => {
    const [from, joint, end] = bones[k];
    return `M${f(from.x)} ${f(from.y)}L${f(joint.x)} ${f(joint.y)}L${f(end.x)} ${f(end.y)}`;
  };
  const legs = { fN: leg('fN'), fF: leg('fF'), hN: leg('hN'), hF: leg('hF') };

  const targets = tailTargets(p, now / 1000);
  stepTail(rig, targets, now);
  const tp: Point[] = [at(-4, 0)];
  for (let i = 0; i < TAIL_SEGS; i += 1) {
    const a = rig.tailAngle[i] * D;
    const q = tp[i];
    tp.push(
      pt(
        q.x + TAIL_SEG * Math.cos(a),
        Math.min(q.y + TAIL_SEG * Math.sin(a), -TAIL_W / 2),
      ),
    );
  }
  let tail = `M${f(tp[0].x)} ${f(tp[0].y)}`;
  for (let i = 1; i < tp.length - 1; i += 1) {
    tail += `Q${f(tp[i].x)} ${f(tp[i].y)} ${f((tp[i].x + tp[i + 1].x) / 2)} ${f((tp[i].y + tp[i + 1].y) / 2)}`;
  }
  tail += `L${f(tp[tp.length - 1].x)} ${f(tp[tp.length - 1].y)}`;

  const haunch = pt(
    hip.x + (shoulder.x - hip.x) * 0.1,
    hip.y + (shoulder.y - hip.y) * 0.1 + 2,
  );
  const haunchR = Math.max(0.01, p.haunch);

  for (const layer of rig.layers) {
    layer.body.setAttribute('d', body);
    layer.farLegs[0].setAttribute('d', legs.fF);
    layer.farLegs[1].setAttribute('d', legs.hF);
    layer.legs[0].setAttribute('d', legs.hN);
    layer.legs[1].setAttribute('d', legs.fN);
    layer.tail.setAttribute('d', tail);
    layer.haunch.setAttribute('cx', f(haunch.x));
    layer.haunch.setAttribute('cy', f(haunch.y));
    layer.haunch.setAttribute('rx', f(haunchR));
    layer.haunch.setAttribute('ry', f(haunchR * 1.05));
    layer.head.setAttribute(
      'transform',
      `translate(${f(head.x)} ${f(head.y)}) rotate(${f(p.hr)})`,
    );
    layer.ears.setAttribute('transform', `rotate(${f(-30 * p.ears)} 0 -8)`);
  }
  rig.tailMarks.setAttribute('d', tail);
  rig.earPatch?.setAttribute('transform', `rotate(${f(-30 * p.ears)} 0 -8)`);

  rig.stripes.forEach((stripe, i) => {
    const k = STRIPES[i];
    const a = at(length * k, -half - 2);
    const z = at(length * k - 1, -half + 8);
    stripe.setAttribute('d', `M${f(a.x)} ${f(a.y)}L${f(z.x)} ${f(z.y)}`);
  });
  if (rig.patch) {
    const o = at(length * 0.35, -half * 0.35);
    rig.patch.setAttribute('cx', f(o.x));
    rig.patch.setAttribute('cy', f(o.y));
  }

  const open = p.eyes > 0.5;
  rig.eyesOpen.setAttribute('visibility', open ? 'visible' : 'hidden');
  rig.eyesShut.setAttribute('visibility', open ? 'hidden' : 'visible');
  rig.mouth.setAttribute('ry', f(3 * p.mouth));
  if (p.zz > 0) {
    const z = zzAt(p, head);
    rig.zz.setAttribute('transform', `translate(${f(z.x)} ${f(z.y)})`);
    rig.zz.setAttribute('opacity', f(Math.min(1, 2 * p.zz)));
    rig.zz.setAttribute('visibility', 'visible');
  } else {
    rig.zz.setAttribute('visibility', 'hidden');
  }

  const height = highestPoint(p);
  rig.hit.setAttribute('y', f(-height));
  rig.hit.setAttribute('height', f(height));
  rig.root.setAttribute('transform', `translate(${f(x)} ${f(groundY)})`);
  rig.flip.setAttribute(
    'transform',
    `scale(${f(p.face)} 1) rotate(${f(p.rot)} 0 ${f(centre.y)})`,
  );
  rig.head = pt(x + p.face * head.x, groundY + head.y);
};

export interface PropRig {
  node: SVGGElement;
  draw: (state: PropState, now: number) => void;
  remove: () => void;
}

/* Props share the cat classes, so they follow the theme too. */
/* `front` is drawn over the cat: a box's front panel hides the cat sitting in it. */
export const createProp = (
  parent: SVGGElement,
  front: SVGGElement,
  kind: PropKind,
): PropRig => {
  /* The yarn ball is held in the paws, so it draws over the cat. */
  const node = el('g', { class: 'cat-prop' }, kind === 'yarn' ? front : parent);
  const cover = kind === 'box' ? el('g', { class: 'cat-prop' }, front) : null;
  const remove = (): void => {
    node.remove();
    cover?.remove();
  };
  const edge = {
    class: 'cat-prop-solid',
    'stroke-width': 1.8,
    'stroke-linejoin': 'round',
  };
  if (kind === 'toy') {
    const line = el(
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
    el(
      'circle',
      { r: 4.2, ...edge, class: 'cat-prop-solid cat-prop-toy' },
      pom,
    );
    return {
      node,
      remove,
      draw: (s) => {
        const px = s.x + (s.y - STRING_TOP) * Math.sin(s.r * D);
        const py = STRING_TOP + (s.y - STRING_TOP) * Math.cos(s.r * D);
        line.setAttribute('d', `M${f(s.x)} ${STRING_TOP}L${f(px)} ${f(py)}`);
        pom.setAttribute('transform', `translate(${f(px)} ${f(py)})`);
        node.setAttribute('opacity', f(s.o));
      },
    };
  }
  if (kind === 'fly') {
    const wings = [
      el(
        'ellipse',
        { cx: -2.2, cy: -2.5, rx: 3, ry: 1.4, class: 'cat-prop-wing' },
        node,
      ),
      el(
        'ellipse',
        { cx: 2.2, cy: -2.5, rx: 3, ry: 1.4, class: 'cat-prop-wing' },
        node,
      ),
    ];
    el('ellipse', { rx: 2.2, ry: 1.6, class: 'cat-prop-body' }, node);
    return {
      node,
      remove,
      draw: (s, now) => {
        node.setAttribute('transform', `translate(${f(s.x)} ${f(s.y)})`);
        node.setAttribute('opacity', f(s.o));
        wings.forEach((w, i) =>
          w.setAttribute(
            'ry',
            f(0.4 + 1.3 * Math.abs(Math.sin(now / WING_BEAT_MS + i))),
          ),
        );
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
    el(
      'path',
      {
        d: 'M-5.5 -12h11l-1 12h-9z',
        ...edge,
        class: 'cat-prop-solid cat-prop-cup',
      },
      node,
    );
  } else if (kind === 'post') {
    el(
      'rect',
      {
        x: -5,
        y: -POST_HEIGHT,
        width: 10,
        height: POST_HEIGHT,
        ...edge,
        class: 'cat-prop-solid cat-prop-card',
      },
      node,
    );
    el(
      'path',
      {
        d: 'M-5 -86l10 3M-5 -78l10 3M-5 -70l10 3M-5 -62l10 3M-5 -54l10 3M-5 -46l10 3M-5 -38l10 3M-5 -30l10 3M-5 -22l10 3M-5 -14l10 3',
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
        ...edge,
        class: 'cat-prop-solid cat-prop-card',
      },
      node,
    );
  } else if (kind === 'blanket') {
    /* A soft, rumpled blanket with a folded corner and two stripes: wide and low, not a toy. */
    el(
      'path',
      {
        d: 'M-40 0C-41 -5 -36 -9 -28 -8C-18 -11 -8 -7 2 -9C12 -11 22 -7 30 -9C36 -10 40 -5 38 0Z',
        ...edge,
        class: 'cat-prop-solid cat-prop-blanket',
      },
      node,
    );
    el(
      'path',
      {
        d: 'M-30 -4C-18 -6 -6 -3 6 -5C16 -7 26 -4 34 -5M-34 -1C-20 -3 -4 0 10 -2C20 -3 28 -1 36 -2',
        class: 'cat-prop-stripe',
        'stroke-width': 1.6,
        'stroke-linecap': 'round',
      },
      node,
    );
    el(
      'path',
      {
        d: 'M30 -9L38 0L28 -2Z',
        ...edge,
        class: 'cat-prop-solid cat-prop-fold',
      },
      node,
    );
  } else if (kind === 'box') {
    el(
      'path',
      {
        d: `M${-BOX_HALF} ${-BOX_HEIGHT}l-7 -7M${BOX_HALF} ${-BOX_HEIGHT}l7 -7`,
        class: 'cat-prop-string',
        'stroke-width': 3,
        'stroke-linecap': 'round',
      },
      node,
    );
    el(
      'rect',
      {
        x: -BOX_HALF,
        y: -BOX_HEIGHT,
        width: 2 * BOX_HALF,
        height: BOX_HEIGHT,
        ...edge,
        class: 'cat-prop-solid cat-prop-card',
      },
      cover ?? node,
    );
  } else {
    el(
      'path',
      { d: 'M4 4q9 5 16 3', class: 'cat-prop-yarn-end', 'stroke-width': 1.5 },
      node,
    );
    el('circle', { r: 6, ...edge, class: 'cat-prop-solid cat-prop-toy' }, node);
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
      for (const layer of cover ? [node, cover] : [node]) {
        layer.setAttribute(
          'transform',
          `translate(${f(s.x)} ${f(s.y)}) rotate(${f(s.r)})`,
        );
        layer.setAttribute('opacity', f(s.o));
      }
    },
  };
};
