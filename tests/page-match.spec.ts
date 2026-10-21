import { expect, test } from './test';
import { NODE } from './tags';
import { rankPages } from '../src/lib/page-match';
import { builtHtml } from './routes';

/** The 404 finder's ranking (src/lib/page-match.ts): the page a typo meant comes first. */

const PAGES = [
  { title: 'Home', path: '/' },
  { title: 'About', path: '/about/' },
  { title: 'Career', path: '/career/' },
  { title: 'Blog', path: '/blog/' },
  { title: 'Contact', path: '/contact/' },
  { title: 'Contrast', path: '/brand/#contrast' },
  { title: 'Open Source', path: '/blog/open-source/' },
  {
    title: 'Reading Old Records',
    path: '/talks/reading-old-records/',
  },
  { title: 'CV', path: '/cv.pdf' },
  { title: 'Archaeology', path: '/blog/tag/archaeology/' },
  { title: 'Field Notes: What Ohara Taught Me', path: '/blog/sample-post/' },
  { title: 'RSS Feed', path: '/rss.xml' },
];

const CASES: readonly (readonly [string, string])[] = [
  ['/blgo/', '/blog/'],
  ['/contcat', '/contact/'],
  ['/abuot', '/about/'],
  ['/talks/', '/talks/reading-old-records/'],
  ['/tlks/old-records/', '/talks/reading-old-records/'],
  ['/cv', '/cv.pdf'],
  ['/opensource', '/blog/open-source/'],
  ['/blog/tags/archaeology/', '/blog/tag/archaeology/'],
  ['/blog/tag/archaeolgy/', '/blog/tag/archaeology/'],
  ['/rss', '/rss.xml'],
  ['/feed', '/rss.xml'],
];

test.describe('404 page ranking', NODE, () => {
  for (const [typo, meant] of CASES) {
    test(`${typo} finds ${meant} first`, () => {
      expect(rankPages(PAGES, typo)[0]?.path).toBe(meant);
    });
  }

  test('an address like nothing on the site finds nothing', () => {
    expect(rankPages(PAGES, '/xyzzy/')).toEqual([]);
  });
});

test('the 404 page matches against tag pages and the feed', NODE, () => {
  const html = builtHtml().get('/404') ?? '';
  const data = /<script[^>]*id="site-pages"[^>]*>([\s\S]*?)<\/script>/.exec(
    html,
  )?.[1];
  const paths = (JSON.parse(data ?? '[]') as { path: string }[]).map(
    (page) => page.path,
  );
  expect(paths, 'the 404 page lists no tag page').toContainEqual(
    expect.stringMatching(/^\/blog\/tag\/[^/]+\/$/),
  );
  expect(paths, 'the 404 page lists no feed').toContain('/rss.xml');
});
