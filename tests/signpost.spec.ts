import { expect, test, type Page } from './test';
import { signpostPages } from '../src/lib/signpost-pages';
import { CV_PATH } from '../src/lib/profiles';
import { NO_PUBLISHED_POST, PUBLISHED_POST_ROUTES } from './routes';
import { NODE } from './tags';

/* The 404 page's Cheshire crossroads: the reader chooses each way through the site, the Cat marks the likely one. */

const PAGES = [
  { title: 'Home', path: '/' },
  { title: 'Career', path: '/career/' },
  { title: 'Brand', path: '/brand/' },
  { title: 'Color', path: '/brand/#color' },
  { title: 'Blog', path: '/blog/' },
  { title: 'A Post', path: '/blog/a-post/' },
  { title: 'CV', path: '/cv.pdf' },
  { title: 'A Talk', path: '/talks/a-talk/' },
];

test.describe('the crossroads map', NODE, () => {
  test('each page trails from Home through the pages above it', () => {
    const map = signpostPages(PAGES, '/cv.pdf');
    const trailOf = (path: string) =>
      map.find((page) => page.path === path)!.trail.map((i) => map[i]!.title);
    expect(trailOf('/')).toEqual(['Home']);
    expect(
      trailOf('/brand/#color'),
      'a brand section sits under Brand',
    ).toEqual(['Home', 'Brand', 'Color']);
    expect(trailOf('/blog/a-post/')).toEqual(['Home', 'Blog', 'A Post']);
    expect(trailOf('/cv.pdf'), 'the CV sits under Career').toEqual([
      'Home',
      'Career',
      'CV',
    ]);
    expect(
      trailOf('/talks/a-talk/'),
      'a talk with no /talks/ page hangs off Home',
    ).toEqual(['Home', 'A Talk']);
  });
});

const POST_ROUTE = PUBLISHED_POST_ROUTES[0];
/* The newest post's address with "blog" and the slug's second and third letters swapped. */
const misspelled = (route: string): string => {
  const slug = route.split('/').at(-1)!;
  return `/blgo/${slug[0]}${slug[2]}${slug[1]}${slug.slice(3)}`;
};
const ADDRESS = POST_ROUTE ? misspelled(POST_ROUTE) : '/blgo/';
const pagesList = (page: Page) =>
  page.getByRole('list', { name: /^Down the .* Way$/ });

test.describe('the 404 signpost', () => {
  test('the Cat’s section starts chosen and its pick is the page a misspelled address meant', async ({
    page,
  }) => {
    test.skip(!POST_ROUTE, NO_PUBLISHED_POST);
    await page.goto(ADDRESS, { waitUntil: 'networkidle' });
    await expect(
      page.getByRole('button', { pressed: true }),
      'the Cat’s section is not chosen first',
    ).toHaveAccessibleName(/^Blog \(the Cat went this way\)$/);
    const pick = page.getByRole('link', { name: /The Cat’s pick/ });
    await expect(pick).toHaveAttribute('href', `${POST_ROUTE}/`);
  });

  test('choosing a section lists its pages, announces it and keeps focus on the sign', async ({
    page,
  }) => {
    const careerWay = CV_PATH ? ['Career', 'CV'] : ['Career'];
    await page.goto(ADDRESS, { waitUntil: 'networkidle' });
    const career = page.getByRole('button', { name: 'Career', exact: true });
    await career.focus();
    await page.keyboard.press('Enter');
    await expect(career).toHaveAttribute('aria-pressed', 'true');
    await expect(career, 'focus left the sign').toBeFocused();
    await expect(pagesList(page)).toHaveAccessibleName('Down the Career Way');
    await expect(pagesList(page).getByRole('link')).toHaveText(careerWay);
    await expect(page.locator('#crossroads [aria-live="polite"]')).toHaveText(
      `${careerWay.length} ${careerWay.length === 1 ? 'page' : 'pages'} down the Career way.`,
    );
    await expect(
      page.getByRole('button', { pressed: true }),
      'more than one section is chosen',
    ).toHaveCount(1);
  });

  for (const width of [390, 1280]) {
    test(`at ${width}px every sign and page is at least 44px tall and the page does not scroll sideways`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(ADDRESS, { waitUntil: 'networkidle' });
      const heights = await page
        .locator('.crossroads-sign, .crossroads-page')
        .evaluateAll((targets) =>
          targets.map((target) => target.getBoundingClientRect().height),
        );
      expect(heights.length, 'no signs drawn').toBeGreaterThan(2);
      for (const height of heights) {
        expect(
          height,
          'a target under 44px tall (SC 2.5.5)',
        ).toBeGreaterThanOrEqual(44);
      }
      const overflow = await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      );
      expect(
        overflow,
        'the signpost makes the page scroll sideways',
      ).toBeLessThanOrEqual(0);
    });
  }
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('the main pages are plain links and no crossroads is drawn', async ({
    page,
  }) => {
    await page.goto(ADDRESS);
    await expect(page.locator('.crossroads-sign')).toHaveCount(0);
    await expect(
      page.getByRole('navigation', { name: 'Main pages' }).getByRole('link'),
      'the main pages are the way out without JavaScript',
    ).toHaveText(['Home', 'About', 'Career', 'Blog']);
  });
});
