import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from './test';
import { builtPages, DIST_DIR, PAIRED_TALKS } from './routes';
import { NODE } from './tags';

/**
 * The format, size and page count beside the slides link are typed into
 * Markdown, which cannot compute them, so they are checked against the PDF.
 * `scripts/check-links.mjs` delegates site-absolute hrefs like this one to the suite.
 */

const [PAIRED] = PAIRED_TALKS;
const POST_ROUTE = PAIRED?.post ?? '';
const TALK_ROUTE = PAIRED?.talk ?? '';
const SLIDES_HREF = `${TALK_ROUTE}.pdf`;
const SLIDESHOW_HREF = `${TALK_ROUTE}/`;
const BYTES_PER_KB = 1024;

const HREF_PATTERN = SLIDES_HREF.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Not `builtPages()`: that returns only `.html` routes. */
const builtSlides = (): string => join(DIST_DIR, SLIDES_HREF);

/** Scoped to the link's `<p>`: "PDF" and KB figures appear elsewhere in the post. */
const slidesParagraphHtml = (): string => {
  const page = builtPages().find((p) => p.route === POST_ROUTE);

  expect(page, `${POST_ROUTE} is not in the build.`).toBeDefined();

  const html = readFileSync(page!.file, 'utf8');
  const match = html.match(
    new RegExp(
      `<p[^>]*>(?:(?!</p>)[\\s\\S])*?<a[^>]*href="${HREF_PATTERN}"[^>]*>[\\s\\S]*?</p>`,
    ),
  );

  expect(
    match,
    `${POST_ROUTE} has no paragraph containing a link to ${SLIDES_HREF}.`,
  ).not.toBeNull();

  return match![0];
};

const slidesParagraph = (): string =>
  slidesParagraphHtml()
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/** Regex, not `indexOf`: `1 0 obj` would otherwise match inside `21 0 obj`. */
const pdfObject = (bytes: string, num: string): string => {
  const start = new RegExp(`(?:^|[^0-9])${num} 0 obj`).exec(bytes);
  if (!start) throw new Error(`PDF object ${num} not found`);

  const from = start.index + start[0].length - `${num} 0 obj`.length;
  const to = bytes.indexOf('endobj', from);
  if (to === -1) throw new Error(`PDF object ${num} has no endobj`);

  return bytes.slice(from, to);
};

/**
 * `/Root` -> `/Pages` -> `/Count`, the page count the PDF format defines.
 * Hand-rolled because poppler's `pdfinfo` is not on CI runners by default.
 */
const slidesPageCount = (): number => {
  const bytes = readFileSync(builtSlides(), 'latin1');

  const root = /\/Root\s+(\d+)\s+\d+\s*R/.exec(bytes);
  if (!root) throw new Error('no /Root reference in the trailer');

  const pagesRef = /\/Pages\s+(\d+)\s+\d+\s*R/.exec(pdfObject(bytes, root[1]));
  if (!pagesRef) throw new Error('the catalog has no /Pages reference');

  const count = /\/Count\s+(\d+)/.exec(pdfObject(bytes, pagesRef[1]));
  if (!count) throw new Error('the page tree root has no /Count');

  return Number(count[1]);
};

test.describe('the talk slides', NODE, () => {
  test.skip(!PAIRED, 'no post shares a deck name and links its PDF');

  test('the linked PDF is actually in the build', () => {
    slidesParagraph();

    expect(
      existsSync(builtSlides()),
      `${POST_ROUTE} links to ${SLIDES_HREF}, which is missing from public${SLIDES_HREF}.`,
    ).toBe(true);
  });

  test('the size beside the link matches the file', () => {
    const text = slidesParagraph();

    const stated = text.match(/(\d+)\s*KB/);
    expect(
      stated,
      `The slides paragraph states no size in KB: ${JSON.stringify(text)}.`,
    ).not.toBeNull();

    const actual = Math.round(statSync(builtSlides()).size / BYTES_PER_KB);
    expect(
      Number(stated![1]),
      `The slides link says ${stated![1]} KB, the file is ${actual} KB.`,
    ).toBe(actual);
  });

  test('the page count beside the link matches the file', () => {
    const text = slidesParagraph();

    const stated = text.match(/(\d+)\s*pages?/);
    expect(
      stated,
      `The slides paragraph states no page count: ${JSON.stringify(text)}.`,
    ).not.toBeNull();

    const actual = slidesPageCount();
    expect(
      Number(stated![1]),
      `The slides link says ${stated![1]} pages, the PDF's page tree says ${actual}.`,
    ).toBe(actual);
  });

  test('the format is named beside the link', () => {
    const text = slidesParagraph();

    expect(
      text,
      `The slides paragraph does not name the format: ${JSON.stringify(text)}.`,
    ).toContain('PDF');
  });

  test('the slideshow is linked first, beside the download', () => {
    const hrefs = [...slidesParagraphHtml().matchAll(/href="([^"]+)"/g)].map(
      ([, href]) => href,
    );
    const slideshow = hrefs.indexOf(SLIDESHOW_HREF);

    expect(
      slideshow,
      `The slides paragraph does not link ${SLIDESHOW_HREF}: ${JSON.stringify(hrefs)}.`,
    ).not.toBe(-1);
    expect(
      slideshow,
      `The slideshow is not linked before the PDF: ${JSON.stringify(hrefs)}.`,
    ).toBeLessThan(hrefs.indexOf(SLIDES_HREF));
  });
});
