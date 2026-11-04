import type { Page } from './test';

/** The report band above the header: an `<aside>` landmark (`src/components/Header.astro`). */
export const reportBand = (page: Page) =>
  page.getByRole('complementary', { name: 'Accessibility help' });

/** Scrolls the report band out of view, so the full header sits at the top. */
export const scrollPastReportBand = async (page: Page): Promise<void> => {
  const bottom = await reportBand(page).evaluate(
    (band) => band.getBoundingClientRect().bottom,
  );
  await page.evaluate((y) => window.scrollTo(0, y), bottom);
};
