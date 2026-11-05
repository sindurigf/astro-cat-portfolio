/*
 * The meadow: thin die-cut grasses and small dark buds from one art atlas, in
 * three rows. The two back rows are soft grey silhouettes drawn once; the front
 * row leans in one travelling wind wave and bends away from the cat. It has
 * no frame loop of its own: home-motion.ts calls draw(), so the pause and
 * reduced motion hold it.
 */
import { seeded } from '../lib/seeded';

/* Each drawing's place in the atlas: [x, width] in atlas px; every one is ATLAS_HEIGHT tall. */
const ART = {
  c2: [0, 63],
  c6: [65, 33],
  c9: [100, 52],
  g0: [154, 40],
  g1: [196, 38],
  g3: [236, 47],
  g4: [285, 36],
  g6: [323, 40],
  g7: [365, 23],
  g9: [390, 34],
  g11: [426, 46],
  b0: [474, 56],
  b2: [532, 47],
  b4: [581, 48],
  b6: [631, 48],
} as const satisfies Record<string, readonly [number, number]>;
type Art = keyof typeof ART;
const ATLAS_HEIGHT = 320;

const SOFT: readonly Art[] = [
  'g0',
  'g1',
  'g3',
  'g4',
  'g6',
  'g7',
  'g9',
  'g11',
  'b0',
  'b2',
  'b4',
  'b6',
];
const BUDS: readonly Art[] = ['c2', 'c6', 'c9'];
const GRASS: readonly Art[] = [
  'c9',
  'c9',
  'g0',
  'g1',
  'g3',
  'g4',
  'g6',
  'g9',
  'g11',
];

interface Row {
  /** Mean px between stems; phones space them by PHONE_GAP. */
  readonly gap: number;
  /** Stem height as a share of the ground's height above the band's top. */
  readonly height: readonly [number, number];
  /** Back rows only: share of the way from ink to light, painted opaque so the gold never mixes in. */
  readonly tone?: number;
  readonly plain: readonly Art[];
  /** Odds a stem carries a bud on a long ink stem instead of a whole drawing. */
  readonly bud: number;
}

const ROWS: readonly Row[] = [
  { gap: 14, height: [0.3, 0.44], tone: 0.5, plain: SOFT, bud: 0 },
  { gap: 22, height: [0.44, 0.62], tone: 0.3, plain: SOFT, bud: 0 },
  { gap: 30, height: [0.78, 1.04], plain: GRASS, bud: 0.35 },
];
const PHONE_WIDTH = 600;
const PHONE_GAP = 0.75;
/* Each gap varies by this much either way. */
const GAP_JITTER = 0.35;
/* A bud's drawing shrinks to this share of the stem; an ink stem runs from the ground to it. */
const BUD_SHARE = [0.4, 0.5] as const;
const BUD_BOW_PX = 6;
const SOFT_BLUR_PX = 2.2;
/* Radians: the meadow's lean, the wave's swing, and the push beside the cat. */
const LEAN = 0.06;
const SWAY = 0.07;
const PUSH = 0.3;
const WAVE_PERIOD_S = 4.4;
const WAVE_LENGTH_PX = 760;
const REACH_PX = 90;
/* Each stem's phase differs by up to this many radians. */
const JITTER = 0.5;
const HOLE_CLEAR_PX = 8;
/* A stem this close to the hole's edge is left out of the front row. */
const STEM_CLEAR_PX = 16;
const SEED = 5171;
/* Half the stems face the other way. */
const FLIP_ODDS = 0.5;
const FULL_TURN = Math.PI * 2;

interface Stem {
  readonly art: Art;
  readonly x: number;
  readonly height: number;
  /** 1 for a whole drawing; less for a bud on a long ink stem. */
  readonly head: number;
  readonly bow: number;
  readonly flip: boolean;
  readonly jitter: number;
}

/* One drawing, ready to stamp: both facings, and where its stem meets the ground and how wide it is. */
interface Cut {
  readonly image: HTMLCanvasElement;
  readonly flipped: HTMLCanvasElement;
  readonly root: number;
  readonly stemWidth: number;
}

export interface Meadow {
  /**
   * Draws at `seconds` of meadow time; `still` draws the stems at rest with no
   * wave or bend. `catX` is the cat's centre in band px, or -Infinity once it is gone.
   */
  draw: (seconds: number, still: boolean, catX: number) => void;
}

interface MeadowParts {
  readonly band: HTMLElement;
  readonly haze: HTMLCanvasElement;
  readonly back: HTMLCanvasElement;
  readonly mouth: HTMLElement;
}

