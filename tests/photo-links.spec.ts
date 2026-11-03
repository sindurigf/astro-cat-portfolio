import { expect, test } from './test';
import { gotoSettled } from './settle';
import { builtHtml } from './routes';
import { ENGINE_INVARIANT } from './tags';

/** A photo link's name is its alt plus the hint from PhotoTile.astro (SC 2.4.4, 1.3.1). */
const HINT = ' (opens full size)';
const STRAY_COMMA = /\s,/;

test(
  'every photo link is named by its alt and the full-size hint, with no stray comma',
  ENGINE_INVARIANT,
  async ({ page }) => {
    const routes = [...builtHtml()]
      .filter(([, html]) => /\sdata-photo=/.test(html))
      .map(([route]) => route);
    expect(routes, 'No built page has a photo link.').not.toHaveLength(0);

    for (const route of routes) {
      await gotoSettled(page, route);
      /* getByRole leaves out links hidden from assistive technology, such as a brand sample's mirror. */
      const links = await page
        .getByRole('link')
        .and(page.locator('[data-photo]'))
        .all();
      expect(links.length, `${route} has no photo links.`).toBeGreaterThan(0);

      for (const link of links) {
        const alt = (await link.locator('img').getAttribute('alt')) ?? '';
        expect(alt, `A photo link on ${route} has an empty alt.`).not.toBe('');
        await expect(link).toHaveAccessibleName(`${alt}${HINT}`);
        await expect(link).not.toHaveAccessibleName(STRAY_COMMA);
      }
    }
  },
);
