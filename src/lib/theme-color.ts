/*
 * Injected by `vite.define` in astro.config.mjs. Not `global.css?raw`, which
 * puts the whole stylesheet in the Worker bundle: tests/worker-bundle.spec.ts.
 */
declare const __THEME_COLOR__: string;

/** `--color-background` as a hex literal. */
export const themeColor: string = __THEME_COLOR__;
