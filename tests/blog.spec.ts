import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from './test';
import { itemAt } from '../src/lib/defined';
import { gotoSettled } from './settle';
import { blogCategories } from './source';
import {
  CATEGORY_ROUTES,
  DIST_DIR,
  POST_ROUTES,
  POSTS,
  postCountByCategory,
  PUBLISHED_POST_ROUTES,
  TAG_ROUTES,
  NO_PUBLISHED_POST,
} from './routes';
import { pageCount } from '../src/lib/pagination';
import { ENGINE_INVARIANT, NODE } from './tags';

const POST_COUNT = PUBLISHED_POST_ROUTES.length;
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
    ).toEqual(PUBLISHED_POST_ROUTES.map((route) => `${route}/`).sort());

    await expect(
      page.getByRole('navigation', { name: /pagination/i }),
      'a pager with one page offers a single link to the page you are on',
    ).toHaveCount(0);
  });
});

test('the post /blog features has a cover', NODE, () => {
  const feature = POSTS.find((post) => post.published);
  test.skip(feature === undefined, 'no published post, so no feature card');
  expect(
    feature!.hasCover,
    `${feature!.route} is the newest post, so /blog features it with its cover.`,
  ).toBe(true);
});

test.describe('the category filter', () => {
  /**
   * `aria-current` is the machine-readable half; the `aria-hidden` marker square
   * is the non-color half (SC 1.4.1). Both are read so dropping either fails.
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

  test(
    'exactly one option is current on the unfiltered index',
    ENGINE_INVARIANT,
    async ({ page }) => {
      await gotoSettled(page, '/blog');

      const state = await activeOption(page);
      expect(state, '/blog has no category filter').not.toBeNull();
      const filter = state as NonNullable<typeof state>;

      expect(
        filter.total,
        'the filter should offer every category with a post, plus "All Posts"',
      ).toBe(CATEGORY_ROUTES.length + 1);
      expect(filter.currentCount, 'exactly one option is current').toBe(1);
      expect(filter.href, '"All Posts" is current on /blog').toBe('/blog/');

      expect(
        filter.markers.filter(Boolean).length,
        'the non-color marker must appear on the current option and on no ' +
          'other. If every option has one, or none does, the active state is ' +
          'being carried by the gold fill alone (SC 1.4.1).',
      ).toBe(1);
      expect(filter.currentHasMarker).toBe(true);
    },
  );

  const counts = postCountByCategory();

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
    test.skip(CATEGORY_ROUTES.length === 0, NO_PUBLISHED_POST);
    await gotoSettled(page, '/blog');

    const filter = page.getByRole('navigation', {
      name: /filter posts by category/i,
    });
    const target = itemAt(CATEGORY_ROUTES, 0);
    const option = filter.locator(`a[href="${target}/"]`);

    await option.focus();
    await expect(option).toBeFocused();

    /* A key press, not click(). click() would pass against a div. */
    await page.keyboard.press('Enter');
    await page.waitForURL(`**${target}/`);

    expect((await activeOption(page))?.href).toBe(`${target}/`);
  });
});

test(
  'the homepage offers a tile for each category with posts, and none without',
  ENGINE_INVARIANT,
  async ({ page }) => {
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
  },
);

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

/** A published post with tags, so its tag links lead to built listings. */
const TAGGED = POSTS.find((post) => post.published && post.tags.length > 0);

test.describe('tag listings', () => {
  test("a post's tags are links to their listings", async ({ page }) => {
    test.skip(!TAGGED, 'no published post has a tag');
    const { route, tags: declared } = TAGGED!;
    await gotoSettled(page, route);

    const tags = page.locator('main a[href^="/blog/tag/"]');
    const count = await tags.count();
    expect(count, `${route} should render each of its tags as a link`).toBe(
      declared.length,
    );

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
    ).toContain(`${route}/`);
  });

  test('a tag listing marks no category filter option current', async ({
    page,
  }) => {
    test.skip(TAG_ROUTES.length === 0, 'no published post has a tag');
    await gotoSettled(page, itemAt(TAG_ROUTES, 0));

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

/* Function: every card shows its post's cover. Accessibility: a cropped thumbnail is decorative (H67), the newest post's whole cover keeps its alt (SC 1.1.1). Performance: only the first card loads eagerly. */
const NEWEST = POSTS.find((post) => post.published);

const cardCovers = (page: Page) =>
  page.evaluate(async () => {
    const cards = [...document.querySelectorAll('main article.card')].filter(
      (card) => card.querySelector('.card-link'),
    );
    const thumbnails = document.querySelectorAll(
      'img[data-card-thumbnail]',
    ).length;
    const covers = await Promise.all(
      cards.map(async (card) => {
        const img = card.querySelector<HTMLImageElement>('.aspect-frame img');
        const loading = img?.getAttribute('loading') ?? null;
        if (img) {
          img.loading = 'eager';
          await img.decode().catch(() => undefined);
        }
        return {
          href: new URL(
            card.querySelector<HTMLAnchorElement>('.card-link')!.href,
          ).pathname,
          alt: img?.getAttribute('alt') ?? null,
          loading,
          thumbnail: img?.closest('.aspect-square') !== null,
          whole:
            img
              ?.closest('.aspect-frame')
              ?.querySelector(':scope > .aspect-sizer') != null,
          square: img ? img.naturalWidth === img.naturalHeight : false,
          marked: img?.hasAttribute('data-card-thumbnail') ?? false,
        };
      }),
    );
    return { covers, thumbnails };
  });

for (const route of [
  '/blog',
  '/',
  '/brand',
  ...CATEGORY_ROUTES,
  ...TAG_ROUTES,
]) {
  test(
    `every post card on ${route} shows its cover`,
    ENGINE_INVARIANT,
    async ({ page }) => {
      await gotoSettled(page, route);
      const { covers, thumbnails } = await cardCovers(page);
      expect(covers.length, `${route} shows no post card`).toBeGreaterThan(0);
      expect(
        thumbnails,
        `an empty alt marked data-card-thumbnail on ${route} sits outside a post card`,
      ).toBe(covers.filter((cover) => cover.marked).length);
      const newestShownLarge = route === '/blog' || route === '/';

      for (const [index, cover] of covers.entries()) {
        const large = newestShownLarge && cover.href === `${NEWEST?.route}/`;
        expect(
          cover.alt,
          `${cover.href} on ${route} has no cover`,
        ).not.toBeNull();
        if (large) {
          expect(
            cover.alt,
            `the newest post's whole cover on ${route} must keep its coverAlt`,
          ).toBe(NEWEST?.coverAlt);
          expect(
            cover.whole,
            `the newest post's cover on ${route} must be drawn whole in its own ratio`,
          ).toBe(true);
          continue;
        }
        expect(
          cover.thumbnail,
          `${cover.href} on ${route} is not the newest post, so it shows a square thumbnail`,
        ).toBe(true);
        expect(
          cover.alt,
          `the thumbnail for ${cover.href} repeats the heading, so it must be decorative`,
        ).toBe('');
        expect(
          cover.square,
          `the thumbnail for ${cover.href} is a CSS crop, not a square file`,
        ).toBe(true);
        if (index > 0)
          expect(
            cover.loading,
            `the thumbnail for ${cover.href} is below the first card, so it must load lazily`,
          ).toBe('lazy');
      }
    },
  );
}
