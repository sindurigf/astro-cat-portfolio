/*
 * An abbreviation's expansion on hover, keyboard focus and tap (SC 3.1.4),
 * dismissible with Escape and hoverable (SC 1.4.13). A button, not a focusable
 * <abbr>: a tap must work, and the WAI-ARIA tooltip pattern covers no touch.
 */

const OPEN = 'is-open';
const VIEWPORT_MARGIN_PX = 16;

type Tip = { root: HTMLElement; trigger: HTMLButtonElement; tip: HTMLElement };

const tips: Tip[] = [];
const pinned = new WeakSet<HTMLElement>();

const closeTip = ({ root, trigger, tip }: Tip): void => {
  root.classList.remove(OPEN);
  trigger.setAttribute('aria-expanded', 'false');
  pinned.delete(root);
  tip.style.removeProperty('--abbr-shift');
};

/* Shifts the tip left when it would run past the viewport's right edge. */
const keepTipInView = (tip: HTMLElement): void => {
  const overflow =
    tip.getBoundingClientRect().right -
    (document.documentElement.clientWidth - VIEWPORT_MARGIN_PX);
  if (overflow > 0) tip.style.setProperty('--abbr-shift', `${-overflow}px`);
};

const openTip = (entry: Tip): void => {
  for (const other of tips) if (other !== entry) closeTip(other);
  entry.root.classList.add(OPEN);
  entry.trigger.setAttribute('aria-expanded', 'true');
  keepTipInView(entry.tip);
};

const isOpen = ({ root }: Tip): boolean => root.classList.contains(OPEN);

const upgrade = (root: HTMLElement): Tip | null => {
  const abbr = root.querySelector('abbr');
  const tip = root.querySelector<HTMLElement>('.abbr-tip');
  if (!abbr || !tip) return null;

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'abbr-trigger';
  trigger.setAttribute('aria-expanded', 'false');
  trigger.setAttribute('aria-describedby', tip.id);
  abbr.removeAttribute('aria-describedby');
  abbr.replaceWith(trigger);
  trigger.append(abbr);

  const entry = { root, trigger, tip };

  trigger.addEventListener('click', () => {
    if (isOpen(entry) && pinned.has(root)) {
      closeTip(entry);
      return;
    }
    openTip(entry);
    pinned.add(root);
  });
  trigger.addEventListener('focus', () => openTip(entry));
  trigger.addEventListener('blur', () => closeTip(entry));
  root.addEventListener('pointerenter', (event) => {
    if (event.pointerType === 'mouse') openTip(entry);
  });
  root.addEventListener('pointerleave', (event) => {
    if (
      event.pointerType === 'mouse' &&
      !pinned.has(root) &&
      document.activeElement !== trigger
    ) {
      closeTip(entry);
    }
  });

  return entry;
};

for (const root of document.querySelectorAll<HTMLElement>('[data-abbr]')) {
  const entry = upgrade(root);
  if (entry) tips.push(entry);
}

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') for (const entry of tips) closeTip(entry);
});

document.addEventListener('pointerdown', (event) => {
  for (const entry of tips) {
    const inside =
      event.target instanceof Node && entry.root.contains(event.target);
    if (isOpen(entry) && !inside) {
      closeTip(entry);
    }
  }
});

/* A module, so these names stay out of the scope page scripts share. */
export {};
