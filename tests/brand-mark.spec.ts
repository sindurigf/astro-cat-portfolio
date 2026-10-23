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

  test('the tab icon is cut out against both tab strips: ink edge on light, white rim on dark (SC 1.4.11)', () => {
    expect(
      ratio(tokens['gold-text'], LIGHT_TAB_STRIP),
      'the ink edge is under 3:1 on a light tab strip',
    ).toBeGreaterThanOrEqual(NON_TEXT);
    expect(
      ratio(tokens['light-ground'], DARK_TAB_STRIP),
      'the white rim is under 3:1 on a dark tab strip',
    ).toBeGreaterThanOrEqual(NON_TEXT);
  });
});
