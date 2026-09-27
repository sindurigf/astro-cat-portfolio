import { expect, test } from './test';
import { gotoSettled } from './settle';

test('the 404 offers a way to report the broken link', async ({ page }) => {
  await gotoSettled(page, '/404');
  const report = page.locator('main a[href="/contact/"]', {
    hasText: /broken link/i,
  });
  await expect(report).toHaveCount(1);
});
