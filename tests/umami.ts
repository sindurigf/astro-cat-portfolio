import type { BrowserContext } from '@playwright/test';
import { UMAMI_HOST_URL } from '../src/lib/analytics';

/**
 * Fake Umami collector, so no test page view reaches the real dashboard.
 * Answers the CORS preflight too. Routed on the context: a `keepalive` click
 * event outlives the page it was sent from.
 */

export type UmamiSend = { type: string; payload: Record<string, unknown> };

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
};

export const fakeCollector = async (
  context: BrowserContext,
): Promise<UmamiSend[]> => {
  const sent: UmamiSend[] = [];

  await context.route(`${UMAMI_HOST_URL}/**`, async (route) => {
    const request = route.request();

    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: CORS_HEADERS });
      return;
    }

    sent.push(request.postDataJSON() as UmamiSend);
    await route.fulfill({ status: 200, headers: CORS_HEADERS, json: {} });
  });

  return sent;
};
