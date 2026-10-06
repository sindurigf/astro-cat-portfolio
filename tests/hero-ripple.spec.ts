import { expect, test } from './test';
import { NODE } from './tags';
import { GLOW, glyphLight } from '../src/lib/hero-field-poneglyph';

/*
 * The poneglyph's script lights glyph by glyph in a loop; these hold it to SC
 * 2.3.3, 2.2.2 and 2.3.1. For 2.3.1 one glyph is far below the general flash
 * area, and each glyph makes one rise and one fall a cycle, never a flash.
 */
const GLYPHS = 63;
const CYCLE = GLYPHS * GLOW.step;
const STEP = 1 / 60;
/* SC 2.3.1 allows three flashes a second, so one flash may take no less than this. */
const SHORTEST_ALLOWED_FLASH = 1 / 3;

/* One glyph's light over a cycle, from the moment it starts to rise. */
const ownCycle = (glyph: number): number[] =>
  Array.from({ length: Math.round(CYCLE / STEP) }, (_, i) =>
    glyphLight(glyph, GLYPHS, glyph * GLOW.step + i * STEP, false),
  );

test('the reduced-motion still leaves every glyph unlit', NODE, () => {
  for (let glyph = 0; glyph < GLYPHS; glyph += 1)
    for (const seconds of [0, 1.7, 5.2, 9.9, 17.3, 40])
      expect(
        glyphLight(glyph, GLYPHS, seconds, true),
        `glyph ${glyph} is lit in the still at ${seconds} s`,
      ).toBe(0);
});

test(
  'the glyph light depends only on the clock, so pausing it freezes the loop',
  NODE,
  () => {
    for (let glyph = 0; glyph < GLYPHS; glyph += 1)
      for (const seconds of [0.5, 3.1, 7.8, 12.6])
        expect(
          glyphLight(glyph, GLYPHS, seconds + CYCLE, false),
          `glyph ${glyph} differs one cycle on at ${seconds} s`,
        ).toBeCloseTo(glyphLight(glyph, GLYPHS, seconds, false), 9);
  },
);

test(
  'each glyph makes one rise and fall a cycle, slower than three flashes a second',
  NODE,
  () => {
    for (let glyph = 0; glyph < GLYPHS; glyph += 1) {
      const light = ownCycle(glyph);
      expect(Math.max(...light), `glyph ${glyph} never lights`).toBeGreaterThan(
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
        `glyph ${glyph} turns more than once a cycle`,
      ).toBeLessThanOrEqual(1);
      /* One flash is the rise and the fall together. */
      const lights = light.findIndex((v) => v > 0.1);
      const unlit = light.findLastIndex((v) => v > 0.1);
      expect(
        (unlit - lights) * STEP,
        `glyph ${glyph} flashes faster than three times a second`,
      ).toBeGreaterThan(SHORTEST_ALLOWED_FLASH);
    }
  },
);

test(
  'one glyph is lit at a time, crossing over to the next with no dark gap',
  NODE,
  () => {
    for (let seconds = 0; seconds < CYCLE; seconds += STEP) {
      const light = Array.from({ length: GLYPHS }, (_, glyph) =>
        glyphLight(glyph, GLYPHS, seconds, false),
      );
      const at = seconds.toFixed(2);
      expect(
        light.filter((v) => v > 0.5 + 1e-9).length,
        `more than one glyph is over half lit at ${at} s`,
      ).toBeLessThanOrEqual(1);
      expect(
        light.filter((v) => v > 1e-9).length,
        `more than two glyphs are lit at ${at} s`,
      ).toBeLessThanOrEqual(2);
      expect(
        Math.max(...light),
        `no glyph is lit at ${at} s`,
      ).toBeGreaterThanOrEqual(0.5 - 1e-9);
    }
  },
);
