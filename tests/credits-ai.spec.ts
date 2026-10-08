import { expect, test } from './test';
import { gotoSettled } from './settle';
import { ENGINE_INVARIANT } from './tags';

test.describe('/credits Made with AI', () => {
  test(
    'lists every AI-made drawing with a link to where it is',
    ENGINE_INVARIANT,
    async ({ page }) => {
      await gotoSettled(page, '/credits/');
      const section = page.locator('#ai');
      await expect(
        section.getByRole('heading', { level: 2, name: 'Made with AI' }),
      ).toBeVisible();
      await expect(
        section.getByRole('link', {
          name: 'The About cats and their trick icons',
        }),
      ).toHaveAttribute('href', '/about/');
      await expect(
        section.getByRole('link', {
          name: 'The poneglyph in the homepage field',
        }),
      ).toHaveAttribute('href', '/');
      await expect(
        section.getByRole('link', {
          name: 'The logo cat, its icons and the sharing image',
        }),
      ).toHaveAttribute('href', '/about/');
    },
  );

  test('links the AI disclosure', ENGINE_INVARIANT, async ({ page }) => {
    await gotoSettled(page, '/credits/');
    await expect(
      page.locator('#ai').getByRole('link', { name: 'AI disclosure' }),
    ).toHaveAttribute('href', /\/AI_DISCLOSURE\.md$/);
  });
});
