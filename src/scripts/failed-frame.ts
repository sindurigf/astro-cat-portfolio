/*
 * Shows a failed photo's alt text in its `.aspect-frame`, since WebKit draws
 * none. The copy is `aria-hidden` so it is announced once.
 */

const ALT_CLASS = 'aspect-frame-alt';

/* Below this frame width the text takes the label size. */
const SMALL_FRAME_REM = 20;

const rootFontSize = (): number =>
  parseFloat(getComputedStyle(document.documentElement).fontSize);

/* Whole lines only, with the top inset mirrored at the bottom. */
const fit = (frame: HTMLElement, text: HTMLElement): void => {
  text.dataset.size =
    frame.clientWidth < SMALL_FRAME_REM * rootFontSize() ? 'small' : 'normal';
  const lineHeight = parseFloat(getComputedStyle(text).lineHeight);
  const lines = Math.max(
    1,
    Math.floor((frame.clientHeight - 2 * text.offsetTop) / lineHeight),
  );
  text.style.setProperty('--alt-lines', String(lines));
};

export const markFailed = (img: HTMLImageElement): void => {
  const frame = img.closest<HTMLElement>('.aspect-frame');
  if (frame === null || 'failed' in frame.dataset) return;
  frame.dataset.failed = '';

  const alt = img.alt.trim();
  if (alt === '') return;

  const text = document.createElement('span');
  text.className = ALT_CLASS;
  text.setAttribute('aria-hidden', 'true');
  text.textContent = alt;
  frame.append(text);

  fit(frame, text);
  new ResizeObserver(() => fit(frame, text)).observe(frame);
};
