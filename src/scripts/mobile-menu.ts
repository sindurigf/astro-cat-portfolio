/*
 * A native <dialog> with showModal(): the browser handles focus, Escape and
 * inertness. `data-menu-ready` is read by tests/settle.ts.
 */

/*
 * Pads by the scrollbar width to stop a reflow. Not `scrollbar-gutter: stable`:
 * headless Chromium reserves it with no scrollbar, narrowing the 288px box.
 */
const lockScroll = (locked: boolean): void => {
  const scrollbar = window.innerWidth - document.documentElement.clientWidth;
  document.body.style.paddingRight =
    locked && scrollbar > 0 ? `${scrollbar}px` : '';
  document.body.style.overflow = locked ? 'hidden' : '';
};

/*
 * Keeps the focus ring visible (SC 2.4.7). Firefox scrolls only fully hidden
 * controls; WebKit ignores scroll-padding, so the ring's reach is added here.
 */
const keepInView = (panel: HTMLDialogElement, event: FocusEvent): void => {
  const control = event.target;
  if (!(control instanceof HTMLElement)) return;

  control.scrollIntoView({ block: 'nearest' });

  const style = getComputedStyle(control);
  const reach =
    parseFloat(style.outlineWidth) + parseFloat(style.outlineOffset);
  if (!Number.isFinite(reach) || reach <= 0) return;

  const box = control.getBoundingClientRect();
  const edge = panel.getBoundingClientRect();
  const below = box.bottom + reach - edge.bottom;
  const above = edge.top - (box.top - reach);
  /* Rounded up: scrollTop settles on whole pixels, and a box edge need not. */
  if (below > 0) panel.scrollTop += Math.ceil(below);
  else if (above > 0) panel.scrollTop -= Math.ceil(above);
};

const setUpMenu = (root: HTMLElement): void => {
  const trigger = root.querySelector<HTMLButtonElement>('[data-menu-trigger]');
  const panel = root.querySelector<HTMLDialogElement>('dialog');
  if (!trigger || !panel) {
    throw new Error('mobile-menu: the trigger or the dialog is missing.');
  }

  const open = (): void => {
    panel.showModal();
    trigger.setAttribute('aria-expanded', 'true');
    lockScroll(true);
  };

  /* Always go through close() so the browser restores focus to the trigger. */
  const close = (): void => panel.close();

  /* Escape bypasses close(), so the closed state is reset here. */
  panel.addEventListener('close', () => {
    trigger.setAttribute('aria-expanded', 'false');
    lockScroll(false);
    /*
     * Widened past 48rem while open, the trigger is hidden: focus the nav.
     * Not checkVisibility(): Safari lacks it before 17.4, inside the CSS target.
     */
    if (trigger.getClientRects().length === 0) {
      document
        .querySelector<HTMLAnchorElement>('header nav[aria-label="Primary"] a')
        ?.focus();
    }
  });

  trigger.addEventListener('click', open);
  panel.addEventListener('focusin', (event) => keepInView(panel, event));
  for (const control of panel.querySelectorAll('a[href], [data-menu-close]')) {
    control.addEventListener('click', close);
  }

  root.dataset.menuReady = 'true';
};

const menu = document.querySelector<HTMLElement>('[data-mobile-menu]');
if (menu) setUpMenu(menu);
