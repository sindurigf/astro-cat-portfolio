import { expect, test, type Page } from './test';
import { gotoSettled } from './settle';
import { PUBLISHED_POST_ROUTES } from './routes';
import { indexPageHref } from '../src/lib/paths';
import { WORKER_POSTS_PER_PAGE } from '../playwright.worker.config';

/** The /blog pager, built by playwright.worker.config.ts at WORKER_POSTS_PER_PAGE so today's posts span pages. */

const POST_COUNT = PUBLISHED_POST_ROUTES.length;
const PAGE_COUNT = Math.ceil(POST_COUNT / WORKER_POSTS_PER_PAGE);

/** Full pages, then the remainder on the last. */
const cardsOnPage = (page: number): number =>
  Math.min(
    WORKER_POSTS_PER_PAGE,
    POST_COUNT - (page - 1) * WORKER_POSTS_PER_PAGE,
  );

/** The href of every post card on the page, in render order. */
const cardHrefs = (page: Page): Promise<string[]> =>
  page.evaluate(() =>
    [...document.querySelectorAll('article.card h2 a')].map(
      (a) => new URL((a as HTMLAnchorElement).href).pathname,
    ),
  );

const pager = (page: Page) =>
  page.getByRole('navigation', { name: 'Pagination' });

const HAS_SECOND_PAGE = PAGE_COUNT > 1;
const NO_SECOND_PAGE = `${POST_COUNT} published posts at ${WORKER_POSTS_PER_PAGE} a page make no second page`;

test('page one holds exactly one page of posts', async ({ page }) => {
  test.skip(!HAS_SECOND_PAGE, NO_SECOND_PAGE);
  await gotoSettled(page, '/blog/');

  expect(
    await cardHrefs(page),
    `/blog should render ${WORKER_POSTS_PER_PAGE} cards, one page of posts`,
  ).toHaveLength(WORKER_POSTS_PER_PAGE);
});

test('every page holds its share, and nothing is lost or repeated', async ({
  page,
}) => {
  const shown: string[] = [];

  for (let number = 1; number <= PAGE_COUNT; number += 1) {
    await gotoSettled(page, indexPageHref(number));
    const hrefs = await cardHrefs(page);
    expect(hrefs.length, `${indexPageHref(number)} post count`).toBe(
      cardsOnPage(number),
    );
    shown.push(...hrefs);
  }

  /* The set, not just the count: a slice that drops one post and repeats another keeps every count right. */
  expect(
    shown.sort(),
    'the pages between them must show every post exactly once',
  ).toEqual(PUBLISHED_POST_ROUTES.map((route) => `${route}/`).sort());
});

test('the pager is a named landmark, marks the current page, and reaches page two by keyboard', async ({
  page,
}) => {
  test.skip(!HAS_SECOND_PAGE, NO_SECOND_PAGE);
  await gotoSettled(page, '/blog/');

  await expect(
    pager(page),
    'the pager must be a named landmark; there are three navs on this page',
  ).toBeVisible();
  const current = pager(page).locator('a[aria-current="page"]');
  await expect(current, 'page one is not marked current').toHaveCount(1);
  await expect(current).toHaveAccessibleName('Page 1');

  const pageTwo = pager(page).getByRole('link', { name: 'Page 2' });
  await pageTwo.focus();
  await expect(pageTwo).toBeFocused();
  await page.keyboard.press('Enter');
  await page.waitForURL('**/blog/page/2/');

  expect(
    await cardHrefs(page),
    'following "Page 2" should land on the second page of posts',
  ).toHaveLength(cardsOnPage(2));
  await expect(
    current,
    'the current page is not marked, or is no longer a link',
  ).toHaveAccessibleName('Page 2');
});
