import { expect, test } from './test';
import { builtHtml, ROUTES } from './routes';
import { NODE } from './tags';
import { REPOSITORY_URL } from '../src/lib/site';

/** EU AI Act Art. 50: every page labels the AI-drawn cats and AI-written text, and links the record. */

const LABEL = 'Cat drawings and text made with AI';
const DISCLOSURE = `${REPOSITORY_URL}/blob/main/AI_DISCLOSURE.md`;

const footerOf = (html: string): string =>
  html.slice(html.lastIndexOf('<footer'), html.lastIndexOf('</footer>'));

test(
  'every route labels the AI drawings and text in its footer and links the disclosure',
  NODE,
  () => {
    const pages = builtHtml();
    const checked: string[] = [];

    for (const route of ROUTES) {
      const html = pages.get(route);
      expect.soft(html, `${route} was not built.`).toBeDefined();
      const links = [
        ...footerOf(html ?? '').matchAll(/<a\b([^>]*)>([^<]*)<\/a>/g),
      ].filter(([, , text]) => text.trim() === LABEL);

      expect
        .soft(links, `${route}'s footer does not say "${LABEL}".`)
        .toHaveLength(1);
      expect
        .soft(
          links[0]?.[1] ?? '',
          `${route}'s AI label does not link the disclosure.`,
        )
        .toContain(`href="${DISCLOSURE}"`);
      checked.push(route);
    }

    expect(checked).toEqual([...ROUTES]);
  },
);
