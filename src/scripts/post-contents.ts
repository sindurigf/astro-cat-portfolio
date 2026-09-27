/* Closed in markup for phones; open from `xl`, matching `.post-layout`. */
const BESIDE_THE_TEXT = '(width >= 80rem)';

const wide = matchMedia(BESIDE_THE_TEXT);

const sync = (): void => {
  document
    .querySelectorAll<HTMLDetailsElement>('details[data-post-contents]')
    .forEach((details) => {
      details.open = wide.matches;
    });
};

sync();
wide.addEventListener('change', sync);
