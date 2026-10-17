/*
 * Step Up classes for a `.card-block` (docs/STYLEGUIDE.md, Blocks). The throw
 * falls down and right, so a wall only climbs to the right: one row rises
 * brick by brick, and stacked rows step their right edge in, at most twice.
 */

export type Breakpoint = 'base' | 'sm' | 'lg';

/** Brick indices per row; a brick spanning rows is listed in each. */
export type Rows = readonly (readonly number[])[];

export type WallLayout = Partial<Record<Breakpoint, Rows>>;

const BREAKPOINTS: readonly Breakpoint[] = ['base', 'sm', 'lg'];
const MAX_STEP = 2;

/* Written out in full: Tailwind finds classes by scanning source text. */
const STEP_CLASSES: Record<Breakpoint, readonly string[]> = {
  base: ['', 'card-step-1', 'card-step-2'],
  sm: ['sm:card-step-0', 'sm:card-step-1', 'sm:card-step-2'],
  lg: ['lg:card-step-0', 'lg:card-step-1', 'lg:card-step-2'],
};
const RISE_CLASSES: Record<Breakpoint, readonly string[]> = {
  base: ['', 'card-rise-half', 'card-rise-full'],
  sm: ['sm:card-rise-0', 'sm:card-rise-half', 'sm:card-rise-full'],
  lg: ['lg:card-rise-0', 'lg:card-rise-half', 'lg:card-rise-full'],
};
const ROOM_CLASSES: Record<Breakpoint, readonly [string, string]> = {
  base: ['', 'card-rise-room'],
  sm: ['sm:card-rise-room-0', 'sm:card-rise-room'],
  lg: ['lg:card-rise-room-0', 'lg:card-rise-room'],
};

const NONE = 0;
const HALF = 1;
const FULL = 2;

/** Rows for bricks of the given spans packed into `columns` tracks. */
export const packRows = (spans: readonly number[], columns: number): Rows => {
  const rows: number[][] = [];
  let used = columns;
  spans.forEach((span, index) => {
    const width = Math.min(span, columns);
    if (used + width > columns) {
      rows.push([]);
      used = 0;
    }
    rows[rows.length - 1].push(index);
    used += width;
  });
  return rows;
};

export const stackRows = (count: number): Rows =>
  Array.from({ length: count }, (_, index) => [index]);

/** Per brick: how far it rises (none, half, full) and how many steps its right edge comes in. */
export const wallSteps = (
  rows: Rows,
  count: number,
): { rise: number[]; step: number[] } => {
  const rise = Array<number>(count).fill(NONE);
  const step = Array<number>(count).fill(0);
  if (rows.length === 1 && count > 1) {
    rows[0].forEach((brick, position) => {
      if (position === 0) return;
      rise[brick] = position === 1 && rows[0].length > 2 ? HALF : FULL;
    });
    return { rise, step };
  }
  rows.forEach((row, index) => {
    const last = row[row.length - 1];
    step[last] = Math.max(step[last], Math.min(index, MAX_STEP));
  });
  return { rise, step };
};

/** Classes for the wall and each brick, written only where a breakpoint changes them. */
export const wallClasses = (
  layout: WallLayout,
  count: number,
): { wall: string; bricks: string[] } => {
  const wall: string[] = [];
  const bricks = Array.from({ length: count }, () => [] as string[]);
  let previous = {
    rise: Array<number>(count).fill(NONE),
    step: Array<number>(count).fill(0),
    room: false,
  };
  for (const breakpoint of BREAKPOINTS) {
    const rows =
      layout[breakpoint] ??
      (breakpoint === 'base' ? stackRows(count) : undefined);
    if (!rows) continue;
    const { rise, step } = wallSteps(rows, count);
    const room = rise.some((value) => value !== NONE);
    if (room !== previous.room)
      wall.push(ROOM_CLASSES[breakpoint][room ? 1 : 0]);
    for (let brick = 0; brick < count; brick += 1) {
      if (rise[brick] !== previous.rise[brick])
        bricks[brick].push(RISE_CLASSES[breakpoint][rise[brick]]);
      if (step[brick] !== previous.step[brick])
        bricks[brick].push(STEP_CLASSES[breakpoint][step[brick]]);
    }
    previous = { rise, step, room };
  }
  return {
    wall: wall.filter(Boolean).join(' '),
    bricks: bricks.map((list) => list.filter(Boolean).join(' ')),
  };
};
