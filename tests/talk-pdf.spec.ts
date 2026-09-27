import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from './test';
import { deckOf, TALK_ROUTES, TALKS_DIR } from './routes';
import { pdfPageCount } from '../scripts/pdf-pages.mjs';
import { DECK_FILE, printedContent, splitDeck } from '../src/lib/slides';
import { NODE } from './tags';

/**
 * `npm run publish:talk` stores the SHA-256 of `printedContent` as
 * /SlidesSHA256 in the PDF. Speaker notes and the stylesheet are not in it.
 */

const PDF_DIR = 'public/talks';

test.describe('a talk PDF', NODE, () => {
  for (const route of TALK_ROUTES) {
    const deck = deckOf(route);
    const pdf = join(PDF_DIR, `${deck}.pdf`);
    const source = join(TALKS_DIR, deck, DECK_FILE);

    test(`${pdf} is printed from ${source} as it stands`, () => {
      test.skip(!existsSync(pdf), `${deck} has no PDF`);
      const bytes = readFileSync(pdf, 'latin1');
      const stored = /\/SlidesSHA256\s*\(([0-9a-f]{64})\)/.exec(bytes)?.[1];
      expect(
        stored,
        `${pdf} carries no /SlidesSHA256, so it was not made by npm run publish:talk`,
      ).toBeDefined();
      const deckSource = readFileSync(source, 'utf8');
      const current = createHash('sha256')
        .update(printedContent(deckSource, source))
        .digest('hex');
      expect(
        stored,
        `${source} changed since ${pdf} was printed; run npm run build && npm run publish:talk -- ${deck}.`,
      ).toBe(current);
    });

    test(`${pdf} has one page for each slide of ${source}`, () => {
      test.skip(!existsSync(pdf), `${deck} has no PDF`);
      const bytes = readFileSync(pdf, 'latin1');
      const pages = pdfPageCount(bytes);
      const slides = splitDeck(readFileSync(source, 'utf8'), source).length;
      expect(pages, 'a slide broke across pages or went missing').toBe(slides);
    });
  }
});
