import { expect, test } from './test';
import { gotoSettled } from './settle';
import { MOTTO } from '../src/lib/site';

/** The two sections about the name, on /about and /credits. */

test('the two name sections link to each other', async ({ page }) => {
  await gotoSettled(page, '/about');
  await expect(page.locator('main a[href*="/credits/#name"]')).toHaveCount(1);
  await gotoSettled(page, '/credits');
  await expect(page.locator('main a[href*="/about/#motto"]')).toHaveCount(1);
});

/*
 * What a reader copies, not the accessible name. The hidden "Why" is out of flow,
 * so an ordinary space beside it collapses: Chromium glues "WHY" to the motto.
 */
test('"Why" and the motto copy with a space between them', async ({ page }) => {
  await gotoSettled(page, '/about');
  const copied = await page.evaluate(() => {
    const heading = document.getElementById('motto-heading')!;
    const range = document.createRange();
    range.selectNodeContents(heading);
    const selection = getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    return selection.toString();
  });
  expect(copied.toLowerCase()).toMatch(
    new RegExp(`^why\\s+${RegExp.escape(MOTTO.text.toLowerCase())}$`),
  );
});
