import { readFileSync } from 'node:fs';
import { expect, test } from './test';
import { defined } from '../src/lib/defined';
import { builtPages, pagesNotLinking } from './routes';
import { NODE } from './tags';
import { formatPostDate } from '../src/lib/post-date';
import { SITE_CONFIG, validateSiteConfig } from '../src/site.config';
import {
  ACCESSIBILITY_RESPONSE_DAYS,
  REPOSITORY_URL,
  sourceUrl,
} from '../src/lib/site';

/**
 * /accessibility against ACCESSIBILITY.md. The page derives its facts at build
 * time, so this guards reachability, a hardcoded value replacing a derived
 * one, and the status staying honest.
 */

const PAGE = '/accessibility';
const RECORD = 'ACCESSIBILITY.md';

/** Not derived: deriving it would make the test agree with whatever the file says. */
const HONEST_STATUS = 'Target only. No claim that the site meets it.';

const tableValue = (field: string): string => {
  const escaped = field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`^\\|\\s*${escaped}\\s*\\|([^|]+)\\|`, 'm').exec(
    readFileSync(RECORD, 'utf8'),
  );
  expect(match, `${RECORD} has no "${field}" row`).not.toBeNull();
  return defined(match?.[1], `${RECORD} "${field}" row`)
    .trim()
    .replace(/\*\*/g, '')
    .replace(/^<(.*)>$/, '$1');
};

const pageHtml = (): string => {
  const page = builtPages().find((entry) => entry.route === PAGE);
  expect(page, `${PAGE} was not built`).toBeDefined();

  return readFileSync(page!.file, 'utf8');
};

const pageText = (): string => {
  const html = pageHtml();
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
      const recorded = tableValue(field);
      const value =
        field === 'Last reviewed'
          ? formatPostDate(new Date(recorded))
          : recorded;
      expect(
        text,
        `/accessibility does not show the "${field}" value from ${RECORD} ("${value}").`,
      ).toContain(value);
    }
  });

  test('the page states the configured response time', () => {
    const days = ACCESSIBILITY_RESPONSE_DAYS;
    const expected = `reply within ${days} ${days === 1 ? 'day' : 'days'}.`;

    expect(
      pageText(),
      `/accessibility does not promise a reply within accessibility.responseDays (${days}).`,
    ).toContain(expected);
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

    expect(
      pageHtml(),
      '/accessibility does not offer the private reporting route.',
    ).toContain(tableValue('Private reporting'));
  });

  test('it links the public reporting route and the record only where they resolve', () => {
    const html = pageHtml();

    for (const [what, url] of [
      ['the public reporting route', tableValue('Public reporting')],
      ['the full record', `${REPOSITORY_URL}/blob/main/${RECORD}`],
    ] as const) {
      const resolves = sourceUrl(url) !== null;
      expect(
        html.includes(`href="${url}"`),
        resolves
          ? `/accessibility does not link ${what} (${url}).`
          : `/accessibility links ${what} at a placeholder that never resolves (${url}).`,
      ).toBe(resolves);
    }
  });
});

test(
  'accessibility.responseDays must be a whole number of days, 1 or more',
  NODE,
  () => {
    for (const responseDays of [0, -7, 2.5, Number.NaN]) {
      expect(
        () =>
          validateSiteConfig({
            ...SITE_CONFIG,
            accessibility: { responseDays },
          }),
        `accessibility.responseDays ${responseDays} passed validation.`,
      ).toThrow(/accessibility\.responseDays must be a whole number of days/);
    }
    expect(() =>
      validateSiteConfig({
        ...SITE_CONFIG,
        accessibility: { responseDays: 1 },
      }),
    ).not.toThrow();
  },
);
