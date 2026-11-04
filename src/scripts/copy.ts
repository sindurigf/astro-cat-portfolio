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
  icon.setAttribute('focusable', 'false');
  const shape = document.createElementNS(SVG_NS, 'path');
  shape.setAttribute('d', path);
  shape.setAttribute('fill', 'currentColor');
  icon.append(shape);
  return mute(icon);
};

const timers = new WeakMap<Element, number>();

const COPY = 'Copy';

const mute = <T extends Element>(node: T): T => {
  node.setAttribute('aria-hidden', 'true');
  return node;
};

const make = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text = '',
): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
};

/*
 * Two looks: an icon with a tip (/brand), or with `data-copy-word` the word
 * "Copy" beside the icon (post code). Both keep one name, "Copy <data-copy>".
 */
for (const source of document.querySelectorAll<HTMLElement>('[data-copy]')) {
  const withWord = source.dataset.copyWord !== undefined;
  const wrap = make('div', 'copy-wrap');
  const button = make('button', withWord ? 'copy-word-button' : 'copy-button');
  button.type = 'button';
  const word = mute(make('span', '', COPY));
  button.append(
    drawIcon(COPY_ICON),
    word,
    make('span', 'sr-only', `Copy ${source.dataset.copy}`),
  );
  wrap.append(button);
  if (!withWord) {
    wrap.append(mute(make('span', 'copy-tip', COPY)));
  }
  source.parentElement?.append(wrap);
  source.parentElement?.after(make('p', 'copy-error'));
}

const FAILED = 'Copy failed. The code is selected: press Ctrl+C or Command+C.';

document.addEventListener('click', async (event) => {
  const button = (event.target as Element).closest<HTMLButtonElement>(
    '.copy-wrap button',
  );
  const wrap = button?.parentElement;
  const frame = wrap?.parentElement;
  const source = frame?.querySelector<HTMLElement>('[data-copy]');
  const error = frame?.nextElementSibling as HTMLElement | null | undefined;
  const word = button?.querySelector('span');
  if (!button || !wrap || !source || !word || !error) return;
  const reset = (): void => {
    clearTimeout(timers.get(wrap));
    word.textContent = COPY;
    delete wrap.dataset.copied;
    button.querySelector('svg')?.replaceWith(drawIcon(COPY_ICON));
  };
  reset();
  announcer.textContent = error.textContent = '';
  try {
    /* The fence's last newline would run the last line on a paste into a shell. */
    await navigator.clipboard.writeText(source.textContent!.replace(/\n$/, ''));
    announcer.textContent = word.textContent = 'Copied';
    wrap.dataset.copied = '';
    button.querySelector('svg')?.replaceWith(drawIcon(CHECK_ICON));
    timers.set(wrap, window.setTimeout(reset, COPIED_VISIBLE_MS));
  } catch {
    getSelection()?.selectAllChildren(source);
    announcer.textContent = error.textContent = FAILED;
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
