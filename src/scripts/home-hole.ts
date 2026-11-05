/*
 * The hole, cut away: a brick shaft drops from the mouth through the
 * ledge and on below the hero, with uneven, chipped and missing bricks, bites
 * torn out of the ledge beside it, and the ground's bricks fading out around
 * its foot. The wall toward the first heading ends above the floor, so the
 * cat can hop out (home-faller.ts). Drawn once per size; no motion.
 */
import { seeded } from '../lib/seeded';

const SVG = 'http://www.w3.org/2000/svg';
/* Drawing sizes in px: wall thickness, course height, ground brick length, and how far the shaft runs below the hero. */
const PHONE = {
  wall: 14,
  course: 12,
  brick: 44,
  below: 110,
  groundBricks: 2,
  groundScale: 0.7,
  biteKink: 4,
  pebble: 3,
};
const WIDE = {
  wall: 24,
  course: 18,
  brick: 76,
  below: 170,
  groundBricks: 3,
  groundScale: 1,
  biteKink: 7,
  pebble: 5,
};
/* The ground's courses are this much taller than the shaft's. */
const GROUND_COURSE = 1.6;
/* Mortar and pebble lines, px. */
const LINE_PX = 1.4;
/* Shades as the share of light over ink: the shaded left wall, a bite, a pebble, the ground's top course and each course below it. */
const SHADE = { wall: 84, bite: 30, pebble: 58, ground: 92, groundStep: 6 };
/* A chipped corner takes this share of the brick's short side, plus up to the spread. */
const CHIP_SIZE = 0.25;
const CHIP_SPREAD = 0.35;
/* Brick edges as shares of the site's block edge: shaft bricks, ground bricks. */
const BRICK_LINE = 0.75;
const GROUND_LINE = 0.6;
/* A jagged line's kinks wander this share of a step along it. */
const KINK_SPREAD = 0.4;
/* Back wall joints, as shares of a ground brick: where the first sits (odd rows shift half), and the gap to the next. */
const JOINT = {
  start: 0.6,
  stagger: 0.5,
  jitter: 0.3,
  gap: 0.45,
  gapSpread: 0.3,
  lean: 2,
};
/* The back wall's bed joints: kinks per course, and their wander as a share of JAG in px. */
const BED_KINKS = 5;
const BED_WANDER = 1.6;
/* Gradient stops [offset, ink opacity]: the shade cast from the left, and the dark deepening down the shaft. */
const SHADE_STOPS = [
  [0, 0.55],
  [0.45, 0],
] as const;
const DEEP_STOPS = [
  [0.1, 0.1],
  [0.55, 0.85],
  [1, 1],
] as const;
/* Fades [from, opacity, to, opacity]: the walls toward the shaft's foot, the ground downward. */
const WALL_FADE = [0.6, 1, 0.97, 0] as const;
const GROUND_FADE = [0.1, 1, 1, 0] as const;
/* A wall brick keeps at least this share of the wall, and leans this way when it wanders. */
const WALL_MIN = 0.5;
const WALL_BIAS = 0.4;
/* A ground brick's length: this share of a brick, plus up to the spread. */
const GROUND_BRICK = { min: 0.55, spread: 0.5 };
/* A bite's reach varies by this much either side, overlaps the wall by OVERLAP_PX, and its edge has this many kinks. */
const BITE_SPREAD = { min: 0.7, spread: 0.6 };
const OVERLAP_PX = 2;
const BITE_KINKS = 6;
/* Where a pebble sits in its bite: shares of the reach across and the depth down. */
const PEBBLE_AT = { x: 0.15, xSpread: 0.6, y: 0.3, ySpread: 0.5 };
/* A pebble's outline, as multiples of its size. */
const PEBBLE_SHAPE = [
  [-1, 0],
  [-0.2, -0.8],
  [1, -0.2],
  [0.4, 0.7],
] as const;
/* A mask spans this many band widths, from one band width left, so nothing it covers is cut at its sides. */
const MASK_SPAN = 3;
/* Room kept above the ledge for the bites' edges. */
const LIP_PAD_PX = 4;
const PHONE_LEDGE_PX = 30;
/* Share of a wall's thickness its inner face wanders, and the odds a corner is chipped or a course missing. */
const JAG = 0.45;
const CHIP = 0.5;
const GONE = 0.12;
/* How much of a ground brick's length and the ledge's height a torn bite takes. */
const BITE_REACH = 0.62;
const BITE_DEPTH = 0.62;
const PEBBLES = 4;
/* The back wall's top course is this share light, each course lower this much darker. */
const BACK_LIGHT = 50;
const BACK_STEP = 6;
/* Head room the cat needs above its floor before the exit-side wall may resume. */
const EXIT_ROOM = { phone: 80, wide: 96 };
const SEED = 6571;

