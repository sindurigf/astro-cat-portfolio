import type { APIRoute, GetStaticPaths } from 'astro';
import { requireSite } from '../../lib/site';
import { CONTACT_FORM_ON, SECURITY_CONTACT } from '../../lib/contact';
import { RETENTION_DAYS } from '../../lib/contact-form';

/*
 * /.well-known/security.txt, RFC 9116. Generated so `Canonical:` derives from
 * `site` in astro.config.mjs.
 */

export const SECURITY_TXT = 'security.txt';

/* No file without a contact that works (RFC 9116): src/lib/contact.ts. */
export const getStaticPaths: GetStaticPaths = () =>
  SECURITY_CONTACT === null ? [] : [{ params: { file: SECURITY_TXT } }];

/*
 * A literal, not `now + 1 year`: it asserts a human still reads the contact.
 * RFC 9116 section 2.5.5: at most a year out. tests/security-txt.spec.ts fails
 * as it nears. Move it only after confirming the inbox is read.
 */
const EXPIRES = '2027-09-09T00:00:00.000Z';

/** The file for `site`, offering `contact`. */
export const securityTxt = (site: URL, contact: string): string => {
  const canonical = new URL(`.well-known/${SECURITY_TXT}`, site).href;

  return [
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
    `Contact: ${contact}`,
    `Expires: ${EXPIRES}`,
    'Preferred-Languages: en',
    `Canonical: ${canonical}`,
    '',
  ].join('\n');
};

export const GET: APIRoute = ({ site: configuredSite }) => {
  const site = requireSite(
    configuredSite,
    'security.txt needs an absolute Canonical URL (RFC 9116).',
  );
  /* getStaticPaths builds no path without one. */
  if (SECURITY_CONTACT === null) {
    throw new Error('security.txt was requested with no contact to publish.');
  }

  return new Response(securityTxt(site, SECURITY_CONTACT), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
