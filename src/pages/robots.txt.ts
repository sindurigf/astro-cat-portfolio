import type { APIRoute } from 'astro';
import { requireSite } from '../lib/site';
import { SITEMAP_PATH } from '../lib/paths';
import { BUILD_ENV } from '../lib/build-env';

/*
 * `Sitemap:` must be absolute, so it derives from `site`. @astrojs/sitemap
 * emits `sitemap-index.xml`; tests/sitemap.spec.ts checks this line and
 * BaseLayout agree. NOINDEX keeps `Allow: /`: a crawler blocked here never
 * reads the noindex header, and Google then indexes the bare URL.
 */

/** Crawlers that collect pages for AI training; Google-Extended also covers Gemini app grounding. */
const BLOCKED_AI_CRAWLERS = [
  'GPTBot',
  'ClaudeBot',
  'CCBot',
  'Google-Extended',
  'Applebot-Extended',
  'Meta-ExternalAgent',
  'Amazonbot',
  'Bytespider',
] as const;

export const GET: APIRoute = ({ site: configuredSite }) => {
  const site = requireSite(
    configuredSite,
    'robots.txt needs an absolute Sitemap URL.',
  );

  const body = [
    ...BLOCKED_AI_CRAWLERS.flatMap((agent) => [
      `User-agent: ${agent}`,
      'Disallow: /',
      '',
    ]),
    'User-agent: *',
    'Allow: /',
    '',
    ...(BUILD_ENV.noindex
      ? []
      : [`Sitemap: ${new URL(SITEMAP_PATH, site).href}`, '']),
  ].join('\n');

  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
