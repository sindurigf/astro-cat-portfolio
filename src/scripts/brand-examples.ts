/* /brand's motion-control examples: each flips only its own name and glyph. */

const flip = (button: HTMLButtonElement): void => {
  const label = button.querySelector<HTMLElement>('[data-label]');
  const glyph = button.querySelector<HTMLElement>('[data-glyph]');
  const { onLabel, onGlyph, offLabel, offGlyph } = button.dataset;
  if (!label || !glyph || !onLabel || !onGlyph || !offLabel || !offGlyph) {
    throw new Error('brand-examples: a toggle is missing its labels or glyph.');
  }
  const on = label.textContent?.trim() === onLabel;
  label.textContent = on ? offLabel : onLabel;
  glyph.textContent = on ? offGlyph : onGlyph;
};

for (const button of document.querySelectorAll<HTMLButtonElement>(
  'button[data-example-toggle]',
)) {
  button.addEventListener('click', () => flip(button));
}
