/**
 * The box cat: an open cardboard box drawn as a flat block (ink edge, hard
 * throw) with its flaps up, and a cat sitting in it, for
 * scripts/make-box-cat.mjs. Units are px of each file.
 */

/** A color token name without `--color-`, turned into paint by the caller. */
export type Paint = (token: string) => string;

export interface BoxFront {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  /** The pink throw's offset; 0 where the page draws the throw itself. */
  readonly throwBy: number;
  readonly edge: number;
}

/** How far each flap leans out past the box's side, as a share of its width. */
const FLAP_LEAN = 0.08;
/** Flap height as a share of the front's height. */
const FLAP_RISE = 0.5;
/** Each flap covers this share of the front's width. */
const FLAP_SPAN = 0.4;
/** The tape strip across the front: its width and height as shares of the front. */
const TAPE = { w: 0.3, h: 0.08, y: 0.4 } as const;

/** The two flaps, behind the cat: drawn before it. */
export const boxFlaps = (paint: Paint, b: BoxFront): string => {
  const lean = b.w * FLAP_LEAN;
  const rise = b.h * FLAP_RISE;
  const span = b.w * FLAP_SPAN;
  const left = `${b.x},${b.y} ${b.x - lean},${b.y - rise} ${b.x + span - lean},${b.y - rise} ${b.x + span},${b.y}`;
  const right = `${b.x + b.w},${b.y} ${b.x + b.w + lean},${b.y - rise} ${b.x + b.w - span + lean},${b.y - rise} ${b.x + b.w - span},${b.y}`;
  const flap = (points: string): string =>
    `<polygon points="${points}" fill="${paint('cat-cardboard')}" stroke="${paint('gold-text')}" stroke-width="${b.edge}" stroke-linejoin="round"/>`;
  return flap(left) + flap(right);
};

/** The front, over the cat's lower half: throw, block, tape. */
export const boxFront = (paint: Paint, b: BoxFront): string => {
  const inset = b.edge / 2;
  const throwRect = b.throwBy
    ? `<rect x="${b.x + b.throwBy}" y="${b.y + b.throwBy}" width="${b.w}" height="${b.h}" fill="${paint('mark')}"/>`
    : '';
  return (
    throwRect +
    `<rect x="${b.x + inset}" y="${b.y + inset}" width="${b.w - b.edge}" height="${b.h - b.edge}" fill="${paint('cat-cardboard')}" stroke="${paint('gold-text')}" stroke-width="${b.edge}"/>` +
    `<rect x="${b.x + b.w * (0.5 - TAPE.w / 2)}" y="${b.y + b.h * TAPE.y}" width="${b.w * TAPE.w}" height="${Math.max(b.edge, b.h * TAPE.h)}" fill="${paint('gold-text')}"/>`
  );
};
