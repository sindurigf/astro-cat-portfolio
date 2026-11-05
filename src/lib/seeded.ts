/* Park and Miller's minimal standard generator: the same sequence for the same seed, so a drawing stays put between visits. */
const MULTIPLIER = 16807;
const MODULUS = 2147483647;

/** A repeatable random source in [0, 1) from a positive whole-number seed. */
export const seeded = (seed: number): (() => number) => {
  let state = seed;
  return () => {
    state = (state * MULTIPLIER) % MODULUS;
    return state / MODULUS;
  };
};
