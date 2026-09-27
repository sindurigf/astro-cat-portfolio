import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from './test';
import {
  BLOG_CONTENT_DIR,
  frontmatterField,
  postFrontmatter,
  DIST_DIR,
  POST_ROUTES,
  routesFromBuild,
} from './routes';
import { NODE } from './tags';

/**
 * Drift here is silent: a stale line may still resolve with a wrong
 * description, and the only readers are machines. So links are checked against
 * the build and the post list for completeness.
 */

const LLMS_TXT = join(DIST_DIR, 'llms.txt');

const llmsTxt = (): string => {
  expect(
    existsSync(LLMS_TXT),
    `${LLMS_TXT} was not built by src/pages/llms.txt.ts.`,
  ).toBe(true);

  return readFileSync(LLMS_TXT, 'utf8');
};

const PLACEHOLDER_MARK = '(placeholder)';

// Two lorem words in a title and teaser is lorem; one could be a real mention.
const LOREM_WORDS =
  /\b(lorem|ipsum|dolor|consectetur|adipiscing|eiusmod|tempor|incididunt|labore|veniam|nostrud|exercitation|ullamco|laboris|aliquip|commodo|consequat|irure|reprehenderit|voluptate|cillum|fugiat|pariatur|excepteur|occaecat|cupidatat|proident|officia|deserunt|mollit|perspiciatis|voluptatem|quisquam|quibusdam|temporibus|nemo)\b/gi;
const LOREM_THRESHOLD = 2;

interface PostSource {
  slug: string;
  placeholder: string | undefined;
  text: string;
}

/** Line patterns, not a YAML parser: every post writes these fields on one line. */
const postSources = (): PostSource[] =>
  readdirSync(BLOG_CONTENT_DIR)
    .filter((name) => name.endsWith('.md'))
    .map((name) => {
      const frontmatter = postFrontmatter(name);
      const field = (key: string) => frontmatterField(frontmatter, key);
      return {
        slug: name.replace(/\.md$/, ''),
        placeholder: field('placeholder'),
        text: `${field('title') ?? ''} ${field('teaser') ?? ''}`,
      };
    });

const looksLorem = (text: string): boolean =>
  (text.match(LOREM_WORDS) ?? []).length >= LOREM_THRESHOLD;

const links = (source: string): string[] =>
  [...source.matchAll(/\]\(([^)]+)\)/g)].map((match) => match[1]!);

test.describe('llms.txt', NODE, () => {
  test('every link is absolute', () => {
    // Handed around as text, the file has no base URL to resolve a relative link against.
    const found = links(llmsTxt());
    expect(found.length, 'llms.txt has no Markdown links').toBeGreaterThan(0);
    for (const link of found) {
      expect(
        link.startsWith('https://'),
        `llms.txt links to "${link}", which is relative.`,
      ).toBe(true);
    }
  });

  test('every page or file it names is in the build', () => {
    const built = new Set(routesFromBuild());
    const named = links(llmsTxt()).map((link) => new URL(link).pathname);
    expect(named.length, 'llms.txt names no page').toBeGreaterThan(0);

    /* A page by route, or a generated file (feed, sitemap, Markdown copy) on disk. */
    const missing = named.filter(
      (path) =>
        !built.has(path === '/' ? '/' : path.replace(/\/$/, '')) &&
        !existsSync(join(DIST_DIR, path)),
    );

    expect(
      missing,
      'llms.txt names page(s) the build did not emit: ' + missing.join(', '),
    ).toEqual([]);
  });

  test('every post is listed', () => {
    const listed = new Set(
      links(llmsTxt())
        .map((link) => new URL(link).pathname.replace(/\/$/, ''))
        .filter((path) => path.startsWith('/blog/')),
    );

    // POST_ROUTES is itself held to the content directory and to dist/.
    const missing = POST_ROUTES.filter((route) => !listed.has(route));

    expect(
      missing,
      `llms.txt does not list these posts: ${missing.join(', ')}`,
    ).toEqual([]);
  });

  test('the placeholder field matches the text', () => {
    const wrong = postSources()
      .filter(
        ({ placeholder, text }) => placeholder !== String(looksLorem(text)),
      )
      .map(({ slug, placeholder }) => `${slug} (placeholder: ${placeholder})`);

    expect(
      wrong,
      `These posts' placeholder flag contradicts their title and teaser: ${wrong.join(', ')}`,
    ).toEqual([]);
  });

  test('every placeholder post is marked, and only those', () => {
    const text = llmsTxt();
    const lineFor = (slug: string): string =>
      text.split('\n').find((line) => line.includes(`/blog/${slug}/)`)) ?? '';

    const wrong = postSources()
      .filter(
        ({ slug, placeholder }) =>
          lineFor(slug).endsWith(PLACEHOLDER_MARK) !== (placeholder === 'true'),
      )
      .map(({ slug }) => slug);

    expect(
      wrong,
      `llms.txt marks these posts wrongly with ${PLACEHOLDER_MARK}: ${wrong.join(', ')}`,
    ).toEqual([]);

    const anyPlaceholder = postSources().some(
      ({ placeholder }) => placeholder === 'true',
    );
    expect(
      text.includes(`Posts marked ${PLACEHOLDER_MARK}`),
      'The placeholder note appears only while some post carries the mark.',
    ).toBe(anyPlaceholder);
  });
});
