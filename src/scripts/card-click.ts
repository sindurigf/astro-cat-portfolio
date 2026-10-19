/*
 * A short press anywhere on a card follows its one link; a longer press or a
 * drag selects the text instead (https://inclusive-components.design/cards/).
 */
const CARD = '.card:has(.card-link)';
const CLICK_MAX_MS = 200;
const OWN_CONTROLS = 'a, button, input, select, textarea, summary, label';

let pressedAt = 0;

document.addEventListener('mousedown', (event) => {
  if (event.target instanceof Element && event.target.closest(CARD)) {
    pressedAt = performance.now();
  }
});

document.addEventListener('click', (event) => {
  const { target } = event;
  if (!(target instanceof Element)) return;
  const card = target.closest(CARD);
  if (!card || target.closest(OWN_CONTROLS)) return;
  const modified =
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey;
  if (modified || event.defaultPrevented) return;
  if (performance.now() - pressedAt >= CLICK_MAX_MS) return;
  if (String(getSelection() ?? '') !== '') return;
  card.querySelector<HTMLAnchorElement>('.card-link')?.click();
});
