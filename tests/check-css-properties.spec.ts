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
        '@layer components { .a { @apply p-4; --token: 1px; -webkit-text-stroke: 1px; text-decoration-thickness: 2px; } }',
        '',
      ].join('\n'),
    );
    expect(status, output).toBe(0);
  });
});
