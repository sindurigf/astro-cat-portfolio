import { readFileSync } from 'node:fs';
import { expect, test } from './test';
import { builtPages, pagesNotLinking } from './routes';
import { NODE } from './tags';

/**
 * /accessibility against ACCESSIBILITY.md. The page derives its facts at build
 * time, so this guards reachability, a hardcoded value replacing a derived
 * one, and the status staying honest.
 */

const PAGE = '/accessibility';
const RECORD = 'ACCESSIBILITY.md';

/** Not derived: deriving it would make the test agree with whatever the file says. */
const HONEST_STATUS = 'Target only. No conformance claim.';

const tableValue = (field: string): string => {
  const escaped = field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`^\\|\\s*${escaped}\\s*\\|([^|]+)\\|`, 'm').exec(
    readFileSync(RECORD, 'utf8'),
  );
  expect(match, `${RECORD} has no "${field}" row`).not.toBeNull();
  return match![1]!
    .trim()
    .replace(/\*\*/g, '')
    .replace(/^<(.*)>$/, '$1');
};

const pageText = (): string => {
  const page = builtPages().find((entry) => entry.route === PAGE);
  expect(page, `${PAGE} was not built`).toBeDefined();

  const html = readFileSync(page!.file, 'utf8');
  return html
    .slice(html.indexOf('<body'))
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

test.describe('the accessibility statement', NODE, () => {
  test('every page can reach the statement', () => {
    const missing = pagesNotLinking(PAGE);

    expect(
      missing,
      `route(s) with no link to /accessibility: ${missing.join(', ')}`,
    ).toEqual([]);
  });

  test('the page reports what the record says', () => {
    const text = pageText();

    for (const field of [
      'Target standard',
      'Conformance status',
      'Last reviewed',
    ]) {
      const value = tableValue(field);
      expect(
        text,
        `/accessibility does not show the "${field}" value from ${RECORD} ("${value}").`,
      ).toContain(value);
    }
  });

  test('the status is still the honest one', () => {
    // A real change needs HONEST_STATUS updated with the manual testing that justifies it.
    expect(
      tableValue('Conformance status'),
      `${RECORD} claims a different conformance status than HONEST_STATUS.`,
    ).toBe(HONEST_STATUS);
  });

  test('it tells a reader how to report a barrier', () => {
    const text = pageText();

    expect(
      text.toLowerCase(),
      '/accessibility no longer tells anyone how to report a barrier.',
    ).toContain('report a barrier');

    for (const route of ['Private reporting', 'Public reporting']) {
      const value = tableValue(route);
      expect(
        readFileSync(
          builtPages().find((entry) => entry.route === PAGE)!.file,
          'utf8',
        ),
        `/accessibility does not offer the ${route.toLowerCase()} route (${value}).`,
      ).toContain(value);
    }
  });
});
