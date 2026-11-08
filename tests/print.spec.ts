import { expect, test } from './test';
import { gotoSettled } from './settle';
import { CONTENTS_POST_ROUTE, NO_CONTENTS_POST } from './routes';
import { requireContent } from './content';

/** A4 at 96 dpi; any page size behaves the same. */
const A4 = { width: 794, height: 1123 } as const;

test.use({ viewport: A4 });

/* SC 1.3.1: a printed post keeps its contents list; a closed disclosure would print only its summary. */
test('a post prints its In This Post list open', async ({ page }) => {
  requireContent(CONTENTS_POST_ROUTE, NO_CONTENTS_POST);
  await gotoSettled(page, CONTENTS_POST_ROUTE!);
  await page.emulateMedia({ media: 'print' });
  const contents = page.locator('details[data-post-contents]');
  await expect(contents, 'the contents are closed on paper').toHaveAttribute(
    'open',
    '',
  );
  await expect(
    contents.getByRole('link').first(),
    'the contents links do not print',
  ).toBeVisible();
});
