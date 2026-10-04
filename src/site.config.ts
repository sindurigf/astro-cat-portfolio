/*
 * Everything that names the site or its owner. Replace every value before
 * publishing; the sample persona is Nico Robin and every address uses an
 * RFC 2606 reserved name. Validated on
 * import, so a bad value fails the build and the tests, not a visitor.
 */

import { BUILD_ENV, CONTACT_FORMS, type ContactForm } from './lib/build-env.ts';

/** Labels with an icon in src/assets/social-icons.svg. */
export const PROFILE_LABELS = [
  'GitHub',
  'LinkedIn',
  'Instagram',
  'Bluesky',
  'Mastodon',
] as const;

export type ProfileLabel = (typeof PROFILE_LABELS)[number];

export interface SiteConfig {
  site: {
    /** Shown in titles, the header, the feed and the manifest. */
    name: string;
    /** The home screen label: the manifest's short_name and iOS's app title. */
    shortName: string;
    /**
     * Origin only, https, no path: canonicals, feeds and the sitemap. The
     * `SITE_URL` build variable overrides it.
     */
    url: string;
    /** BCP 47, e.g. `en-GB`. */
    locale: string;
    /** The year of first publication, for the footer's copyright line. */
    firstPublished: number;
    /** One or two lines of at most 40 characters: the sharing image, `npm run og`. */
    tagline: ReadonlyArray<string>;
    /** The public source repository, https; /accessibility links its record. The `REPOSITORY_URL` build variable overrides it. */
    repository: string;
    /**
     * The footer's name line and the first section of /about. About 11
     * characters fit the footer on a phone; `lang` is its BCP 47 language.
     */
    motto: { text: string; lang: string };
  };
  person: {
    /** The homepage `<h1>` sets each name on its own line. */
    givenName: string;
    familyName: string;
    jobTitle: string;
    /** Public: in the footer, security.txt, llms.txt and JSON-LD. */
    email: string;
    /** Root-relative path of a CV under public/, or null for none. */
    cv: string | null;
  };
  /** JSON-LD `sameAs` and the footer, in this order. */
  profiles: ReadonlyArray<{ label: ProfileLabel; href: string }>;
  /** Umami Cloud; null loads no tracker. */
  analytics: { umamiWebsiteId: string } | null;
  /**
   * Slug of the published post /about, /career and /contact/sent end on, or
   * null to end them on their next page only. The build fails on any other slug.
   */
  journeyPost: string | null;
  contact: {
    /**
     * `cloudflare-d1`: the form, stored in D1 and mailed by Email Routing.
     * `none`: /contact shows the email address only. docs/DEPLOYMENT.md.
     * The `CONTACT_FORM` build variable overrides it.
     */
    form: ContactForm;
    /** Must equal `allowed_sender_addresses` in wrangler.jsonc. */
    notificationSender: string;
  };
  accessibility: {
    /** Whole days /accessibility promises a reply to a reported barrier within. */
    responseDays: number;
  };
}

const config: SiteConfig = {
  site: {
    name: 'example.com',
    shortName: 'example',
    url: 'https://example.com',
    locale: 'en-GB',
    firstPublished: 2026,
    tagline: [
      'Archaeologist and historian',
      'Reading what the past left behind',
    ],
    repository: 'https://github.example/nico-robin/example-site',
    motto: { text: 'Lege Saxa', lang: 'la' },
  },
  person: {
    givenName: 'Nico',
    familyName: 'Robin',
    jobTitle: 'Archaeologist',
    email: 'hello@example.com',
    cv: null,
  },
  profiles: [
    { label: 'GitHub', href: 'https://github.example/nico-robin' },
    { label: 'LinkedIn', href: 'https://linkedin.example/in/nico-robin' },
    { label: 'Instagram', href: 'https://instagram.example/nico-robin/' },
    { label: 'Bluesky', href: 'https://bluesky.example/profile/nico-robin' },
    { label: 'Mastodon', href: 'https://mastodon.example/@nico-robin' },
  ],
  analytics: null,
  journeyPost: 'sample-post',
  contact: {
    form: 'cloudflare-d1',
    notificationSender: 'contact-form@example.com',
  },
  accessibility: {
    responseDays: 7,
  },
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/* A file name in src/content/blog/, as the glob loader turns it into an id. */
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const EARLIEST_YEAR = 1991;
const TAGLINE_MAX_LINES = 2;
/* What fits the sharing image at its text size. */
const TAGLINE_MAX_LENGTH = 40;

const invalid = (path: string, why: string): never => {
  throw new Error(`src/site.config.ts: ${path} ${why}`);
};

const text = (path: string, value: string) => {
  if (value.trim() === '' || value !== value.trim()) {
    invalid(path, 'must be non-empty text without surrounding spaces.');
  }
};

const httpsUrl = (path: string, value: string): URL => {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return invalid(path, `is not a URL: ${value}`);
  }
  if (url.protocol !== 'https:') invalid(path, 'must use https.');
  return url;
};

