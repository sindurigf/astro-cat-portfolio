import { expect, test } from './test';
import { NODE } from './tags';
import { SPIRE, floretPhase, openness } from '../src/lib/hero-field-spire';

/* SC 2.3.3: under reduced motion the spires hold still and show their flowers open. */
const MOMENTS = [0, 1.7, 4.2, 9.9, 12.4, 40];
const PHASES = [0, 0.13, 0.5, 0.97];

test('spires are fully open in the reduced-motion still', NODE, () => {
  for (const phase of PHASES)
    for (const seconds of MOMENTS)
      expect(
        openness(phase, seconds, true),
        `a floret at phase ${phase} is not open in the still at ${seconds} s`,
      ).toBe(1);
});

test('a spire opens from its bottom floret to its top', NODE, () => {
  const spire = 0.4;
  const step = 0.05;
  const firstOpen = Array.from({ length: SPIRE.florets }, (_, k) => {
    const at = (t: number) => openness(floretPhase(spire, k), t, false);
    for (let t = step; t < 12.5; t += step)
      if (at(t - step) <= 0.5 && at(t) > 0.5) return t;
    return Infinity;
  });
  /* Measured from the bottom floret round the cycle, so a wrap does not reorder them. */
  const relative = firstOpen.map(
    (t) => (((t - firstOpen[0]!) % 12.5) + 12.5) % 12.5,
  );
  for (let k = 1; k < SPIRE.florets; k += 1)
    expect(
      relative[k],
      `floret ${k} opens before the one below it`,
    ).toBeGreaterThan(relative[k - 1]!);
});
