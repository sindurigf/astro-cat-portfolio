import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { expect, test } from './test';
import { NODE } from './tags';
import { COUPLED_DOCS, isDocsOnly } from '../scripts/docs-only.mjs';

test.describe('CI docs-only fast path', NODE, () => {
  test('documentation alone skips the browser shards', () => {
    expect(
      isDocsOnly([
        'README.md',
        'docs/DEVELOPMENT.md',
        '.github/CONTRIBUTING.md',
      ]),
    ).toBe(true);
  });

  for (const path of [
    'ACCESSIBILITY.md',
    'ARCHITECTURE.md',
    'SECURITY.md',
    'docs/DEPLOYMENT.md',
    'docs/STYLEGUIDE.md',
    'src/content/blog/post.md',
    'src/content/talks/a/slides.md',
    'tests/fixtures/sample.md',
    'src/pages/index.astro',
    'package.json',
    '.github/workflows/a11y.yml',
    'docs/diagram.png',
  ]) {
    test(`${path} runs the browser shards`, () => {
      expect(isDocsOnly(['README.md', path])).toBe(false);
    });
  }

  test('an empty change list runs the browser shards', () => {
    expect(isDocsOnly([])).toBe(false);
  });

  const SOURCE_ROOTS = ['src', 'tests', 'scripts'];
  const SOURCE_FILE = /\.(?:ts|astro|mjs)$/;
  const READS_FILES = /readFileSync|readFile|\?raw/;
  const DOC_LITERAL =
    /['"`]((?:\.\.?\/)*(?:docs\/|\.github\/)?[\w.-]+\.md)(?:\?raw)?['"`]/g;
  const DOT_RELATIVE = /^\.\.?\//;
  const SELF = /docs-only\.(?:spec\.ts|mjs)$/;

  const docsRead = (file: string): string[] => {
    const source = readFileSync(file, 'utf8');
    if (!READS_FILES.test(source)) return [];
    return [...source.matchAll(DOC_LITERAL)]
      .flatMap((match) => (match[1] ? [match[1]] : []))
      .map((literal) =>
        DOT_RELATIVE.test(literal)
          ? relative('.', resolve(dirname(file), literal))
          : literal,
      )
      .filter((doc) => existsSync(doc));
  };

  test('a relative ?raw import is found', () => {
    expect(docsRead('src/lib/accessibility-facts.ts')).toContain(
      'ACCESSIBILITY.md',
    );
  });

  test('a bare root literal is found', () => {
    expect(docsRead('scripts/check-test-weakening.mjs')).toContain(
      'ARCHITECTURE.md',
    );
  });

  test('every document that code reads is listed as coupled', () => {
    const read = SOURCE_ROOTS.flatMap((root) =>
      readdirSync(root, { recursive: true, encoding: 'utf8' })
        .map((path) => join(root, path))
        .filter((path) => SOURCE_FILE.test(path) && !SELF.test(path)),
    ).flatMap(docsRead);

    const unlisted = [...new Set(read)].filter((doc) => !COUPLED_DOCS.has(doc));
    expect(unlisted, 'add to COUPLED_DOCS in scripts/docs-only.mjs').toEqual(
      [],
    );
  });
});
