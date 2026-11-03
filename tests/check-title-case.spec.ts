import { expect, test } from './test';
import { builtFixture, runCheck, type Files } from './check-fixture';
import { TITLE_CASE_ALLOWED } from '../scripts/check-allow-lists.mjs';
import { SITE_CONFIG } from '../src/site.config';
import { NODE } from './tags';

const SCRIPT = 'scripts/check-title-case.mjs';
const BAD_ROUTE = '/bad/';
const BAD_HEADING = 'the shape of things';

type Allowed = { route: string; kind: string; text: string };

const MARKUP: Record<string, (text: string) => string> = {
  heading: (text) => `<h2>${text}</h2>`,
  title: (text) => `<title>${text}</title>`,
  summary: (text) => `<details><summary>${text}</summary></details>`,
  'og:title': (text) => `<meta property="og:title" content="${text}">`,
  button: (text) => `<button>${text}</button>`,
};

const page = (body: string): string =>
  `<!doctype html><html><head><title>The Shape of Things | ${SITE_CONFIG.site.name}</title></head><body>${body}</body></html>`;

const distFile = (route: string): string => `dist/client${route}index.html`;

/* Every allowed text on its route, so none reads as stale. */
const allowedPages = (): Files => {
  const bodies: Record<string, string> = {};
  for (const { route, kind, text } of TITLE_CASE_ALLOWED as Allowed[]) {
    const markup = MARKUP[kind];
    if (!markup)
      throw new Error(
        `no fixture markup for TITLE_CASE_ALLOWED kind "${kind}"`,
      );
    bodies[route] = `${bodies[route] ?? ''}${markup(text)}`;
  }
  return Object.fromEntries(
    Object.entries(bodies).map(([route, body]) => [
      distFile(route),
      page(body),
    ]),
  );
};

const tree = (extra: Files = {}): Files => ({
  [distFile('/')]: page(
    '<h1>A Guide to the Open Web</h1><button>Send Message</button>',
  ),
  ...allowedPages(),
  ...extra,
});

test.describe('check:title-case', NODE, () => {
  test('passes headings, titles and buttons in Chicago title case', () => {
    const { status, output } = runCheck(SCRIPT, builtFixture(tree()));
    expect(status, output).toBe(0);
  });

  test('fails a heading in sentence case and names its route', () => {
    const root = builtFixture(
      tree({ [distFile(BAD_ROUTE)]: page(`<h1>${BAD_HEADING}</h1>`) }),
    );
    const { status, output } = runCheck(SCRIPT, root);
    expect(status, output).not.toBe(0);
    expect(output).toContain(`${BAD_ROUTE} heading: "${BAD_HEADING}"`);
  });
});
