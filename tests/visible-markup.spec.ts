import { expect, test } from './test';
import { visibleMarkup } from '../scripts/visible-markup.mjs';
import { NODE } from './tags';

const words = (markup: string) =>
  visibleMarkup(markup)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

test.describe('visibleMarkup', NODE, () => {
  test('drops screen-reader-only and aria-hidden text', () => {
    expect(
      words(
        '<span aria-hidden="true">z</span>Put <span class="sr-only">the cat</span>Away',
      ),
    ).toBe('Put Away');
  });

  test('a nested tag of the same name does not end a hidden element early', () => {
    expect(
      words(
        '<span class="sr-only">Outer <span>inner</span> still hidden</span>Shown',
      ),
    ).toBe('Shown');
  });

  test('a void or self-closed hidden element hides nothing after it', () => {
    expect(
      words(
        '<img aria-hidden="true" src="x">Shown<svg aria-hidden="true"/>Too',
      ),
    ).toBe('Shown Too');
  });

  test('keeps an element whose class only contains the word', () => {
    expect(words('<span class="not-sr-only">Shown</span>')).toBe('Shown');
  });
});
