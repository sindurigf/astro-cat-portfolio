/*
 * Hover and keyboard focus for src/components/Abbr.astro's popovers, placed
 * flush under their abbreviation so the pointer can cross onto them (SC 1.4.13).
 * Escape and a press elsewhere dismiss them natively.
 */

const VIEWPORT_MARGIN_PX = 16;

/* No popovers: the button would be an inert Tab stop, so keep only the <abbr>. */
const unwrap = (button: HTMLButtonElement): void => {
  button.replaceWith(...button.childNodes);
};

const enhance = (
  root: HTMLElement,
  button: HTMLButtonElement,
  tip: HTMLElement,
): void => {
  /* Opened by a click, so leaving the pointer or focus does not close it. */
  let pinned = false;
  let frame = 0;
  const isOpen = () => tip.matches(':popover-open');

  const place = () => {
    const anchor = button.getBoundingClientRect();
    const maxLeft =
      document.documentElement.clientWidth -
      VIEWPORT_MARGIN_PX -
      tip.offsetWidth;
    tip.style.inset = 'auto';
    tip.style.margin = '0';
    tip.style.top = `${anchor.bottom}px`;
    tip.style.left = `${Math.max(VIEWPORT_MARGIN_PX, Math.min(anchor.left, maxLeft))}px`;
  };
  const show = () => {
    if (!isOpen()) tip.showPopover();
  };
  const hide = () => {
    if (!pinned && isOpen()) tip.hidePopover();
  };

  tip.addEventListener('toggle', () => {
    if (isOpen()) place();
    else pinned = false;
  });
  /* A click on an open, unpinned tip pins it instead of closing it. */
  button.addEventListener('click', (event) => {
    if (isOpen() && !pinned) {
      event.preventDefault();
      pinned = true;
    }
  });
  button.addEventListener('focus', show);
  button.addEventListener('blur', () => {
    pinned = false;
    hide();
  });
  root.addEventListener('pointerenter', show);
  root.addEventListener('pointerleave', () => {
    if (document.activeElement !== button) hide();
  });
  addEventListener(
    'scroll',
    () => {
      if (!isOpen() || frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        place();
      });
    },
    { passive: true },
  );

  /* A tap before this script ran opened it where the browser puts popovers. */
  if (isOpen()) place();
};

for (const root of document.querySelectorAll<HTMLElement>('[data-abbr]')) {
  const button = root.querySelector('button');
  const tip = root.querySelector<HTMLElement>('[popover]');
  if (!button || !tip) continue;
  if ('showPopover' in tip) enhance(root, button, tip);
  else unwrap(button);
  root.dataset.abbrReady = '';
}

/* A module, so these names stay out of the scope page scripts share. */
export {};
