/* Smaller, Larger and Reset: step --text-scale and remember the size. */
import {
  TEXT_SCALE_DEFAULT,
  TEXT_SCALE_KEY,
  TEXT_SCALE_PROPERTY,
  TEXT_SCALE_STEPS,
} from '../lib/text-scale';

type Action = 'smaller' | 'larger' | 'reset';

const PERCENT = 100;
const last = TEXT_SCALE_STEPS.length - 1;

const run = (trigger: HTMLButtonElement): void => {
  const root = document.documentElement;
  const group = trigger.closest<HTMLElement>('[data-text-size]');
  const status = group?.querySelector<HTMLElement>('[data-size-status]');
  const action = trigger.dataset.sizeAction as Action | undefined;
  if (!group || !status || !action) {
    throw new Error('text-size: a button lacks its group, status or action.');
  }
  const now =
    parseFloat(root.style.getPropertyValue(TEXT_SCALE_PROPERTY)) * PERCENT ||
    TEXT_SCALE_DEFAULT;
  const at = Math.max(
    0,
    TEXT_SCALE_STEPS.findLastIndex((size) => size <= now),
  );
  const wanted =
    action === 'reset'
      ? TEXT_SCALE_STEPS.indexOf(TEXT_SCALE_DEFAULT)
      : Math.min(last, Math.max(0, at + (action === 'larger' ? 1 : -1)));
  const show = (index: number): void => {
    const percent = TEXT_SCALE_STEPS[index]!;
    if (percent === TEXT_SCALE_DEFAULT)
      root.style.removeProperty(TEXT_SCALE_PROPERTY);
    else root.style.setProperty(TEXT_SCALE_PROPERTY, String(percent / PERCENT));
  };

  /* A step this page cannot hold without sideways scroll is taken back (SC 1.4.10). */
  let index = wanted;
  show(index);
  while (index > at && root.scrollWidth > root.clientWidth) {
    index -= 1;
    show(index);
  }
  const fits = index === wanted;
  const percent = TEXT_SCALE_STEPS[index]!;

  for (const button of group.querySelectorAll<HTMLElement>(
    '[data-size-action]',
  )) {
    const kind = button.dataset.sizeAction as Action;
    const unavailable =
      kind === 'reset'
        ? percent === TEXT_SCALE_DEFAULT
        : kind === 'smaller'
          ? index === 0
          : index === last || !fits;
    button.setAttribute('aria-disabled', String(unavailable));
  }
  const stayed = index === at && action !== 'reset';
  status.textContent = !fits
    ? `Text is ${percent}%. That is the most this page fits.`
    : stayed
      ? `Text is already the ${action === 'larger' ? 'largest' : 'smallest'} size, ${percent}%.`
      : `Text is ${percent}%.`;

  try {
    if (percent === TEXT_SCALE_DEFAULT) localStorage.removeItem(TEXT_SCALE_KEY);
    else localStorage.setItem(TEXT_SCALE_KEY, String(percent));
  } catch {}
};

for (const trigger of document.querySelectorAll<HTMLButtonElement>(
  '[data-size-action]',
)) {
  trigger.addEventListener('on-demand', () => run(trigger));
}

const tab = document.querySelector<HTMLElement>('[data-reading-tab]');
const invoker = tab?.querySelector<HTMLElement>('.reading-tab-button');
const panel = tab?.querySelector<HTMLElement>('[popover]');

/* Safari does not focus a pressed button, so a missing target closes the tab only after Tab. */
let tabbing = false;
document.addEventListener('keydown', (event) => {
  tabbing = event.key === 'Tab';
});
document.addEventListener('pointerdown', () => {
  tabbing = false;
});

if (tab && invoker && panel) {
  const sync = (): void =>
    invoker.setAttribute(
      'aria-expanded',
      String(panel.matches(':popover-open')),
    );
  sync();
  panel.addEventListener('toggle', sync);

  /* Firefox keeps focus on the last button when Tab leaves the page, so no focusout arrives. */
  panel.addEventListener('keydown', (event) => {
    const last = panel.querySelector('[data-size-action="reset"]');
    if (event.key === 'Tab' && !event.shiftKey && event.target === last)
      panel.hidePopover();
  });

  /* Left open behind the next control, it would cover it (SC 2.4.11). */
  tab.addEventListener('focusout', (event) => {
    const next = event.relatedTarget;
    if (next instanceof Node ? !tab.contains(next) : tabbing) {
      if (panel.matches(':popover-open')) panel.hidePopover();
    }
  });
}

export {};
