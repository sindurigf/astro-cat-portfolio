import sharp from 'sharp';
import { expect, test } from './test';
import { ratio, readTokens } from '../scripts/contrast-table.mjs';
import { NODE } from './tags';
import { AA_TEXT, NON_TEXT } from './contrast';

/**
 * The logo cat (src/lib/brand-mark.ts) on the grounds it meets, and the tab
 * icon's die-cut (scripts/make-icons.mjs) on light and dark browser tabs.
 */

/** Chrome's light tab strip: the darkest light ground a tab icon sits on. */
const LIGHT_TAB_STRIP = '#DEE1E6';
/** Chrome's dark tab strip: the lightest dark ground a tab icon sits on. */
const DARK_TAB_STRIP = '#3C3C3C';

const tokens = readTokens() as Record<string, string>;

test.describe('the logo cat', NODE, () => {
  test('its blue edge holds 3:1 on the dark and the light page ground (SC 1.4.11)', () => {
    for (const ground of ['background', 'light-ground']) {
      expect(
        ratio(tokens['tile-edge'], tokens[ground]),
        `the tile edge is under 3:1 on --color-${ground}`,
      ).toBeGreaterThanOrEqual(NON_TEXT);
    }
  });

  test('its face holds 4.5:1 on each coat color it is drawn over', () => {
    for (const coat of ['cat-hela', 'cat-hela-orange']) {
      expect(
        ratio(tokens['gold-text'], tokens[coat]),
        `the face ink is under 4.5:1 on --color-${coat}`,
      ).toBeGreaterThanOrEqual(AA_TEXT);
    }
  });

  test('the tab icon is cut out against both tab strips: an ink edge outside a white rim (SC 1.4.11)', async () => {
    expect(
      ratio(tokens['gold-text'], LIGHT_TAB_STRIP),
      'the ink edge is under 3:1 on a light tab strip',
    ).toBeGreaterThanOrEqual(NON_TEXT);
    expect(
      ratio(tokens['light-ground'], DARK_TAB_STRIP),
      'the white rim is under 3:1 on a dark tab strip',
    ).toBeGreaterThanOrEqual(NON_TEXT);

    /* The opaque pixels touching transparency are the sticker's outline: mostly ink. */
    const { data, info } = await sharp('artwork/favicon-48x48.png')
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const at = (x: number, y: number) => (y * info.width + x) * info.channels;
    const opaque = (x: number, y: number) =>
      x >= 0 &&
      y >= 0 &&
      x < info.width &&
      y < info.height &&
      data[at(x, y) + 3] > 200;
    const hex = (i: number) =>
      `#${[0, 1, 2].map((c) => data[i + c].toString(16).padStart(2, '0')).join('')}`;
    let outline = 0;
    let dark = 0;
    let white = 0;
    for (let y = 0; y < info.height; y++)
      for (let x = 0; x < info.width; x++) {
        if (!opaque(x, y)) continue;
        const colour = hex(at(x, y));
        if (ratio(colour, tokens['light-ground']) < 1.2) white += 1;
        const edge = [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ].some(([dx, dy]) => !opaque(x + dx, y + dy));
        if (!edge) continue;
        outline += 1;
        if (ratio(colour, LIGHT_TAB_STRIP) >= NON_TEXT) dark += 1;
      }
    expect(
      white,
      'favicon-48 has no white rim; run npm run icons',
    ).toBeGreaterThan(0);
    expect(
      dark / outline,
      'favicon-48 is not outlined in ink against a light tab strip',
    ).toBeGreaterThan(0.8);
  });
});
