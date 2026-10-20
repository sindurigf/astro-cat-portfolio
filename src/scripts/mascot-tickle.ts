/* Tickle the Cat: the footer mascot purrs and the motto band laughs. Motion lives in footer.css; this only restarts it. */
export {};

const PURRS = 'The cat purrs.';

const button = document.querySelector<HTMLButtonElement>(
  '[data-mascot-tickle]',
);
const mascot = document.querySelector<SVGElement>('.footer-mascot');
const name = document.querySelector<HTMLElement>('.footer-name-text');
if (!button || !mascot || !name) {
  throw new Error(
    'mascot-tickle: the footer lacks its button, mascot or motto.',
  );
}

const status = Object.assign(document.createElement('p'), {
  className: 'sr-only',
});
status.setAttribute('role', 'status');
/* Outside the band, whose text is the motto alone. */
button.closest('footer')!.append(status);

/* Removing and re-adding the attribute restarts a running animation on a quick second press. */
const replay = (el: Element): void => {
  el.removeAttribute('data-tickled');
  void el.getBoundingClientRect();
  el.setAttribute('data-tickled', '');
};

button.addEventListener('on-demand', () => {
  replay(mascot);
  replay(name);
  status.textContent = '';
  requestAnimationFrame(() => {
    status.textContent = PURRS;
  });
});
