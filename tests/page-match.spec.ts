import { expect, test } from './test';
import { NODE } from './tags';
import { rankPages } from '../src/lib/page-match';

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
];

const CASES: readonly (readonly [string, string])[] = [
  ['/blgo/', '/blog/'],
  ['/contcat', '/contact/'],
  ['/abuot', '/about/'],
  ['/talks/', '/talks/reading-old-records/'],
  ['/tlks/old-records/', '/talks/reading-old-records/'],
  ['/cv', '/cv.pdf'],
  ['/opensource', '/blog/open-source/'],
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
