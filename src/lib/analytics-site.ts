import { SITE_CONFIG } from '../site.config';

/* Apart from analytics.ts, which the click tracker bundles for the browser. */

/** Public by design: it is in every page's HTML. Null loads no tracker. */
export const UMAMI_WEBSITE_ID = SITE_CONFIG.analytics?.umamiWebsiteId ?? null;

export const ANALYTICS_ON = UMAMI_WEBSITE_ID !== null;
