/* Numerical Recipes' linear congruential generator constants. */
const MULTIPLIER = 1664525;
const INCREMENT = 1013904223;
const MODULUS = 2 ** 32;

/** A repeatable stand-in for `Math.random`, starting from `seed`. */
export const random = (seed: number): (() => number) => {
  let state = seed;
  return () => {
    state = (state * MULTIPLIER + INCREMENT) % MODULUS;
    return state / MODULUS;
  };
};
