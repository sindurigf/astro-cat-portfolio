/*
 * Optional build-time overrides, for a second deployment of the same source
 * such as a demo or staging copy. Unset, the build is the one src/site.config.ts
 * describes. docs/DEPLOYMENT.md#run-a-demo.
 */

export const CONTACT_FORMS = ['cloudflare-d1', 'none'] as const;

export type ContactForm = (typeof CONTACT_FORMS)[number];

export interface BuildEnv {
  siteUrl: string | null;
  contactForm: ContactForm | null;
  noindex: boolean;
}

/** The variables read, each inlined into the bundles by astro.config.mjs. */
export const BUILD_ENV_NAMES = ['SITE_URL', 'CONTACT_FORM', 'NOINDEX'] as const;

type RawBuildEnv = Partial<
  Record<(typeof BUILD_ENV_NAMES)[number], string | undefined>
>;

const unset = (value: string | undefined): value is undefined | '' =>
  value === undefined || value === '';

const invalid = (name: string, value: string, why: string): never => {
  throw new Error(`${name}=${value} ${why}`);
};

const readSiteUrl = (value: string): string => {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return invalid('SITE_URL', value, 'is not a URL.');
  }
  if (url.protocol !== 'https:') invalid('SITE_URL', value, 'must use https.');
  if (value !== url.origin) {
    invalid(
      'SITE_URL',
      value,
      'must be an origin with no path or trailing slash.',
    );
  }
  return value;
};

const readContactForm = (value: string): ContactForm =>
  CONTACT_FORMS.find((form) => form === value) ??
  invalid('CONTACT_FORM', value, `is not one of ${CONTACT_FORMS.join(', ')}.`);

const readNoindex = (value: string): boolean =>
  value === '1' || invalid('NOINDEX', value, 'must be 1 or unset.');

export const readBuildEnv = (raw: RawBuildEnv): BuildEnv => ({
  siteUrl: unset(raw.SITE_URL) ? null : readSiteUrl(raw.SITE_URL),
  contactForm: unset(raw.CONTACT_FORM)
    ? null
    : readContactForm(raw.CONTACT_FORM),
  noindex: unset(raw.NOINDEX) ? false : readNoindex(raw.NOINDEX),
});

/* Spelled out, not `process.env`: astro.config.mjs replaces each name in the Worker bundle, which has no `process`. */
export const BUILD_ENV = readBuildEnv({
  SITE_URL: process.env.SITE_URL,
  CONTACT_FORM: process.env.CONTACT_FORM,
  NOINDEX: process.env.NOINDEX,
});
