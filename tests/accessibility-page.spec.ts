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

/* Findable help: a reader reaches the report links without reading the whole statement. */
test.describe('reporting on the accessibility statement', () => {
  test('the report links come before the first heading of the statement', async ({
    page,
  }) => {
    await page.goto(PAGE);
    const firstHeading = page.locator('main h2').first();
    await expect(firstHeading, `${PAGE} has no h2`).toBeAttached();

    const publicReporting = sourceUrl(tableValue('Public reporting'));
    const names = [
      ...(publicReporting === null ? [] : ['Report It on GitHub']),
      `Email ${tableValue('Private reporting')}`,
    ];
    for (const name of names) {
      const link = page.getByRole('link', { name, exact: true }).first();
      await expect(link, `${PAGE} has no link named "${name}"`).toBeAttached();
      const before = await link.evaluate(
        (el, heading) =>
          Boolean(
            heading &&
            el.compareDocumentPosition(heading) &
              Node.DOCUMENT_POSITION_FOLLOWING,
          ),
        await firstHeading.elementHandle(),
      );
      expect(
        before,
        `"${name}" comes after the first h2 on ${PAGE}, so a reader has to search for it.`,
      ).toBe(true);
    }

    if (publicReporting !== null) {
      await expect(
        page
          .getByRole('link', { name: 'Report It on GitHub', exact: true })
          .first(),
        'The top GitHub link does not open the accessibility issue form.',
      ).toHaveAttribute('href', publicReporting);
      expect(
        publicReporting,
        `${RECORD} public reporting does not point at the accessibility issue form.`,
      ).toMatch(/\/issues\/new\?template=accessibility\.yml$/);
    }
  });

  test('"More on reporting" leads to the Report a Barrier section', async ({
    page,
  }) => {
    await page.goto(PAGE);
    const more = page.getByRole('link', { name: 'More on reporting' });
    await expect(
      more,
      `${PAGE} has no "More on reporting" link`,
    ).toBeAttached();
    const target = defined(
      (await more.getAttribute('href')) ?? undefined,
      '"More on reporting" href',
    );
    await expect(
      page.locator(target),
      `"More on reporting" points at ${target}, which is not the Report a Barrier heading.`,
    ).toHaveText('Report a Barrier');
  });
});
