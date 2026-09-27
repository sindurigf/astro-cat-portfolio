import { expect, test } from './test';
import { frontmatterOf, POST_ROUTES, postFrontmatter } from './routes';
import { NODE } from './tags';

/**
 * `frontmatterOf` (tests/routes.ts, mirrored by src/lib/sitemap-filter.ts) must
 * stop at the closing `---`: an unbounded search answers absent keys from the prose.
 */
const BODY_KEYS = ['updated: 2026-01-01', 'placeholder: true', 'cover: x.jpg'];

test.describe('the frontmatter bound', NODE, () => {
  test('a body line matching a key is not part of the frontmatter', () => {
    const source = [
      '---',
      'title: Real',
      'date: 2026-07-10',
      '---',
      '',
      'Prose about frontmatter:',
      '',
      ...BODY_KEYS,
      '',
      'More prose.',
    ].join('\n');

    const frontmatter = frontmatterOf(source, 'probe.md');

    expect(frontmatter).toBe('title: Real\ndate: 2026-07-10');

    for (const line of BODY_KEYS) {
      const key = line.split(':')[0]!;
      expect(
        new RegExp(`^${key}:`, 'm').test(frontmatter),
        `"${line}" is in the body, so ${key} must read as absent`,
      ).toBe(false);
    }
  });

  test('a second --- later in the file does not extend the block', () => {
    const source = ['---', 'title: Real', '---', '', 'Text.', '', '---', ''];

    expect(frontmatterOf(source.join('\n'), 'probe.md')).toBe('title: Real');
  });

  /* CRLF, because a post edited on Windows still has to parse. */
  test('a file with CRLF line endings parses', () => {
    expect(
      frontmatterOf('---\r\ntitle: Real\r\n---\r\n\r\nText.\r\n', 'probe.md'),
    ).toBe('title: Real');
  });

  /** Throws: an empty string would read as a post with no fields. */
  test('a file with no frontmatter is named, not silently empty', () => {
    expect(() => frontmatterOf('Just prose.\n', 'probe.md')).toThrow(
      'probe.md opens with no frontmatter block.',
    );
  });

  test('every post on disk parses through the helper', () => {
    for (const route of POST_ROUTES) {
      const slug = route.split('/').pop()!;
      expect(
        postFrontmatter(slug),
        `${slug}.md has no readable frontmatter`,
      ).toMatch(/^title:/m);
    }
  });
});
