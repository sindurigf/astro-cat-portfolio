import { expect, test } from './test';
import { builtFixture, runCheck, type Files } from './check-fixture';
import { NODE } from './tags';

const SCRIPT = 'scripts/check-images-of-text.mjs';
const CLEAN_PAGE = '<html><body><svg><path d="M0 0"/></svg></body></html>';

const tree = (extra: Files = {}): Files => ({
  'dist/client/index.html': CLEAN_PAGE,
  'src/lib/draw.ts': 'export const draw = () => 1;',
  ...extra,
});

const failing = (extra: Files, culprit: string) => {
  const { status, output } = runCheck(SCRIPT, builtFixture(tree(extra)));
  expect(status, output).toBe(1);
  expect(output).toContain(culprit);
};

test.describe('check:images-of-text (WCAG 2.2 AA, SC 1.4.5)', NODE, () => {
  test('passes a build with no text drawn as an image', () => {
    const { status, output } = runCheck(SCRIPT, builtFixture(tree()));
    expect(status, output).toBe(0);
  });

  test('fails an SVG file with <text> and names it', () => {
    failing(
      { 'public/logo.svg': '<svg><text>Hi</text></svg>' },
      'public/logo.svg',
    );
  });

  test('fails an SVG file with <tspan>', () => {
    failing(
      { 'src/assets/mark.svg': '<svg><tspan>Hi</tspan></svg>' },
      'src/assets/mark.svg',
    );
  });

  test('fails an inline SVG with <text> in built HTML', () => {
    failing(
      {
        'dist/client/about/index.html':
          '<body><svg><text>Hi</text></svg></body>',
      },
      'dist/client/about/index.html',
    );
  });

  test('fails canvas fillText in a source file', () => {
    failing(
      { 'src/scripts/art.ts': 'ctx.fillText("Hi", 0, 0);' },
      'src/scripts/art.ts',
    );
  });

  test('fails canvas strokeText in a source file', () => {
    failing(
      { 'src/scripts/art.js': 'ctx.strokeText("Hi", 0, 0);' },
      'src/scripts/art.js',
    );
  });

  test('does not read <text> outside an SVG in built HTML as drawn text', () => {
    const { status, output } = runCheck(
      SCRIPT,
      builtFixture(
        tree({
          'dist/client/index.html': '<body><p>a <text>b</text></p></body>',
        }),
      ),
    );
    expect(status, output).toBe(0);
  });
});