type Point = readonly [number, number];

const svg = <K extends keyof SVGElementTagNameMap>(
  name: K,
  attributes: Record<string, string | number>,
  style: Record<string, string> = {},
  children: SVGElement[] = [],
): SVGElementTagNameMap[K] => {
  const element = document.createElementNS(SVG, name);
  for (const [key, value] of Object.entries(attributes))
    element.setAttribute(key, String(value));
  for (const [key, value] of Object.entries(style))
    element.style.setProperty(key, value);
  element.append(...children);
  return element;
};

const points = (list: readonly Point[]): string =>
  list.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');

export const createHole = ({
  band,
  mouth,
}: {
  band: HTMLElement;
  mouth: HTMLElement;
}): void => {
  const hero = band.offsetParent;
  if (!(hero instanceof HTMLElement)) return;
  const ink = 'var(--color-block-ink)';
  const light = 'var(--color-block-light)';
  const mix = (share: number): string =>
    `color-mix(in srgb, ${light} ${Math.max(0, Math.min(100, share)).toFixed(0)}%, ${ink})`;
  const edge = parseFloat(
    getComputedStyle(band).getPropertyValue('--block-edge'),
  );
  if (!edge) throw new Error('home-hole: --block-edge is not set.');
  let layers: Element[] = [];
  let drawnFor = '';

  const draw = (): void => {
    layers.forEach((layer) => layer.remove());
    layers = [];
    const random = seeded(SEED);
    const b = band.getBoundingClientRect();
    const m = mouth.getBoundingClientRect();
    const bandWidth = b.width;
    const bandHeight = b.height;
    const ledge =
      parseFloat(getComputedStyle(band).getPropertyValue('--ledge-h')) || 0;
    const phone = ledge < PHONE_LEDGE_PX;
    const size = phone ? PHONE : WIDE;
    const ground = bandHeight - ledge;
    const heroEdge = parseFloat(getComputedStyle(hero).borderBottomWidth) || 0;
    const bottom = bandHeight + heroEdge + size.below;
    const xL = m.left - b.left;
    const xR = m.right - b.left;
    const t = size.wall;
    const ch = size.course;
    const first = document
      .querySelector('.home-fall > .band h2')
      ?.getBoundingClientRect();
    const center = (xL + xR) / 2;
    const exitSide = first ? (first.right - b.left < center ? -1 : 1) : 0;
    const openFrom = first
      ? first.top - b.top - (phone ? EXIT_ROOM.phone : EXIT_ROOM.wide)
      : Number.POSITIVE_INFINITY;

    const chip = (w: number, h: number): number =>
      random() < CHIP
        ? Math.min(w, h) * (CHIP_SIZE + random() * CHIP_SPREAD)
        : 0;
    const brick = (
      x: number,
      y: number,
      w: number,
      h: number,
      fill: string,
      line = edge * BRICK_LINE,
    ): SVGPolygonElement => {
      const [a, c, d, e] = [chip(w, h), chip(w, h), chip(w, h), chip(w, h)];
      return svg(
        'polygon',
        {
          points: points([
            [x + a, y],
            [x + w - c, y],
            [x + w, y + c],
            [x + w, y + h - d],
            [x + w - d, y + h],
            [x + e, y + h],
            [x, y + h - e],
            [x, y + a],
          ]),
        },
        {
          fill,
          stroke: ink,
          'stroke-width': `${line}px`,
          'stroke-linejoin': 'round',
        },
      );
    };
    const jagged = (
      from: Point,
      to: Point,
      kinks: number,
      amp: number,
    ): Point[] => {
      const [x0, y0] = from;
      const [dx, dy] = [to[0] - x0, to[1] - y0];
      const length = Math.hypot(dx, dy) || 1;
      const out: Point[] = [from];
      for (let i = 1; i < kinks; i += 1) {
        const s = i / kinks + ((random() - 0.5) * KINK_SPREAD) / kinks;
        const o = (random() - 0.5) * 2 * amp;
        out.push([
          x0 + dx * s - (dy / length) * o,
          y0 + dy * s + (dx / length) * o,
        ]);
      }
      out.push(to);
      return out;
    };
    const stop = (
      offset: number,
      opacity: number,
      color = ink,
    ): SVGStopElement =>
      svg(
        'stop',
        { offset },
        { 'stop-color': color, 'stop-opacity': String(opacity) },
      );
    const id = (name: string): string => `home-hole-${name}`;
    const fade = (
      name: string,
      top: number,
      stops: readonly [number, number, number, number],
    ): SVGElement[] => [
      svg(
        'linearGradient',
        {
          id: id(`${name}-ramp`),
          gradientUnits: 'userSpaceOnUse',
          x1: 0,
          y1: top,
          x2: 0,
          y2: bottom,
        },
        {},
        [stop(stops[0], stops[1]), stop(stops[2], stops[3])],
      ),
      svg(
        'mask',
        {
          id: id(name),
          maskUnits: 'userSpaceOnUse',
          x: -bandWidth,
          y: top,
          width: bandWidth * MASK_SPAN,
          height: bottom - top,
        },
        { 'mask-type': 'alpha' },
        [
          svg('rect', {
            x: -bandWidth,
            y: top,
            width: bandWidth * MASK_SPAN,
            height: bottom - top,
            fill: `url(#${id(`${name}-ramp`)})`,
          }),
        ],
      ),
    ];

    /* Back wall: courses lit at the top and darkening down, joints that wander, the left side in the lip's shadow. */
    const back: SVGElement[] = [
      svg(
        'rect',
        {
          x: xL - t,
          y: ground,
          width: xR - xL + 2 * t,
          height: bottom - ground,
        },
        { fill: ink },
      ),
    ];
    for (let y = ground, r = 0; y < bottom; y += ch, r += 1) {
      const share = BACK_LIGHT - r * BACK_STEP;
      if (share <= 0) break;
      back.push(
        svg(
          'rect',
          { x: xL, y, width: xR - xL, height: ch },
          { fill: mix(share) },
        ),
      );
      for (
        let x =
          xL +
          ((r % 2) * JOINT.stagger + random() * JOINT.jitter) *
            size.brick *
            JOINT.start;
        x < xR;
        x += size.brick * (JOINT.gap + random() * JOINT.gapSpread)
      ) {
        back.push(
          svg(
            'line',
            { x1: x, y1: y, x2: x + (random() - 0.5) * JOINT.lean, y2: y + ch },
            { stroke: ink, 'stroke-width': `${LINE_PX}px` },
          ),
        );
      }
      back.push(
        svg(
          'polyline',
          {
            points: points(
              jagged([xL, y + ch], [xR, y + ch], BED_KINKS, JAG * BED_WANDER),
            ),
          },
          { fill: 'none', stroke: ink, 'stroke-width': `${LINE_PX}px` },
        ),
      );
    }
    const shade = svg(
      'linearGradient',
      {
        id: id('shade'),
        gradientUnits: 'userSpaceOnUse',
        x1: xL,
        y1: 0,
        x2: xR,
        y2: 0,
      },
      {},
      SHADE_STOPS.map(([offset, opacity]) => stop(offset, opacity)),
    );
    const deep = svg(
      'linearGradient',
      {
        id: id('deep'),
        gradientUnits: 'userSpaceOnUse',
        x1: 0,
        y1: ground,
        x2: 0,
        y2: bottom,
      },
      {},
      DEEP_STOPS.map(([offset, opacity]) => stop(offset, opacity)),
    );
    back.push(
      svg('rect', {
        x: xL,
        y: ground,
        width: xR - xL,
        height: bottom - ground,
        fill: `url(#${id('shade')})`,
      }),
      svg('rect', {
        x: xL,
        y: ground,
        width: xR - xL,
        height: bottom - ground,
        fill: `url(#${id('deep')})`,
      }),
    );

    /* Side walls in section: one brick per course, inner faces uneven, some chipped or gone. */
    const walls: SVGElement[] = [];
    for (let y = ground, r = 0; y < bottom; y += ch, r += 1) {
      for (const side of [-1, 1] as const) {
        if (side === exitSide && y + ch > openFrom) continue;
        if (r > 1 && random() < GONE) continue;
        const w = Math.max(t * WALL_MIN, t + JAG * t * (random() - WALL_BIAS));
        const x = side > 0 ? xR + t - w : xL - t;
        walls.push(brick(x, y, w, ch, side > 0 ? light : mix(SHADE.wall)));
      }
    }

    /* The ground under the hero, cut open beside the shaft: the site's bricks fading down and out. */
    const groundBricks: SVGElement[] = [];
    const top = bandHeight + heroEdge;
    for (let y = top, r = 0; y < bottom; y += ch * GROUND_COURSE, r += 1) {
      for (const side of [-1, 1] as const) {
        if (side === exitSide && y + ch * GROUND_COURSE > openFrom) continue;
        let x = side < 0 ? xL - t : xR + t;
        for (let n = 0; n < size.groundBricks; n += 1) {
          const w =
            size.brick *
            (GROUND_BRICK.min + random() * GROUND_BRICK.spread) *
            size.groundScale;
          groundBricks.push(
            brick(
              side < 0 ? x - w : x,
              y,
              w,
              ch * GROUND_COURSE,
              mix(SHADE.ground - r * SHADE.groundStep),
              edge * GROUND_LINE,
            ),
          );
          x += side * w;
        }
      }
    }

    const shaft = svg(
      'svg',
      {
        'aria-hidden': 'true',
        class: 'home-hole',
        viewBox: `0 ${ground} ${bandWidth} ${bottom - ground}`,
        width: bandWidth,
        height: bottom - ground,
      },
      { left: `${band.offsetLeft}px`, top: `${band.offsetTop + ground}px` },
      [
        svg('defs', {}, {}, [
          shade,
          deep,
          ...fade('walls', ground, WALL_FADE),
          ...fade('ground', top, GROUND_FADE),
        ]),
        svg('g', { mask: `url(#${id('ground')})` }, {}, groundBricks),
        ...back,
        svg('g', { mask: `url(#${id('walls')})` }, {}, walls),
      ],
    );

    /* Over the ledge: bites torn out of the bricks beside the shaft, with pebbles in them. */
    const lip: SVGElement[] = [];
    for (const side of [-1, 1] as const) {
      const x0 = side < 0 ? xL - t : xR + t;
      const reach =
        size.brick *
        BITE_REACH *
        (BITE_SPREAD.min + random() * BITE_SPREAD.spread);
      const depth = ledge * BITE_DEPTH;
      const xo = x0 + side * reach;
      const cut: Point[] = [
        [x0 - side * OVERLAP_PX, ground - OVERLAP_PX / 2],
        [xo, ground - OVERLAP_PX / 2],
        ...jagged(
          [xo, ground - OVERLAP_PX / 2],
          [x0 - side * OVERLAP_PX, ground + depth],
          BITE_KINKS,
          size.biteKink,
        ).slice(0, -1),
        [x0 - side * OVERLAP_PX, ground + depth],
      ];
      lip.push(
        svg(
          'polygon',
          { points: points(cut) },
          {
            fill: mix(SHADE.bite),
            stroke: ink,
            'stroke-width': `${edge * BRICK_LINE}px`,
            'stroke-linejoin': 'round',
          },
        ),
      );
      for (let k = 0; k < PEBBLES; k += 1) {
        const px =
          x0 + side * reach * (PEBBLE_AT.x + random() * PEBBLE_AT.xSpread);
        const py =
          ground + depth * (PEBBLE_AT.y + random() * PEBBLE_AT.ySpread);
        const s = size.pebble;
        lip.push(
          svg(
            'polygon',
            {
              points: points(
                PEBBLE_SHAPE.map(([dx, dy]) => [px + dx * s, py + dy * s]),
              ),
            },
            {
              fill: mix(SHADE.pebble),
              stroke: ink,
              'stroke-width': `${LINE_PX}px`,
            },
          ),
        );
      }
    }
    const lipLayer = svg(
      'svg',
      {
        'aria-hidden': 'true',
        class: 'home-hole-lip',
        viewBox: `0 ${ground - LIP_PAD_PX} ${bandWidth} ${ledge + LIP_PAD_PX}`,
        width: bandWidth,
        height: ledge + LIP_PAD_PX,
      },
      { top: `${ground - LIP_PAD_PX}px` },
      lip,
    );

    hero.append(shaft);
    band.append(lipLayer);
    layers = [shaft, lipLayer];
  };

  band.dataset.hole = '';
  /* The band keeps its size when the hero grows (text size, fonts), so the hero is watched too, and where the band sits. */
  const observer = new ResizeObserver(() => {
    const at = `${band.offsetWidth} ${band.offsetTop}`;
    if (drawnFor === at) return;
    drawnFor = at;
    draw();
  });
  observer.observe(band);
  observer.observe(hero);
};