const email = (path: string, value: string) => {
  if (!EMAIL.test(value)) invalid(path, `is not an email address: ${value}`);
};

export const validateSiteConfig = (value: SiteConfig): SiteConfig => {
  const {
    site,
    person,
    profiles,
    analytics,
    journeyPost,
    contact,
    accessibility,
  } = value;

  text('site.name', site.name);
  text('site.shortName', site.shortName);
  const origin = httpsUrl('site.url', site.url);
  if (origin.href !== `${origin.origin}/` || site.url.endsWith('/')) {
    invalid('site.url', 'must be an origin with no path or trailing slash.');
  }
  try {
    if (Intl.getCanonicalLocales(site.locale)[0] !== site.locale) {
      invalid('site.locale', `is not in canonical BCP 47 form: ${site.locale}`);
    }
  } catch (error) {
    if (error instanceof RangeError) {
      invalid('site.locale', `is not a BCP 47 tag: ${site.locale}`);
    }
    throw error;
  }
  httpsUrl('site.repository', site.repository);
  if (site.tagline.length < 1 || site.tagline.length > TAGLINE_MAX_LINES) {
    invalid('site.tagline', `must be one or two lines.`);
  }
  site.tagline.forEach((line, index) => {
    text(`site.tagline[${index}]`, line);
    if (line.length > TAGLINE_MAX_LENGTH) {
      invalid(
        `site.tagline[${index}]`,
        `is over ${TAGLINE_MAX_LENGTH} characters.`,
      );
    }
  });
  if (
    !Number.isInteger(site.firstPublished) ||
    site.firstPublished < EARLIEST_YEAR
  ) {
    invalid('site.firstPublished', 'must be a four-digit year.');
  }

  text('site.motto.text', site.motto.text);
  text('site.motto.lang', site.motto.lang);
  text('person.givenName', person.givenName);
  text('person.familyName', person.familyName);
  text('person.jobTitle', person.jobTitle);
  email('person.email', person.email);
  if (person.cv !== null && !/^\/[^/].*\.pdf$/.test(person.cv)) {
    invalid('person.cv', 'must be null or a root-relative path to a PDF.');
  }

  const labels = new Set<string>();
  profiles.forEach(({ label, href }, index) => {
    if (!PROFILE_LABELS.includes(label)) {
      invalid(`profiles[${index}].label`, `has no icon: ${label}`);
    }
    if (labels.has(label)) invalid(`profiles[${index}]`, `repeats ${label}.`);
    labels.add(label);
    httpsUrl(`profiles[${index}].href`, href);
  });

  if (analytics !== null && !UUID.test(analytics.umamiWebsiteId)) {
    invalid('analytics.umamiWebsiteId', 'must be the UUID Umami shows.');
  }

  if (journeyPost !== null && !SLUG.test(journeyPost)) {
    invalid('journeyPost', `must be null or a post's slug: ${journeyPost}`);
  }

  if (!CONTACT_FORMS.includes(contact.form)) {
    invalid('contact.form', `names no known backend: ${String(contact.form)}`);
  }
  email('contact.notificationSender', contact.notificationSender);

  if (
    !Number.isInteger(accessibility.responseDays) ||
    accessibility.responseDays < 1
  ) {
    invalid(
      'accessibility.responseDays',
      'must be a whole number of days, 1 or more.',
    );
  }

  return value;
};

const withBuildEnv = ({ site, contact, ...rest }: SiteConfig): SiteConfig => ({
  ...rest,
  site: {
    ...site,
    url: BUILD_ENV.siteUrl ?? site.url,
    repository: BUILD_ENV.repositoryUrl ?? site.repository,
  },
  contact: { ...contact, form: BUILD_ENV.contactForm ?? contact.form },
});

export const SITE_CONFIG = validateSiteConfig(withBuildEnv(config));
