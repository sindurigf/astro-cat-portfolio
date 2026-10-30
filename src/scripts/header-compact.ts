/*
 * The slim header once the page scrolls past the full one. A state, not an
 * animation, so reduced motion needs nothing more. tests/header-fit.spec.ts.
 * An observer, not a scroll listener: WebKit can skip a single jump's scroll
 * event around load and first paint (https://trac.webkit.org/r256657).
 */
const header = document.querySelector('header.site-header');
const sentinel = document.querySelector('[data-header-sentinel]');

if (header && sentinel) {
  new IntersectionObserver(([entry]) => {
    header.toggleAttribute('data-compact', !entry?.isIntersecting);
  }).observe(sentinel);
}
