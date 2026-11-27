import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from './test';
import { isAdvertised, lastmodFor, readPosts } from '../src/lib/sitemap-filter';
import { NODE } from './tags';

const SITE = 'https://example.test';

const POSTS = [
  {
    slug: 'live',
    category: 'talks',
    placeholder: false,
    lastmod: '2026-01-02',
  },
  {
    slug: 'draft',
    category: 'drafts',
    placeholder: true,
    lastmod: '2026-01-03',
  },
];

const advertised = (path: string): boolean =>
  isAdvertised(`${SITE}${path}`, POSTS);

test.describe('isAdvertised (SEO: sitemap entries)', NODE, () => {
  test('leaves out the contact confirmation page and POST target', () => {
    expect(advertised('/contact/sent/')).toBe(false);
    expect(advertised('/contact/send/')).toBe(false);
  });

  test('leaves out tag pages', () => {
    expect(advertised('/blog/tag/example/')).toBe(false);
  });

  test('keeps pages outside the blog, the blog index and its paged listing', () => {
    expect(advertised('/')).toBe(true);
    expect(advertised('/about/')).toBe(true);
    expect(advertised('/blog/')).toBe(true);
    expect(advertised('/blog/page/2/')).toBe(true);
  });

  test('keeps a published post and leaves out a placeholder one', () => {
    expect(advertised('/blog/live/')).toBe(true);
    expect(advertised('/blog/draft/')).toBe(false);
  });

  test('keeps a category with posts and leaves out one without', () => {
    expect(advertised('/blog/talks/')).toBe(true);
    expect(advertised('/blog/empty/')).toBe(false);
  });
});

const withPosts = (files: Record<string, string>): string => {
  const dir = mkdtempSync(join(tmpdir(), 'sitemap-filter-'));
  for (const [name, text] of Object.entries(files)) {
    writeFileSync(join(dir, name), text);
  }
  return dir;
};

const dirs: string[] = [];
const postsIn = (files: Record<string, string>): string => {
  const dir = withPosts(files);
  dirs.push(dir);
  return dir;
};

test.afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

test.describe('readPosts (SEO: sitemap lastmod)', NODE, () => {
  test('dates a post by its updated day, ignoring files that are not Markdown', () => {
    const dir = postsIn({
      'changed.md':
        '---\ncategory: talks\ndate: 2026-01-01\nupdated: 2026-03-04T10:00:00Z\n---\nBody',
      'notes.txt': 'not a post',
    });
    const posts = readPosts(dir);
    expect(posts).toEqual([
      {
        slug: 'changed',
        category: 'talks',
        placeholder: false,
        lastmod: '2026-03-04',
      },
    ]);
    expect(
      lastmodFor(`${SITE}/blog/changed/`, posts),
      'the sitemap lastmod is not the updated day.',
    ).toBe('2026-03-04');
  });

  test('dates a post by its publication day when it has no updated day', () => {
    const dir = postsIn({
      'plain.md':
        '---\ncategory: talks\ndate: 2026-01-01\nplaceholder: true\n---\n',
    });
    expect(readPosts(dir)[0]).toMatchObject({
      lastmod: '2026-01-01',
      placeholder: true,
    });
  });

  test('gives a page that is not a post no lastmod', () => {
    expect(lastmodFor(`${SITE}/about/`, POSTS)).toBeUndefined();
  });
});

test.describe('readPosts (build correctness: malformed posts)', NODE, () => {
  const cases: [string, string, string][] = [
    [
      'no frontmatter',
      'Just prose.',
      'bad.md opens with no frontmatter block.',
    ],
    [
      'frontmatter that is not a mapping',
      '---\n- a\n- b\n---\n',
      'bad.md frontmatter is not a YAML mapping.',
    ],
    [
      'no category',
      '---\ndate: 2026-01-01\n---\n',
      'bad.md has no category in its frontmatter.',
    ],
    [
      'an empty category',
      "---\ncategory: ''\ndate: 2026-01-01\n---\n",
      'bad.md has no category in its frontmatter.',
    ],
    [
      'no date',
      '---\ncategory: talks\n---\n',
      'bad.md has no date in its frontmatter.',
    ],
  ];

  for (const [problem, text, message] of cases) {
    test(`stops the build on a post with ${problem}, naming the file`, () => {
      const dir = postsIn({ 'bad.md': text });
      expect(() => readPosts(dir)).toThrow(message);
    });
  }
});
