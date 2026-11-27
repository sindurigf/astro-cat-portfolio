import { readFileSync } from 'node:fs';
import { expect, test } from './test';
import { parseGlobalRule } from '../src/lib/headers-rule';
import { NODE } from './tags';

test.describe(
  'parseGlobalRule (security: headers on Worker responses)',
  NODE,
  () => {
    test('reads the headers under the "/*" rule', () => {
      const source =
        '/*\n  X-Frame-Options: DENY\n  Referrer-Policy: no-referrer\n';
      expect(parseGlobalRule(source)).toEqual({
        'X-Frame-Options': 'DENY',
        'Referrer-Policy': 'no-referrer',
      });
    });

    test('ignores headers under any other rule', () => {
      const source =
        '/videos/*\n  X-Other: 1\n/*\n  X-Global: 2\n/assets/*\n  X-Late: 3\n';
      expect(parseGlobalRule(source)).toEqual({ 'X-Global': '2' });
    });

    test('keeps colons inside a value', () => {
      const source =
        "/*\n  Content-Security-Policy: default-src 'self'; img-src https://a.test:8080\n";
      expect(parseGlobalRule(source)['Content-Security-Policy']).toBe(
        "default-src 'self'; img-src https://a.test:8080",
      );
    });

    test('skips comments, blank lines and indented lines without a colon', () => {
      const source = '# top\n\n/*\n  # note\n\n  no-colon\n  X-Kept: yes\n';
      expect(parseGlobalRule(source)).toEqual({ 'X-Kept': 'yes' });
    });

    test('returns nothing when a rule line is indented, so the build guard can throw', () => {
      expect(parseGlobalRule('  /*\n  X-A: 1\n')).toEqual({});
    });

    test('returns nothing when no "/*" rule exists', () => {
      expect(parseGlobalRule('/a\n  X-A: 1\n')).toEqual({});
    });

    test('the shipped public/_headers gives the "/*" rule its CSP, so the build guard passes', () => {
      expect(
        parseGlobalRule(readFileSync('public/_headers', 'utf8'))[
          'Content-Security-Policy'
        ],
        'public/_headers no longer parses; the Worker build would refuse it.',
      ).toContain("default-src 'self'");
    });
  },
);
