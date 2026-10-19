import { expect, test } from './test';
import { gotoSettled } from './settle';
import { SAMPLED_ROUTES } from './routes';

/*
 * Safari and VoiceOver drop list semantics from a list styled without markers,
 * except inside <nav>; role="list" restores them
 * (https://www.scottohara.me/blog/2019/01/12/lists-and-safari.html).
 */
for (const route of SAMPLED_ROUTES) {
  test(`${route} keeps every unmarked list a list`, async ({ page }) => {
    await gotoSettled(page, route);
    const bare = await page.evaluate(() =>
      [...document.querySelectorAll('ul, ol')]
        .filter(
          (list) =>
            getComputedStyle(list).listStyleType === 'none' &&
            !list.closest('nav') &&
            list.getAttribute('role') !== 'list',
        )
        .map((list) => `${list.tagName.toLowerCase()}.${list.className}`),
    );
    expect(bare, `${route} has lists without markers or role="list"`).toEqual(
      [],
    );
  });
}
