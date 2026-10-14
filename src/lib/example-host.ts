/* Pure, no imports: astro.config.mjs and scripts/check-live.sh load it in plain Node. */

/* RFC 2606: example.com, .net and .org, and the .example TLD, never resolve to a real site. */
const EXAMPLE_DOMAINS = [
  'example.com',
  'example.net',
  'example.org',
  'example',
];

export const isExampleHost = (host: string): boolean =>
  EXAMPLE_DOMAINS.some(
    (domain) => host === domain || host.endsWith(`.${domain}`),
  );

/** What a build and the live check say while `site.url` is the shipped placeholder; null once it is replaced. */
export const placeholderSiteNotice = (siteUrl: string): string | null =>
  isExampleHost(new URL(siteUrl).hostname)
    ? `site.url is still the placeholder ${siteUrl}: every canonical, the sitemap and the feeds point there. ` +
      'Set it in src/site.config.ts, or set SITE_URL for this build.'
    : null;
