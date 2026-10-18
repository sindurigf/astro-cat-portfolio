/* Closed in markup for phones; open from `xl`, matching `.post-layout`, and on paper. */
const BESIDE_THE_TEXT = '(width >= 80rem)';
const ON_PAPER = 'print';

const wide = matchMedia(BESIDE_THE_TEXT);
const paper = matchMedia(ON_PAPER);

const sync = (): void => {
  document
    .querySelectorAll<HTMLDetailsElement>('details[data-post-contents]')
    .forEach((details) => {
      details.open = wide.matches || paper.matches;
    });
};

sync();
wide.addEventListener('change', sync);
paper.addEventListener('change', sync);
