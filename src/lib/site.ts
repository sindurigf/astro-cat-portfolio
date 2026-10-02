import { SITE_CONFIG } from '../site.config';

export const SITE_NAME = SITE_CONFIG.site.name;

export const SITE_SHORT_NAME = SITE_CONFIG.site.shortName;

export const SITE_URL = SITE_CONFIG.site.url;

export const FIRST_PUBLISHED = SITE_CONFIG.site.firstPublished;

export const REPOSITORY_URL = SITE_CONFIG.site.repository;

const GITHUB_HOST = 'github.com';

/** GitHub's "use this template" page for a github.com repository; null elsewhere, where there is none. */
export const templateUseUrl = (repository: string): string | null => {
  const url = new URL(repository);
  const [owner, name] = url.pathname.split('/').filter(Boolean);
  if (url.hostname !== GITHUB_HOST || !owner || !name) return null;
  const params = new URLSearchParams({
    template_name: name,
    template_owner: owner,
  });
  return `https://${GITHUB_HOST}/new?${params}`;
};

/** Slug of the post /about, /career and /contact/sent end on; null for none. */
export const JOURNEY_POST = SITE_CONFIG.journeyPost;

/** `why` names what needs absolute URLs; the build fails with it. */
export const requireSite = (site: URL | undefined, why: string): URL => {
  if (!site) throw new Error(`Set \`site.url\` in src/site.config.ts: ${why}`);
  return site;
};
