import { expect, test } from './test';
import { gotoSettled } from './settle';

/* Inclusive Components "Cards": the card is one click target, and its text stays selectable. */
test.describe('a blog card', () => {
  test('lets a drag select its teaser without following the link', async ({
    page,
  }) => {
    await gotoSettled(page, '/blog/');
    const teaser = page.locator('.card:has(.card-link) p').first();
    await teaser.scrollIntoViewIfNeeded();
    /* Along the first line: the box's middle falls between two lines and selects nothing. */
    const line = await teaser.evaluate((element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      const { left, right, top, bottom } = range.getClientRects()[0]!;
      return { left, right, y: (top + bottom) / 2 };
    });
    await page.mouse.move(line.left + 2, line.y);
    await page.mouse.down();
    await page.mouse.move(line.right - 2, line.y, { steps: 8 });
    await page.mouse.up();
    expect(
      await page.evaluate(() => String(getSelection()).trim().length),
      'dragging across the teaser selected no text',
    ).toBeGreaterThan(0);
    await expect(page, 'a text selection followed the card link').toHaveURL(
      /\/blog\/$/,
    );
  });

  test('follows its title link on a click anywhere on the card', async ({
    page,
  }) => {
    await gotoSettled(page, '/blog/');
    const card = page.locator('.card:has(.card-link)').first();
    const href = await card.locator('.card-link').getAttribute('href');
    await card.locator('p').first().click();
    await expect(page).toHaveURL(new RegExp(`${href}$`));
  });
});
