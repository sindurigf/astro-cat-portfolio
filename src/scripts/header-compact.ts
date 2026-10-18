/*
 * The slim header once the page scrolls past the full one. A state, not an
 * animation, so reduced motion needs nothing more. tests/header-fit.spec.ts.
 */
const header = document.querySelector('header.site-header');
const full = parseFloat(
  getComputedStyle(document.documentElement).getPropertyValue(
    '--spacing-header',
  ),
);
const update = (): void => {
  header?.toggleAttribute('data-compact', window.scrollY > full);
};

window.addEventListener('scroll', update, { passive: true });
update();
