import { SITEMAP_PATH } from './paths';

/* public/_redirects as a NOINDEX build serves it: no redirect to the sitemap it does not build. */

const isSitemapRedirect = (line: string): boolean =>
  !line.trimStart().startsWith('#') &&
  line.trim().split(/\s+/)[1] === SITEMAP_PATH;

export const noindexRedirects = (source: string): string => {
  const lines = source.split('\n');
  if (!lines.some(isSitemapRedirect)) {
    throw new Error(
      `public/_redirects: no redirect to ${SITEMAP_PATH}. The NOINDEX build cannot rewrite it.`,
    );
  }
  return lines.filter((line) => !isSitemapRedirect(line)).join('\n');
};
