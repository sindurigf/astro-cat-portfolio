/** `scrollWidth` is rounded, so a box that fits can measure 1px over. */
const SCROLL_ROUNDING_PX = 1;

/* Ends the aria-label of every sideways scroller: PhotoStrip.astro, brand/Photos.astro, brand/Text.astro, src/plugins/code-block.mjs. */
const SCROLLS_SUFFIX = ', scrolls sideways';

/** A box that fits has nothing to scroll: it leaves the tab order and its name stops saying it scrolls. Returns whether it scrolls. */
export const reflectFit = (box: HTMLElement): boolean => {
  const scrolls = box.scrollWidth - box.clientWidth > SCROLL_ROUNDING_PX;
  box.setAttribute(
    'aria-label',
    (box.getAttribute('aria-label') ?? '').replace(SCROLLS_SUFFIX, '') +
      (scrolls ? SCROLLS_SUFFIX : ''),
  );
  box.tabIndex = scrolls ? 0 : -1;
  return scrolls;
};

export { SCROLL_ROUNDING_PX };
