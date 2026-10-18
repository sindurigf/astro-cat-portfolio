/* Closed in markup for phones; open from `xl`, matching `.post-layout`, and on paper. */
const BESIDE_THE_TEXT = '(width >= 80rem)';
const ON_PAPER = 'print';

const wide = matchMedia(BESIDE_THE_TEXT);
const paper = matchMedia(ON_PAPER);

const setOpen = (open: boolean): void => {
  document
    .querySelectorAll<HTMLDetailsElement>('details[data-post-contents]')
    .forEach((details) => {
      details.open = open;
    });
};

const sync = (): void => setOpen(wide.matches || paper.matches);

sync();
wide.addEventListener('change', sync);
paper.addEventListener('change', sync);
/* Safari can fire `beforeprint` before its print media matches. */
window.addEventListener('beforeprint', () => setOpen(true));
window.addEventListener('afterprint', sync);
