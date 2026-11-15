import { expect, test } from './test';
import { fixture, runCheck } from './check-fixture';
import { NODE } from './tags';

const SCRIPT = 'scripts/check-css-properties.mjs';
const STYLE_FILE = 'src/styles/components/sample.css';

const run = (css: string) => runCheck(SCRIPT, fixture({ [STYLE_FILE]: css }));

test.describe('check:css', NODE, () => {
  test('fails an unknown property and names the file and line', () => {
    const { status, output } = run(
      '.a { color: red; }\n.b { text-decoration-thinness: 2px; }\n',
    );
    expect(status, output).not.toBe(0);
    expect(output).toContain(`${STYLE_FILE}:2`);
    expect(output).toContain('text-decoration-thinness');
  });

  test('fails an unknown property in an Astro style block', () => {
    const root = fixture({
      'src/components/Sample.astro':
        '<p>Text</p>\n<style>\n  p { text-decoration-thinness: 2px; }\n</style>\n',
    });
    const { status, output } = runCheck(SCRIPT, root);
    expect(status, output).not.toBe(0);
    expect(output).toContain('src/components/Sample.astro:3');
  });

  test('passes custom, vendor-prefixed, Tailwind and at-rule descriptor declarations', () => {
    const { status, output } = run(
      [
        '@reference "../global.css";',
        '@font-face { font-display: swap; src: url(a.woff2); }',
        '@property --angle { syntax: "<angle>"; inherits: false; initial-value: 0deg; }',
        '@page { margin: 0; size: A4; }',
        '@layer components { .a { @apply p-4; --token: 1px; -webkit-text-stroke: 1px; -moz-nonexistent: 1; text-decoration-thickness: 2px; } }',
        '',
      ].join('\n'),
    );
    expect(status, output).toBe(0);
  });

  test('fails a prefix that no browser uses', () => {
    const { status, output } = run('.a { -x-anything: 1; }\n');
    expect(status, output).not.toBe(0);
    expect(output).toContain('-x-anything');
  });

  test('fails a misspelled descriptor inside an at-rule', () => {
    const { status, output } = run('@font-face { font-displya: swap; }\n');
    expect(status, output).not.toBe(0);
    expect(output).toContain('font-displya');
  });

  test('reports CSS that does not parse as one line, not a stack dump', () => {
    const root = fixture({
      'src/components/Vars.astro':
        '<style define:vars={{ a > b }}>\n  p { color: red; }\n</style>\n',
    });
    const { status, output } = runCheck(SCRIPT, root);
    expect(status, output).not.toBe(0);
    expect(output).toContain('src/components/Vars.astro:');
    expect(output).not.toContain('    at ');
  });

  test('fails when the tree has no source file to check', () => {
    const { status, output } = runCheck(SCRIPT, fixture({}));
    expect(status, output).not.toBe(0);
    expect(output).toContain('no source file found');
  });
});
