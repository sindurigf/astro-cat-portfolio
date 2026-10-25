import { SITE_CONFIG } from '../site.config';

/* Apart from analytics.ts, which the click tracker bundles for the browser. */

/** Plausible counts the site under its hostname; false loads no tracker. */
export const ANALYTICS_ON = SITE_CONFIG.analytics;
