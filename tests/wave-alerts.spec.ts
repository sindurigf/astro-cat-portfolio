import { readFileSync } from 'node:fs';
import { expect, test, type Page } from './test';
import { ROUTES, builtPages } from './routes';
import { gotoSettled } from './settle';
import { NODE } from './tags';

/**
 * Three WAVE alert heuristics as a gate, not a WCAG 1.3.1 check: F2 sets no
 * size or weight threshold. Decide whether flagged text is a heading before
 * changing its tag.
 */

/**
 * WAVE's "Possible heading": a `<p>` under 50 characters at 20px+, or 16px+ and
 * bold or italic. `boldWeight` 700 is the CSS `bold` keyword, not WebAIM's.
 */
const POSSIBLE_HEADING = {
  maxChars: 50,
  largeSize: 20,
  emphasisedSize: 16,
  boldWeight: 700,
} as const;

// Both ends of the fluid range: hero stickers hit 18px, between the two arms.
const HEADING_WIDTHS = [305, 1280] as const;

// Every link is server-rendered at every width, so one width covers link order.
const LINK_WIDTH = 1280;

const VIEWPORT_HEIGHT = 800;

interface HeadingScan {
  readonly checked: number;
  readonly flagged: string[];
}

// Every `<p>`, aria-hidden included: WAVE reads the DOM, not the a11y tree.
const scanParagraphs = async (page: Page): Promise<HeadingScan> =>
  page.evaluate(({ maxChars, largeSize, emphasisedSize, boldWeight }) => {
    const paragraphs = [...document.querySelectorAll('p')];

    const flagged = paragraphs.flatMap((paragraph) => {
      const text = (paragraph.textContent ?? '').replace(/\s+/g, ' ').trim();
      if (text.length === 0 || text.length >= maxChars) return [];

      const style = getComputedStyle(paragraph);
      const size = Number.parseFloat(style.fontSize);
      const emphasised =
        Number(style.fontWeight) >= boldWeight || style.fontStyle !== 'normal';

      if (size < largeSize && !(size >= emphasisedSize && emphasised)) {
        return [];
      }

      const where = paragraph.className
        ? `p.${paragraph.className.split(/\s+/)[0]}`
        : 'p';
      return [
        `${where} "${text}": ${size}px, weight ${style.fontWeight}, ${style.fontStyle}`,
      ];
    });

    return { checked: paragraphs.length, flagged };
  }, POSSIBLE_HEADING);

/**
 * WAVE's "Redundant link": consecutive links to the same resolved URL with no
 * text between them. "No text between" is this repo's reading, not WebAIM's.
 */
const scanAdjacentLinks = async (page: Page): Promise<string[]> =>
  page.evaluate(() => {
    const links = [...document.querySelectorAll<HTMLAnchorElement>('a[href]')];
    const name = (link: HTMLAnchorElement): string =>
      (link.textContent ?? '').replace(/\s+/g, ' ').trim() ||
      (link.querySelector('img')?.alt ?? '');
    const textBetween = (first: Element, second: Element): string => {
      const range = document.createRange();
      range.setStartAfter(first);
      range.setEndBefore(second);
      return range.toString().trim();
    };

    return links.slice(1).flatMap((link, index) => {
      const previous = links[index];
      return previous.href === link.href && textBetween(previous, link) === ''
        ? [`"${name(previous)}" then "${name(link)}", both to ${link.href}`]
        : [];
    });
  });

test.describe('WAVE alerts: possible heading', () => {
  // Font size and link order do not vary by engine; WAVE itself runs in Chromium.
  test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'engine-invariant',
  );
  for (const width of HEADING_WIDTHS) {
    test.describe(`at ${width}px`, () => {
      test.use({ viewport: { width, height: VIEWPORT_HEIGHT } });

      for (const route of ROUTES) {
        test(`${route} has no paragraph WAVE reads as a heading`, async ({
          page,
        }) => {
          await gotoSettled(page, route);
          const scan = await scanParagraphs(page);

          expect(scan.checked, `${route} has no <p> to check`).toBeGreaterThan(
            0,
          );

          expect(
            scan.flagged,
            `WAVE will report these on ${route} at ${width}px as possible headings.`,
          ).toEqual([]);
        });
      }
    });
  }
});

test.describe('WAVE alerts: redundant link', () => {
  // Font size and link order do not vary by engine; WAVE itself runs in Chromium.
  test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'engine-invariant',
  );
  test.use({ viewport: { width: LINK_WIDTH, height: VIEWPORT_HEIGHT } });

  for (const route of ROUTES) {
    test(`${route} has no adjacent links to the same URL`, async ({ page }) => {
      await gotoSettled(page, route);

      expect(
        await page.locator('a[href]').count(),
        `${route} has fewer than two links to compare`,
      ).toBeGreaterThan(1);

      expect(
        await scanAdjacentLinks(page),
        `WAVE will report these adjacent pairs on ${route} as redundant links`,
      ).toEqual([]);
    });
  }
});

// WAVE's "Noscript element": any `<noscript>`, read from built HTML.
test.describe('WAVE alerts: noscript element', () => {
  test('no built page contains a <noscript> element', NODE, () => {
    const pages = builtPages();

    expect(pages.length, 'the build has no pages').toBeGreaterThan(0);

    const offenders = pages
      .filter(({ file }) => /<noscript[\s>]/i.test(readFileSync(file, 'utf8')))
      .map(({ route }) => route)
      .sort();

    expect(
      offenders,
      'WAVE will report "Noscript element" on these pages; use @media (scripting: none).',
    ).toEqual([]);
  });
});