const contextOf = (canvas: HTMLCanvasElement): CanvasRenderingContext2D => {
  const context = canvas.getContext('2d');
  if (!context) throw new Error('home-meadow: no 2D context.');
  return context;
};

const token = (element: Element, name: string): string => {
  const value = getComputedStyle(element).getPropertyValue(name).trim();
  if (!value) throw new Error(`home-meadow: ${name} is not set.`);
  return value;
};

const loadImage = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(new Error(`home-meadow: ${src} did not load.`));
    image.src = src;
  });

const blankCanvas = (
  width: number,
  height: number,
): [HTMLCanvasElement, CanvasRenderingContext2D] => {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return [canvas, contextOf(canvas)];
};

/* The drawing's bottom row: where its stem stands and how wide it is. */
const rootOf = (canvas: HTMLCanvasElement): Pick<Cut, 'root' | 'stemWidth'> => {
  const { data, width, height } = contextOf(canvas).getImageData(
    0,
    0,
    canvas.width,
    canvas.height,
  );
  const SOLID = 160;
  const MAX_STEM_PX = 4;
  for (let y = height - 1; y >= 0; y -= 1) {
    let sum = 0;
    let count = 0;
    for (let x = 0; x < width; x += 1) {
      if ((data[(y * width + x) * 4 + 3] ?? 0) <= SOLID) continue;
      sum += x;
      count += 1;
    }
    if (count > 0)
      return { root: sum / count, stemWidth: Math.min(count, MAX_STEM_PX) };
  }
  return { root: width / 2, stemWidth: 1 };
};

const cutArt = (
  atlas: HTMLImageElement,
  art: Art,
  paint?: (context: CanvasRenderingContext2D, w: number, h: number) => void,
): Cut => {
  const [left, width] = ART[art];
  const pad = paint ? Math.ceil(SOFT_BLUR_PX * 3) : 0;
  const make = (flip: boolean): HTMLCanvasElement => {
    const [canvas, context] = blankCanvas(
      width + pad * 2,
      ATLAS_HEIGHT + pad * 2,
    );
    if (paint) context.filter = `blur(${SOFT_BLUR_PX}px)`;
    if (flip) {
      context.translate(canvas.width, 0);
      context.scale(-1, 1);
    }
    context.drawImage(
      atlas,
      left,
      0,
      width,
      ATLAS_HEIGHT,
      pad,
      pad,
      width,
      ATLAS_HEIGHT,
    );
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.filter = 'none';
    paint?.(context, canvas.width, canvas.height);
    return canvas;
  };
  const image = make(false);
  return { image, flipped: make(true), ...rootOf(image) };
};

