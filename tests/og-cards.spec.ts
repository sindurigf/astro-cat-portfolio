import { expect, test } from './test';
import { NODE } from './tags';
import { imageMime } from '../src/lib/og-cards';

/* npm run og embeds a card's photo as a data URI; an untyped one draws an empty card. */
test.describe('the sharing card photo type', NODE, () => {
  test('a JPEG, PNG, WebP or AVIF photo gets its media type, any case', () => {
    expect(imageMime('a/photo.JPG')).toBe('image/jpeg');
    expect(imageMime('a/photo.jpeg')).toBe('image/jpeg');
    expect(imageMime('a/photo.png')).toBe('image/png');
    expect(imageMime('a/photo.webp')).toBe('image/webp');
    expect(imageMime('a/photo.avif')).toBe('image/avif');
  });

  test('any other photo stops the run, naming the file', () => {
    for (const path of ['a/photo.gif', 'a/photo.tiff', 'a/photo']) {
      expect(() => imageMime(path)).toThrow(
        `make-og: ${path} is not a JPEG, PNG, WebP or AVIF.`,
      );
    }
  });
});
