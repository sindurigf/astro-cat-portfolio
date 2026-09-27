/** Images and the hero canvases: nothing visible is gained past 2x. */
export const MAX_PIXEL_RATIO = 2;

export const DENSITIES = [1, MAX_PIXEL_RATIO];

/*
 * For fluid images. Steps stay within 1.5x, the oversize limit in
 * tests/image-size.spec.ts. Also used by src/plugins/post-figure.mjs.
 */
export const WIDTHS = [320, 480, 640, 960, 1280, 1536];