export const createMeadow = ({
  band,
  haze,
  back,
  mouth,
}: MeadowParts): Meadow => {
  const far = contextOf(haze);
  const near = contextOf(back);
  const ink = token(band, '--color-block-ink');
  const light = token(band, '--color-block-light');
  const src = band.dataset.homeArt;
  let crisp: Map<Art, Cut> | undefined;
  const soft = new Map<number, Map<Art, Cut>>();
  let rows: { row: Row; stems: Stem[] }[] = [];
  let width = 0;
  let height = 0;
  let ground = 0;
  let last: [number, boolean, number] = [0, true, Number.NEGATIVE_INFINITY];

  /* Ink with `share` of light over it, painted opaque on the drawing's own shape. */
  const toned =
    (share: number) =>
    (context: CanvasRenderingContext2D, w: number, h: number): void => {
      context.globalCompositeOperation = 'source-in';
      context.fillStyle = ink;
      context.fillRect(0, 0, w, h);
      context.globalCompositeOperation = 'source-atop';
      context.globalAlpha = share;
      context.fillStyle = light;
      context.fillRect(0, 0, w, h);
      context.globalAlpha = 1;
      context.globalCompositeOperation = 'source-over';
    };

  const plant = (): void => {
    const box = band.getBoundingClientRect();
    const scale = window.devicePixelRatio || 1;
    width = box.width;
    height = box.height;
    const style = getComputedStyle(band);
    const ledge = parseFloat(style.getPropertyValue('--ledge-h')) || 0;
    const post = parseFloat(style.getPropertyValue('--post-w')) || 0;
    ground = height - ledge;
    for (const [canvas, context] of [
      [haze, far],
      [back, near],
    ] as const) {
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      context.setTransform(scale, 0, 0, scale, 0, 0);
    }
    const opening = mouth.getBoundingClientRect();
    const hole = [
      opening.left - box.left - post - HOLE_CLEAR_PX,
      opening.right - box.left + post + HOLE_CLEAR_PX,
    ] as const;
    const next = seeded(SEED);
    const pick = (list: readonly Art[]): Art =>
      list[Math.floor(next() * list.length)] ?? list[0]!;
    const spacing = width < PHONE_WIDTH ? PHONE_GAP : 1;
    rows = ROWS.map((row) => {
      const stems: Stem[] = [];
      for (
        let x = next() * row.gap;
        x < width;
        x += row.gap * spacing * (1 - GAP_JITTER + next() * GAP_JITTER * 2)
      ) {
        const tall =
          ground * (row.height[0] + next() * (row.height[1] - row.height[0]));
        /* Back rows grow on behind the open shaft; the front row stops at its edges. */
        const inHole =
          row.tone === undefined &&
          x + STEM_CLEAR_PX / 2 > hole[0] &&
          x - STEM_CLEAR_PX / 2 < hole[1];
        const bud = next() < row.bud;
        const head = bud
          ? BUD_SHARE[0] + next() * (BUD_SHARE[1] - BUD_SHARE[0])
          : 1;
        const stem: Stem = {
          art: pick(bud ? BUDS : row.plain),
          x,
          height: tall,
          head,
          bow: (next() - 0.5) * BUD_BOW_PX,
          flip: next() < FLIP_ODDS,
          jitter: (next() - 0.5) * JITTER,
        };
        if (!inHole) stems.push(stem);
      }
      return { row, stems };
    });
  };

  const angle = (
    stem: Stem,
    seconds: number,
    still: boolean,
    catX: number,
  ): number => {
    if (still) return LEAN;
    const wave = Math.sin(
      FULL_TURN * (seconds / WAVE_PERIOD_S - stem.x / WAVE_LENGTH_PX) +
        stem.jitter,
    );
    const away = stem.x - catX;
    const bend =
      Math.abs(away) > REACH_PX
        ? 0
        : PUSH * Math.sin((Math.PI * away) / REACH_PX);
    return LEAN + SWAY * wave + bend;
  };

  const stamp = (
    context: CanvasRenderingContext2D,
    cut: Cut,
    stem: Stem,
    tilt: number,
  ): void => {
    const image = stem.flip ? cut.flipped : cut.image;
    const pad = (image.width - ART[stem.art][1]) / 2;
    const k = (stem.height / ATLAS_HEIGHT) * stem.head;
    const root = stem.flip ? image.width - cut.root : cut.root;
    context.save();
    context.translate(stem.x, ground);
    context.rotate(tilt);
    if (stem.head < 1) {
      const top = stem.height - ATLAS_HEIGHT * k;
      context.strokeStyle = ink;
      context.lineWidth = Math.max(1, cut.stemWidth * k);
      context.lineCap = 'round';
      context.beginPath();
      context.moveTo(0, 0);
      context.quadraticCurveTo(stem.bow, -top / 2, 0, -top);
      context.stroke();
    }
    context.drawImage(
      image,
      -root * k,
      -stem.height - pad * k,
      image.width * k,
      image.height * k,
    );
    context.restore();
  };

  const drawSoft = (): void => {
    far.clearRect(0, 0, width, height);
    for (const { row, stems } of rows) {
      if (row.tone === undefined) continue;
      const cuts = soft.get(row.tone);
      if (!cuts) continue;
      for (const stem of stems) stamp(far, cuts.get(stem.art)!, stem, LEAN);
    }
  };

  const draw = (seconds: number, still: boolean, catX: number): void => {
    near.clearRect(0, 0, width, height);
    if (!crisp) return;
    for (const { row, stems } of rows) {
      if (row.tone !== undefined) continue;
      for (const stem of stems)
        stamp(
          near,
          crisp.get(stem.art)!,
          stem,
          angle(stem, seconds, still, catX),
        );
    }
  };

  /* Without its art the planted SVGs show again, so the meadow is never empty. */
  const fail = (error: unknown): void => {
    delete band.dataset.stemsLive;
    console.error(error);
  };
  if (!src) throw new Error('home-meadow: data-home-art is not set.');
  void loadImage(src).then((atlas) => {
    const arts = Object.keys(ART) as Art[];
    crisp = new Map(arts.map((art) => [art, cutArt(atlas, art)]));
    for (const row of ROWS) {
      if (row.tone === undefined) continue;
      soft.set(
        row.tone,
        new Map(
          row.plain.map((art) => [art, cutArt(atlas, art, toned(row.tone!))]),
        ),
      );
    }
    drawSoft();
    draw(...last);
  }, fail);

  new ResizeObserver(() => {
    plant();
    drawSoft();
    draw(...last);
  }).observe(band);
  plant();

  return {
    draw: (seconds, still, catX) => {
      last = [seconds, still, catX];
      draw(seconds, still, catX);
    },
  };
};
