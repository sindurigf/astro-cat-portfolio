import { readFileSync } from 'node:fs';
import { expect, type Page } from './test';

/* WebKit applies upgrade-insecure-requests on loopback and then loads nothing over http. */
const UPGRADE_INSECURE = /;?\s*upgrade-insecure-requests/;

/**
 * Serves every page document with the Content-Security-Policy from public/_headers,
 * so Trusted Types and script hashes apply as on the live site. Returns what it saw:
 * a script error or a violation fails the test that reads it.
 */
export const serveUnderShippedCsp = async (page: Page): Promise<string[]> => {
  const csp = /Content-Security-Policy: (.+)/.exec(
    readFileSync('public/_headers', 'utf8'),
  )?.[1];
  expect(csp, 'public/_headers has no Content-Security-Policy').toBeTruthy();
  const problems: string[] = [];
  page.on('pageerror', (error) => problems.push(error.message));
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (event) =>
      console.error(`csp: ${event.violatedDirective}`),
    );
  });
  page.on('console', (message) => {
    if (message.text().startsWith('csp:')) problems.push(message.text());
  });
  await page.route('**/*', async (route) => {
    if (route.request().resourceType() !== 'document') return route.continue();
    const response = await route.fetch();
    return route.fulfill({
      response,
      headers: {
        ...response.headers(),
        'content-security-policy': csp!.replace(UPGRADE_INSECURE, ''),
      },
    });
  });
  return problems;
};
