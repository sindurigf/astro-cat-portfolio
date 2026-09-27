import { SITE_CONFIG } from '../site.config';

/* BCP 47. The only source for every language declaration on the site. */
export const SITE_LANGUAGE = SITE_CONFIG.site.locale;

export const OG_LOCALE = SITE_LANGUAGE.replace('-', '_');

/** Lower case, as RSS 2.0's spec examples write it. */
export const FEED_LANGUAGE = SITE_LANGUAGE.toLowerCase();
