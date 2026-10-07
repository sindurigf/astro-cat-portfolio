import { readFileSync } from 'node:fs';
import { expect, test } from './test';
import { ratio, readTokens } from '../scripts/contrast-table.mjs';
import { NODE } from './tags';
import { AA_TEXT, NON_TEXT } from './contrast';

/**
 * The logo cat (src/lib/brand-mark.ts) on every ground it meets: dark header
 * and footer, white light-mode pages, light and dark browser tabs.
 */

/** Chrome's light tab strip: the darkest light ground a tab icon sits on. */
const LIGHT_TAB_STRIP = '#DEE1E6';

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
    for (const coat of ['cat-mochi', 'cat-mochi-orange']) {
      expect(
        ratio(tokens['gold-text'], tokens[coat]),
        `the face ink is under 4.5:1 on --color-${coat}`,
      ).toBeGreaterThanOrEqual(AA_TEXT);
    }
  });

  test('the tab icon carries an ink rim, which holds 3:1 on a light tab strip', () => {
    expect(
      ratio(tokens['tile-edge'], LIGHT_TAB_STRIP),
      'the blue edge alone now passes on a light tab strip: the rim may go',
    ).toBeLessThan(NON_TEXT);
    expect(ratio(tokens['gold-text'], LIGHT_TAB_STRIP)).toBeGreaterThanOrEqual(
      NON_TEXT,
    );
    expect(
      readFileSync('public/favicon.svg', 'utf8').toUpperCase(),
      'public/favicon.svg has no ink rim; run npm run icons',
    ).toContain(`STROKE="${tokens['gold-text']}"`);
  });
});
