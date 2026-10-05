/*
 * A ruined city as rows of ruins at falling depths, generated from a seed so it
 * is the same on every load. Buildings overlap within a row so the skyline is
 * continuous; each row stands on its own ground line or terrace.
 */
import { random } from './hero-field-scene';
import type { RuinSpec } from './hero-field-scene';

interface Row {
  readonly z: number;
  /** Building heights and widths, in the units of `RuinSpec.height`. */
  readonly height: readonly [number, number];
  readonly width: readonly [number, number];
  /** Share of buildings broken. */
  readonly broken: number;
  /** Shares of the box width the row leaves open, so the monolith stands clear. */
  readonly gap?: readonly [number, number];
  readonly lift?: number;
}

const ROWS: readonly Row[] = [
  { z: 13, height: [2.2, 4.6], width: [1.0, 2.8], broken: 0.55, lift: 0.6 },
  { z: 9, height: [1.8, 3.8], width: [1.0, 2.6], broken: 0.6, lift: 0.4 },
  {
    z: 6,
    height: [1.1, 2.6],
    width: [0.9, 2.2],
    broken: 0.7,
    gap: [0.42, 0.58],
  },
  {
    z: 4.2,
    height: [0.7, 1.8],
    width: [0.9, 2.0],
    broken: 0.8,
    gap: [0.3, 0.7],
  },
];

export const cityRuins = (seed: number): RuinSpec[] => {
  const rng = random(seed);
  const specs: RuinSpec[] = [
    { kind: 'stepped', x: 0.5, z: 16, height: 7.5, width: 7.5 },
    {
      kind: 'aqueduct',
      x: 0.68,
      z: 7.5,
      height: 3.0,
      width: 5.6,
      lift: 0.9,
      wide: true,
    },
  ];
  ROWS.forEach((row, r) => {
    let x = -0.06 + rng() * 0.04;
    let i = 0;
    while (x < 1.06) {
      const width = row.width[0] + rng() * (row.width[1] - row.width[0]);
      const height = row.height[0] + rng() * (row.height[1] - row.height[0]);
      const share = (width * 0.9) / row.z / 2.6;
      const centre = x + share / 2;
      const open = row.gap && centre > row.gap[0] && centre < row.gap[1];
      if (!open) {
        const kind = rng() < 0.12 ? 'tower' : 'house';
        specs.push({
          kind,
          x: centre,
          z: row.z,
          order: row.z + (i % 2 ? 0.02 : -0.02) + rng() * 0.01,
          height,
          width: kind === 'tower' ? width * 0.55 : width,
          broken: rng() < row.broken,
          lift: row.lift,
          wide: r === 0 && i % 3 === 2,
        });
        if (rng() < 0.18) {
          specs.push({
            kind: 'tree',
            x: centre + (rng() - 0.5) * share * 0.5,
            z: row.z,
            order: row.z - 0.05,
            height: height * 0.55,
            width: width * 0.6,
            lift: (row.lift ?? 0) + height * 0.85,
          });
        }
      }
      x += share * (0.62 + rng() * 0.3);
      i += 1;
    }
  });
  /* The foreground: paving, steps up to the monolith, fallen columns, rubble in the streets. */
  specs.push(
    { kind: 'plaza', x: 0.5, z: 5.5, near: 1.7, height: 0, width: 0.9 },
    { kind: 'rubble', x: 0.36, z: 5.4, height: 0.25, width: 0.9 },
    { kind: 'rubble', x: 0.66, z: 5.6, height: 0.3, width: 1.0, wide: true },
    { kind: 'fallen', x: 0.24, z: 3.3, height: 0.2, width: 1.1 },
    { kind: 'fallen', x: 0.77, z: 3.6, height: 0.18, width: 0.9 },
    { kind: 'rubble', x: 0.13, z: 3.0, height: 0.25, width: 0.9 },
    { kind: 'rubble', x: 0.88, z: 2.9, height: 0.22, width: 0.8 },
    { kind: 'block', x: 0.03, z: 2.0, height: 0.28, width: 0.75 },
    { kind: 'block', x: 0.97, z: 2.05, height: 0.24, width: 0.65 },
    { kind: 'steps', x: 0.5, z: 2.45, order: 2.5, height: 0.2, width: 1.5 },
    {
      kind: 'monolith',
      x: 0.5,
      z: 2.45,
      order: 2.4,
      lift: 0.2,
      height: 0.82,
      width: 0.74,
      vine: true,
    },
  );
  return specs;
};
