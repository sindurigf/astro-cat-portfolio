import { expect, test } from './test';
import { gotoSettled } from './settle';
import { CONTENTS_POST_ROUTE, NO_CONTENTS_POST, TALK_ROUTES } from './routes';

/** A4 at 96 dpi, the page a talk prints on in tests; any page size behaves the same. */
const A4 = { width: 794, height: 1123 } as const;
/** A PDF page object; `/Type /Pages` is the tree root, not a page. */
const PDF_PAGE = /\/Type\s*\/Page(?!s)/g;

test.use({ viewport: A4 });

/* SC 1.3.2: each slide is one printed page, the cover included, with nothing spilled onto a blank one. */
for (const route of TALK_ROUTES) {
  test(`${route} prints one slide per page`, async ({ page }) => {
    await gotoSettled(page, route);
    await page.emulateMedia({ media: 'print' });
    const slides = await page.evaluate(() =>
      [...document.querySelectorAll('.slide')].map((slide) => {
        const box = slide.getBoundingClientRect();
        return { top: box.top + scrollY, left: box.left, height: box.height };
      }),
    );
    expect(slides.length, `${route} has no slides`).toBeGreaterThan(0);
    slides.forEach((slide, index) => {
      expect(
        slide.top,
        `slide ${index + 1} does not start at its page's top`,
      ).toBeCloseTo(index * A4.height, 0);
      expect(
        slide.height,
        `slide ${index + 1} is not one page tall`,
      ).toBeCloseTo(A4.height, 0);
      expect(
        slide.left,
        `slide ${index + 1} is moved off its page's edge`,
      ).toBeGreaterThanOrEqual(0);
    });
  });

  test(`${route} prints no page that holds no slide`, async ({
    page,
    browserName,
  }) => {
    test.skip(
      browserName !== 'chromium',
      'Only Chromium prints to PDF in Playwright',
    );
    await gotoSettled(page, route);
    const slides = await page.locator('.slide').count();
    const pdf = (
      await page.pdf({ width: `${A4.width}px`, height: `${A4.height}px` })
    ).toString('latin1');
    expect(
      pdf.match(PDF_PAGE)?.length,
      `${route} prints a page that holds no slide`,
    ).toBe(slides);
  });
}

/* SC 1.3.1: a printed post keeps its contents list; a closed disclosure would print only its summary. */
test('a post prints its In This Post list open', async ({ page }) => {
  test.skip(!CONTENTS_POST_ROUTE, NO_CONTENTS_POST);
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
