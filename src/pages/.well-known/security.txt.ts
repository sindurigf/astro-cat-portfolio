import type { APIRoute } from 'astro';
import { requireSite } from '../../lib/site';
import { CONTACT_FORM_ON, CONTACT_MAILTO } from '../../lib/contact';
import { RETENTION_DAYS } from '../../lib/contact-form';

/*
 * RFC 9116. Generated so `Canonical:` derives from `site` in astro.config.mjs.
 */

/*
 * A literal, not `now + 1 year`: it asserts a human still reads CONTACT_EMAIL.
 * RFC 9116 section 2.5.5: at most a year out. tests/security-txt.spec.ts fails
 * as it nears. Move it only after confirming the inbox is read.
 */
const EXPIRES = '2027-09-09T00:00:00.000Z';

export const GET: APIRoute = ({ site: configuredSite }) => {
  const site = requireSite(
    configuredSite,
    'security.txt needs an absolute Canonical URL (RFC 9116).',
  );

  const canonical = new URL('.well-known/security.txt', site).href;

  const body = [
    `# ${site.origin} -- see RFC 9116.`,
    '#',
    '# A personal site with no accounts. Every page is prerendered and served',
    '# as a static asset by a Cloudflare Worker. The Worker runs code for:',
    ...(CONTACT_FORM_ON
      ? [
          '#   /contact/send/, which stores the name, email address and message a',
          '#   visitor submits in a Cloudflare D1 database and emails a copy to the',
          '#   owner;',
        ]
      : []),
    '#   /videos/*, a dormant route kept for serving video in byte ranges.',
    '#   No video is published, so every request there gets the 404 page;',
    '#   /_image, which returns an image from /_astro/ for the contact error',
    '#   pages and refuses remote and non-image sources;',
    ...(CONTACT_FORM_ON
      ? [
          `#   a daily job that deletes stored messages once they are ${RETENTION_DAYS} days old`,
          '#   and resends notifications that failed.',
          '# The surface worth testing is the contact endpoint, the response headers',
          '# and the published documents.',
        ]
      : [
          '# The surface worth testing is the response headers and the published',
          '# documents.',
        ]),
    '',
    `Contact: ${CONTACT_MAILTO}`,
    `Expires: ${EXPIRES}`,
    'Preferred-Languages: en',
    `Canonical: ${canonical}`,
    '',
  ].join('\n');

  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
