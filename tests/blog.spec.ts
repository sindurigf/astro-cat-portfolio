import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from './test';
import { gotoSettled } from './settle';
import { blogCategories } from './source';
import {
  CATEGORY_ROUTES,
  DIST_DIR,
  frontmatterTags,
  POST_ROUTES,
  postCountByCategory,
  postFrontmatter,
  TAG_ROUTES,
} from './routes';
import { pageCount } from '../src/lib/pagination';
import { NODE } from './tags';

const POST_COUNT = POST_ROUTES.length;
const PAGE_COUNT = pageCount(POST_COUNT);
const PAGINATES = PAGE_COUNT > 1;

/** The href of every post card on the page, in render order. */
const cardHrefs = (page: Page): Promise<string[]> =>
  page.evaluate(() =>
    [...document.querySelectorAll('article.card h2 a')].map(
      (a) => new URL((a as HTMLAnchorElement).href).pathname,
    ),
  );

test.describe('the blog index while every post fits on one page', () => {
  test.skip(
    PAGINATES,
    'the index paginates; tests/blog-pages.spec.ts covers the pager',
  );

  test('lists every post exactly once, with no pager', async ({ page }) => {
    await gotoSettled(page, '/blog');

    const hrefs = await cardHrefs(page);
    expect(
      hrefs.sort(),
      '/blog should list every post once while they fit on one page',
    ).toEqual(POST_ROUTES.map((route) => `${route}/`).sort());

    await expect(
      page.getByRole('navigation', { name: /pagination/i }),
      'a pager with one page offers a single link to the page you are on',
    ).toHaveCount(0);
  });
});

test.describe('the category filter', () => {
  /**
   * `aria-current` is the machine-readable half; the `aria-hidden` marker square
   * is the non-colour half (SC 1.4.1). Both are read so dropping either fails.
   */
  const activeOption = (page: Page) =>
    page.evaluate(() => {
      const nav = document.querySelector(
        'nav[aria-label="Filter posts by category"]',
      );
      if (nav === null) return null;
      const links = [...nav.querySelectorAll('a')];
      const current = links.filter(
        (a) => a.getAttribute('aria-current') === 'page',
      );
      return {
        total: links.length,
        currentCount: current.length,
        href: current[0] ? new URL(current[0].href).pathname : null,
        // The square is aria-hidden, so it is found in the DOM, not the tree.
        markers: links.map((a) => a.querySelector('[aria-hidden]') !== null),
        currentHasMarker:
          current[0] !== undefined &&
          current[0].querySelector('[aria-hidden]') !== null,
      };
    });

  test('exactly one option is current on the unfiltered index', async ({
    page,
  }) => {
    await gotoSettled(page, '/blog');

    const state = await activeOption(page);
    expect(state, '/blog has no category filter').not.toBeNull();
    const filter = state as NonNullable<typeof state>;

    expect(
      filter.total,
      'the filter should offer every category with a post, plus "All posts"',
    ).toBe(LISTED_ROUTES.length + 1);
    expect(filter.currentCount, 'exactly one option is current').toBe(1);
    expect(filter.href, '"All posts" is current on /blog').toBe('/blog/');

    expect(
      filter.markers.filter(Boolean).length,
      'the non-colour marker must appear on the current option and on no ' +
        'other. If every option has one, or none does, the active state is ' +
        'being carried by the gold fill alone (SC 1.4.1).',
    ).toBe(1);
    expect(filter.currentHasMarker).toBe(true);
  });

  const counts = postCountByCategory();

  /* Derived from the Markdown, so it also catches CATEGORY_ROUTES drifting. */
  const LISTED_ROUTES = [...counts.keys()].map(
    (category) => `/blog/${category}`,
  );

  const cardCategoryLabels = (page: Page): Promise<string[]> =>
    page.evaluate(() =>
      [
        ...document.querySelectorAll('article.card .label > span:first-child'),
      ].map((el) => (el.textContent ?? '').trim().toLowerCase()),
    );

  for (const route of CATEGORY_ROUTES) {
    test(`${route} marks its own option, and lists its posts`, async ({
      page,
    }) => {
      await gotoSettled(page, route);

      const state = await activeOption(page);
      const filter = state as NonNullable<typeof state>;

      expect(filter.currentCount, 'exactly one option is current').toBe(1);
      expect(filter.href, `${route} should mark its own filter option`).toBe(
        `${route}/`,
      );
      expect(filter.currentHasMarker).toBe(true);

      /*
       * Every card on a category page carries that category's label. This is
       * what makes the filter a filter rather than six links to the same list.
       */
      const label = route.replace('/blog/', '').replaceAll('-', ' ');
      const labels = await cardCategoryLabels(page);

      const expected = counts.get(route.replace('/blog/', '')) ?? 0;
      expect(
        labels.length,
        `${route} should list the ${expected} post(s) filed under it`,
      ).toBe(expected);

      await expect(
        page.locator('[data-empty-listing]'),
        `${route} lists posts and shows the empty state as well`,
      ).toHaveCount(0);
      expect(
        [...new Set(labels)],
        `${route} listed a post from another category`,
      ).toEqual([label]);
    });
  }

  test('a filter option is followed by pressing a key on it', async ({
    page,
  }) => {
    await gotoSettled(page, '/blog');

    const filter = page.getByRole('navigation', {
      name: /filter posts by category/i,
    });
    const target = LISTED_ROUTES[0] as string;
    const option = filter.locator(`a[href="${target}/"]`);

    await option.focus();
    await expect(option).toBeFocused();

    /* A key press, not click(). click() would pass against a div. */
    await page.keyboard.press('Enter');
    await page.waitForURL(`**${target}/`);

    expect((await activeOption(page))?.href).toBe(`${target}/`);
  });
});

