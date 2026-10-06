import { expect, test } from './test';
import { NODE } from './tags';
import { GLOW, glyphLight } from '../src/lib/hero-field-poneglyph';

/* The poneglyph's script lights in a slow loop; these hold its motion to SC 2.3.3, 2.2.2 and 2.3.1. */
const ROWS = 10;
const CYCLE = ROWS * GLOW.step;
const STEP = 1 / 60;
/* A rise or fall quicker than this would read as a flash. */
const SLOWEST_FLASH_SECONDS = 1 / 3;

/* One row's light over a cycle, from the moment it starts to rise. */
const ownCycle = (row: number): number[] =>
  Array.from({ length: Math.round(CYCLE / STEP) }, (_, i) =>
    glyphLight(row, ROWS, row * GLOW.step + i * STEP, false),
  );

test('the reduced-motion still leaves every glyph row unlit', NODE, () => {
  for (let row = 0; row < ROWS; row += 1)
    for (const seconds of [0, 1.7, 5.2, 9.9, 17.3, 40])
      expect(
        glyphLight(row, ROWS, seconds, true),
        `row ${row} is lit in the still at ${seconds} s`,
      ).toBe(0);
});

test(
  'the glyph light depends only on the clock, so pausing it freezes the loop',
  NODE,
  () => {
    for (let row = 0; row < ROWS; row += 1)
      for (const seconds of [0.5, 3.1, 7.8, 12.6])
        expect(
          glyphLight(row, ROWS, seconds + CYCLE, false),
          `row ${row} differs one cycle on at ${seconds} s`,
        ).toBeCloseTo(glyphLight(row, ROWS, seconds, false), 9);
  },
);

test(
  'each glyph row rises and fades once a cycle, slower than a flash',
  NODE,
  () => {
    for (let row = 0; row < ROWS; row += 1) {
      const light = ownCycle(row);
      expect(Math.max(...light), `row ${row} never lights`).toBeGreaterThan(
        0.99,
      );
      let turns = 0;
      for (let i = 2; i < light.length; i += 1) {
        const before = light[i - 1]! - light[i - 2]!;
        const now = light[i]! - light[i - 1]!;
        if (before * now < 0) turns += 1;
      }
      expect(
        turns,
        `row ${row} turns more than once a cycle`,
      ).toBeLessThanOrEqual(1);
      const rising = light.findIndex((v) => v > 0.1);
      const lit = light.findIndex((v) => v > 0.9);
      const fading = light.findLastIndex((v) => v > 0.9);
      const dark = light.findLastIndex((v) => v > 0.1);
      expect(
        (lit - rising) * STEP,
        `row ${row} lights faster than a flash`,
      ).toBeGreaterThan(SLOWEST_FLASH_SECONDS);
      expect(
        (dark - fading) * STEP,
        `row ${row} fades faster than a flash`,
      ).toBeGreaterThan(SLOWEST_FLASH_SECONDS);
    }
  },
);

test(
  'some glyph row is always fully lit, so the loop has no dark gap',
  NODE,
  () => {
    for (let seconds = 0; seconds < CYCLE; seconds += STEP) {
      const brightest = Math.max(
        ...Array.from({ length: ROWS }, (_, row) =>
          glyphLight(row, ROWS, seconds, false),
        ),
      );
      expect(
        brightest,
        `no row is lit at ${seconds.toFixed(2)} s`,
      ).toBeGreaterThan(0.99);
    }
  },
);
