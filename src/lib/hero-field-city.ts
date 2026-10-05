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
  { z: 13, height: [2.4, 4.4], width: [1.4, 2.6], broken: 0.4, lift: 0.6 },
  { z: 9, height: [2.0, 3.6], width: [1.3, 2.4], broken: 0.5, lift: 0.4 },
  { z: 6, height: [1.3, 2.4], width: [1.2, 2.0], broken: 0.6, gap: [0.4, 0.6] },
  { z: 4, height: [0.8, 1.6], width: [1.1, 1.8], broken: 0.8, gap: [0.3, 0.7] },
];

export const cityRuins = (seed: number): RuinSpec[] => {
  const rng = random(seed);
  const specs: RuinSpec[] = [
    { kind: 'stepped', x: 0.5, z: 16, height: 7.5, width: 7.5 },
    { kind: 'aqueduct', x: 0.68, z: 7.5, height: 3.0, width: 5.6, lift: 0.9, wide: true },
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
  specs.push(
    { kind: 'block', x: 0.03, z: 2.1, height: 0.3, width: 0.8 },
    { kind: 'block', x: 0.2, z: 2.6, height: 0.16, width: 0.45 },
    { kind: 'block', x: 0.8, z: 2.6, height: 0.18, width: 0.5 },
    { kind: 'block', x: 0.97, z: 2.1, height: 0.26, width: 0.7 },
    { kind: 'monolith', x: 0.5, z: 2.4, height: 1.2, width: 1.1, vine: true },
  );
  return specs;
};