test('the homepage offers a tile for each category with posts, and none without', async ({
  page,
}) => {
  await gotoSettled(page, '/');
  const counts = postCountByCategory();

  for (const category of blogCategories()) {
    const tile = page.locator('li.card', {
      has: page.locator(`h3 a[href="/blog/${category}/"]`),
    });
    const posts = counts.get(category) ?? 0;
    await expect(
      tile,
      posts === 0
        ? `${category} has no posts but has a tile`
        : `${category} has posts but no tile`,
    ).toHaveCount(posts === 0 ? 0 : 1);
  }
});

test('a category with no posts has no page of its own', NODE, () => {
  const counts = postCountByCategory();
  const empty = blogCategories().filter((category) => !counts.has(category));

  expect(
    empty.filter((category) =>
      existsSync(join(DIST_DIR, 'blog', category, 'index.html')),
    ),
    'an empty category was built; it should stay hidden until it has a post.',
  ).toEqual([]);
});

/** A post's `tags`, read from its frontmatter's one-line array. */
const tagsOf = (route: string): string[] =>
  frontmatterTags(postFrontmatter(route.split('/').pop()!));

test.describe('tag listings', () => {
  test('every tag route matches a tag on a post', NODE, () => {
    const fromPosts = [
      ...new Set(POST_ROUTES.flatMap((route) => tagsOf(route))),
    ].map((tag) => `/blog/tag/${tag}`);
    expect(fromPosts.length, 'no post declares a tag').toBeGreaterThan(0);
    expect(
      [...TAG_ROUTES].sort(),
      'TAG_ROUTES and the tags the posts carry disagree',
    ).toEqual(fromPosts.sort());
  });

  test("a post's tags are links to their listings", async ({ page }) => {
    await gotoSettled(page, POST_ROUTES[0]);

    const tags = page.locator('main a[href^="/blog/tag/"]');
    const count = await tags.count();
    expect(
      count,
      `${POST_ROUTES[0]} should render each of its tags as a link`,
    ).toBe(tagsOf(POST_ROUTES[0]).length);

    const href = await tags.first().getAttribute('href');
    expect(
      TAG_ROUTES.map((route) => `${route}/`),
      `${href} is not a built tag route`,
    ).toContain(href);

    await tags.first().focus();
    await expect(tags.first()).toBeFocused();
    await page.keyboard.press('Enter');
    await page.waitForURL(`**${href}`);

    const hrefs = await cardHrefs(page);
    expect(
      hrefs,
      'the tag listing should hold the post the tag was followed from',
    ).toContain(`${POST_ROUTES[0]}/`);
  });

  test('a tag listing marks no category filter option current', async ({
    page,
  }) => {
    await gotoSettled(page, TAG_ROUTES[1]);

    await expect(
      page
        .getByRole('navigation', { name: /filter posts by category/i })
        .locator('a[aria-current="page"]'),
      'no filter option points at a tag listing, so none may claim to be ' +
        'the page you are on',
    ).toHaveCount(0);

    await expect(
      page.getByRole('navigation', { name: /filter posts by category/i }),
      'the filter is still offered, as the way back to the categories',
    ).toBeVisible();
  });
});

/*
 * `/blog/<x>/` can be both a post id and a category. Astro keeps the category:
 * its route comparator falls through to `localeCompare`, where `[category]`
 * sorts before `[slug]`, and the post is silently not built.
 */
test.describe('a post and a category cannot claim one path', () => {
  test('the build fails on two routes that generate one path', NODE, () => {
    expect(
      readFileSync('astro.config.mjs', 'utf8'),
      "without prerenderConflictBehavior: 'error' Astro only warns, and the " +
        'dropped page is missing from a build that reports success.',
    ).toMatch(/prerenderConflictBehavior:\s*'error'/);
  });

  test('no post id is also a category name', NODE, () => {
    const categories = CATEGORY_ROUTES.map((route) => route.split('/').pop());
    const collisions = POST_ROUTES.filter((route) =>
      categories.includes(route.split('/').pop()),
    );

    expect(
      collisions,
      'a post is named after a category, so one of the two pages is dropped. ' +
        'Rename the post file: its id comes from the filename, and the ' +
        'category names in src/content.config.ts are fixed by the schema.',
    ).toEqual([]);
  });
});
