import { expect, test } from './test';
import { builtFixture, runCheck, type Files } from './check-fixture';
import { SERVED_AS_IS } from '../scripts/check-allow-lists.mjs';
import { NODE } from './tags';

const SCRIPT = 'scripts/check-untransformed.mjs';
const SHIPPED = 'photo.jpg';

/* Every allowed original shipped byte for byte, so none reads as stale. */
const servedAsIs = (): Files =>
  Object.fromEntries(
    [...(SERVED_AS_IS as Map<string, string>).keys()].flatMap((name) => [
      [`src/assets/${name}`, `original ${name}`],
      [`dist/client/_astro/${name}`, `original ${name}`],
    ]),
  );

const tree = (extra: Files = {}): Files => ({
  ...servedAsIs(),
  [`src/assets/${SHIPPED}`]: 'original photo',
  'dist/client/_astro/photo.hash.webp': 'transformed photo',
  'src/content/talks/talk/slide.png': 'original slide',
  ...extra,
});

test.describe('check:untransformed', NODE, () => {
  test('passes a build that ships only transformed images and the allowed originals', () => {
    const { status, output } = runCheck(SCRIPT, builtFixture(tree()));
    expect(status, output).toBe(0);
  });

  test('fails a build that ships a source image byte for byte and names it', () => {
    const root = builtFixture(
      tree({ [`dist/client/_astro/${SHIPPED}`]: 'original photo' }),
    );
    const { status, output } = runCheck(SCRIPT, root);
    expect(status, output).not.toBe(0);
    expect(output).toContain(`src/assets/${SHIPPED}`);
  });
});
