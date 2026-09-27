import { SITE_CONFIG } from '../site.config';

export const SITE_NAME = SITE_CONFIG.site.name;

export const SITE_SHORT_NAME = SITE_CONFIG.site.shortName;

export const SITE_URL = SITE_CONFIG.site.url;

export const FIRST_PUBLISHED = SITE_CONFIG.site.firstPublished;

export const REPOSITORY_URL = SITE_CONFIG.site.repository;

/** `why` names what needs absolute URLs; the build fails with it. */
export const requireSite = (site: URL | undefined, why: string): URL => {
  if (!site) throw new Error(`Set \`site.url\` in src/site.config.ts: ${why}`);
  return site;
};
