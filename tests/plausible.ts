import type { BrowserContext } from '@playwright/test';
import { PLAUSIBLE_ENDPOINT } from '../src/lib/analytics';

/**
 * Fake Plausible collector, so no test event reaches the real dashboard.
 * Answers the CORS preflight too. Routed on the context: a `keepalive` click
 * event outlives the page it was sent from.
 */

export type PlausibleSend = Record<string, unknown>;

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
};

export const fakeCollector = async (
  context: BrowserContext,
): Promise<PlausibleSend[]> => {
  const sent: PlausibleSend[] = [];

  await context.route(PLAUSIBLE_ENDPOINT, async (route) => {
    const request = route.request();

    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: CORS_HEADERS });
      return;
    }

    sent.push(request.postDataJSON() as PlausibleSend);
    await route.fulfill({ status: 202, headers: CORS_HEADERS, body: 'ok' });
  });

  return sent;
};
