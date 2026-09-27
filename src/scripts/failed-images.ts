/*
 * Marks the failed photos in the page's HTML (failed-frame.ts). Images can fail
 * before this runs, so they are also swept on arrival and on `load`.
 */

import { markFailed } from './failed-frame';

const IMAGES = '.aspect-frame > img, .aspect-frame > picture > img';

const hasFailed = (img: HTMLImageElement): boolean =>
  img.complete && img.naturalWidth === 0 && img.getAttribute('src') !== null;

const sweep = (): void => {
  document.querySelectorAll<HTMLImageElement>(IMAGES).forEach((img) => {
    if (hasFailed(img)) markFailed(img);
  });
};

document.querySelectorAll<HTMLImageElement>(IMAGES).forEach((img) => {
  img.addEventListener('error', () => markFailed(img), { once: true });
});
sweep();
window.addEventListener('load', sweep, { once: true });
