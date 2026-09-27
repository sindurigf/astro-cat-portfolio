import { test, expect } from './test';

/* Run by playwright.worker.config.ts: only the Worker applies public/_headers. HTTP only, no browser. */

const RULES = '/speculationrules.json';
const RULES_TYPE = 'application/speculationrules+json';

test.describe('served types', () => {
  test('the speculation rules file carries the type a browser requires', async ({
    request,
  }) => {
    const response = await request.get(RULES);
    expect(response.status()).toBe(200);
    expect(
      response.headers()['content-type'],
      `${RULES} must be served as ${RULES_TYPE}, or Chromium ignores it`,
    ).toBe(RULES_TYPE);
    expect(Object.keys(await response.json())).toEqual(['prefetch']);
  });

  test('a page names the rules file and the discovery links', async ({
    request,
  }) => {
    const headers = (await request.get('/')).headers();
    expect(headers['speculation-rules']).toBe(`"${RULES}"`);
    expect(headers.link).toContain('</llms.txt>; rel="describedby"');
  });

  test('the Markdown sources and the feeds carry text types', async ({
    request,
  }) => {
    for (const [path, type] of [
      ['/blog/sample-post.md', 'text/markdown'],
      ['/rss.xml', 'xml'],
    ] as const) {
      const response = await request.get(path);
      expect(response.status(), `${path} status`).toBe(200);
      expect(response.headers()['content-type'], `${path} type`).toContain(
        type,
      );
    }
  });
});
