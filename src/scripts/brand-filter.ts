/* Narrows a sections list to the sections whose text holds every typed word. */

const fold = (text: string): string =>
  text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

const EMPTY_HINT = 'Try a token, a hex value or a component name.';
const index = new Map<string, string>();

/* A section's own text, without its code samples, folded once on first use. */
const textOf = (anchor: string): string => {
  const known = index.get(anchor);
  if (known !== undefined) return known;
  const copy = document.getElementById(anchor)?.cloneNode(true) as
    HTMLElement | undefined;
  copy?.querySelectorAll('pre, script').forEach((node) => node.remove());
  const text = fold(copy?.textContent ?? '');
  index.set(anchor, text);
  return text;
};

for (const input of document.querySelectorAll<HTMLInputElement>(
  '[data-menu-filter]',
)) {
  const box = input.closest<HTMLElement>('[data-menu-list]');
  const status = box?.querySelector<HTMLElement>('[data-menu-status]');
  if (!box || !status) {
    throw new Error('brand-filter: a filter lacks its list or status.');
  }
  const filter = (): void => {
    const words = fold(input.value).split(/\s+/).filter(Boolean);
    let shown = 0;
    for (const group of box.querySelectorAll<HTMLElement>(':scope > ol > li')) {
      let inGroup = 0;
      for (const item of group.querySelectorAll<HTMLElement>('ol > li')) {
        const anchor = item.querySelector('a')?.hash.slice(1) ?? '';
        const match = words.every((word) => textOf(anchor).includes(word));
        item.hidden = !match;
        if (match) inGroup += 1;
      }
      group.hidden = inGroup === 0;
      shown += inGroup;
    }
    status.textContent = !words.length
      ? ''
      : shown
        ? `${shown} ${shown === 1 ? 'match' : 'matches'}`
        : `No matches. ${EMPTY_HINT}`;
  };
  input.addEventListener('input', filter);
  input.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !input.value) return;
    input.value = '';
    filter();
  });
}
