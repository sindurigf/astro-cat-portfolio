/* A Copy button inside every element marked data-copy's frame; one delegated listener does the copying. */
export {};

const COPIED_VISIBLE_MS = 2000;
const SVG_NS = 'http://www.w3.org/2000/svg';
const COPY_ICON = 'M8 3h12v14h-2V5H8zM4 7h12v14H4z';
const CHECK_ICON = 'M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z';

const announcer = document.createElement('div');
announcer.className = 'sr-only';
announcer.setAttribute('role', 'status');
document.body.append(announcer);

const drawIcon = (path: string): SVGSVGElement => {
  const icon = document.createElementNS(SVG_NS, 'svg');
  icon.setAttribute('viewBox', '0 0 24 24');
  icon.setAttribute('aria-hidden', 'true');
  icon.setAttribute('focusable', 'false');
  const shape = document.createElementNS(SVG_NS, 'path');
  shape.setAttribute('d', path);
  shape.setAttribute('fill', 'currentColor');
  icon.append(shape);
  return icon;
};

const timers = new WeakMap<Element, number>();

for (const source of document.querySelectorAll<HTMLElement>('[data-copy]')) {
  const wrap = document.createElement('div');
  wrap.className = 'copy-wrap';
  const tip = document.createElement('span');
  tip.className = 'copy-tip';
  tip.setAttribute('aria-hidden', 'true');
  tip.textContent = 'Copy';
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'copy-button';
  const word = document.createElement('span');
  word.setAttribute('aria-hidden', 'true');
  word.hidden = true;
  const name = document.createElement('span');
  name.className = 'sr-only';
  name.textContent = `Copy ${source.dataset.copy}`;
  button.append(drawIcon(COPY_ICON), word, name);
  wrap.append(button, tip);
  source.parentElement?.append(wrap);
}

document.addEventListener('click', async (event) => {
  const button = (event.target as Element).closest<HTMLButtonElement>(
    '.copy-button',
  );
  const wrap = button?.parentElement;
  const source = wrap?.parentElement?.querySelector('[data-copy]');
  const word = button?.querySelector<HTMLElement>('span');
  const icon = button?.querySelector('svg');
  if (!button || !wrap || !source || !word || !icon) return;
  announcer.textContent = '';
  try {
    await navigator.clipboard.writeText(source.textContent ?? '');
    announcer.textContent = 'Copied';
    word.textContent = 'Copied';
    word.hidden = false;
    wrap.dataset.copied = '';
    button.querySelector('svg')?.replaceWith(drawIcon(CHECK_ICON));
    clearTimeout(timers.get(wrap));
    timers.set(
      wrap,
      window.setTimeout(() => {
        word.hidden = true;
        delete wrap.dataset.copied;
        button.querySelector('svg')?.replaceWith(drawIcon(COPY_ICON));
      }, COPIED_VISIBLE_MS),
    );
  } catch {
    getSelection()?.selectAllChildren(source);
    announcer.textContent =
      'Copy failed. The code is selected: press Ctrl+C or Command+C.';
  }
});

/* SC 1.4.13: Escape hides the tip without moving focus; entering or focusing the button brings it back. */
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  for (const wrap of document.querySelectorAll<HTMLElement>(
    '.copy-wrap:hover, .copy-wrap:focus-within',
  )) {
    wrap.dataset.dismissed = '';
  }
});

const rearm = (event: Event): void => {
  const wrap = (event.target as Element).closest<HTMLElement>('.copy-wrap');
  const from = (event as PointerEvent | FocusEvent).relatedTarget;
  if (wrap && !(from instanceof Node && wrap.contains(from))) {
    delete wrap.dataset.dismissed;
  }
};
document.addEventListener('pointerover', rearm);
document.addEventListener('focusin', rearm);
