import { expect, test } from './test';
import { builtFixture, runCheck } from './check-fixture';
import { HOOKS } from '../scripts/check-classes.mjs';
import { NODE } from './tags';

const SCRIPT = 'scripts/check-classes.mjs';
const PAGE = 'dist/client/index.html';
const UNSTYLED = 'missing-token';

/* Every hook used without CSS, so none reads as stale. */
const hookMarkup = (): string =>
  [...(HOOKS as Map<string, string>).keys()]
    .map((hook) => `<span class="${hook}"></span>`)
    .join('');

const built = (classes: string) =>
  builtFixture({
    [PAGE]: `<!doctype html><html><head><link rel="stylesheet" href="/_astro/site.css"><style>.inline{margin:0}</style></head><body><p class="${classes}">Text</p>${hookMarkup()}</body></html>`,
    'dist/client/_astro/site.css':
      '.lead{color:red}.hover\\:lead:hover{color:blue}',
    'src/components/Card.astro': `<p class="lead ${UNSTYLED}">Text</p>\n`,
  });

test.describe('check:classes', NODE, () => {
  test('passes classes defined in a linked or inline stylesheet', () => {
    const { status, output } = runCheck(
      SCRIPT,
      built('lead hover:lead inline'),
    );
    expect(status, output).toBe(0);
  });

  test('fails a class with no CSS and names the class, page and source', () => {
    const { status, output } = runCheck(SCRIPT, built(`lead ${UNSTYLED}`));
    expect(status, output).not.toBe(0);
    expect(output).toContain(UNSTYLED);
    expect(output).toContain(PAGE);
    expect(output).toContain('src/components/Card.astro');
  });
});
