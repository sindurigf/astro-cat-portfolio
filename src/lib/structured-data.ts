import { CONTACT_MAILTO } from './contact';
import { SITE_LANGUAGE } from './site-language';
import { JOB_TITLE, PERSON_NAME, SOCIAL_PROFILES } from './profiles';
import type { Trail } from './breadcrumbs';

/*
 * Inline without a hash: HTML "prepare the script element" stops before the
 * CSP check for a data type like ld+json. `speculationrules` is not exempt.
 */

const personId = (origin: string): string => `${origin}/#person`;
const websiteId = (origin: string): string => `${origin}/#website`;

/** Dates are ISO 8601 with a zone, from `isoDateTime`. */
export interface ArticleMeta {
  headline: string;
  datePublished: string;
  /** Only when the post sets `updated`. */
  dateModified?: string;
  keywords: readonly string[];
}

interface ArticleData extends ArticleMeta {
  description: string;
  url: URL;
  image: URL;
}

const blogPosting = (origin: string, article: ArticleData): object => ({
  '@type': 'BlogPosting',
  '@id': `${article.url.href}#post`,
  headline: article.headline,
  description: article.description,
  url: article.url.href,
  mainEntityOfPage: article.url.href,
  image: article.image.href,
  datePublished: article.datePublished,
  ...(article.dateModified ? { dateModified: article.dateModified } : {}),
  keywords: article.keywords.join(', '),
  inLanguage: SITE_LANGUAGE,
  author: { '@id': personId(origin) },
  publisher: { '@id': personId(origin) },
  isPartOf: { '@id': websiteId(origin) },
});

/* Ends with the page: Google reads a last item without `item` as this page. */
const breadcrumbList = (site: URL, page: URL, trail: Trail): object => ({
  '@type': 'BreadcrumbList',
  '@id': `${page.href}#breadcrumb`,
  itemListElement: [
    ...trail.crumbs.map((crumb, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: crumb.label,
      item: new URL(crumb.href, site).href,
    })),
    {
      '@type': 'ListItem',
      position: trail.crumbs.length + 1,
      name: trail.current,
    },
  ],
});

const profilePage = (origin: string, page: URL): object => ({
  '@type': 'ProfilePage',
  '@id': `${page.href}#profile`,
  url: page.href,
  mainEntity: { '@id': personId(origin) },
  isPartOf: { '@id': websiteId(origin) },
});

interface GraphOptions {
  site: URL;
  /** Built portrait, prerendered pages only; the on-demand route has none. */
  personImage?: URL | undefined;
  article?: ArticleData | undefined;
  breadcrumbs?: { page: URL; trail: Trail } | undefined;
  /** The page that is the Person's profile, /about/ only. */
  profile?: URL | undefined;
}

/** One `@graph` so nodes link by `@id` instead of repeating. */
const structuredData = ({
  site,
  personImage,
  article,
  breadcrumbs,
  profile,
}: GraphOptions): object => {
  const origin = site.origin;
  /* Slashed, like every canonical: `origin` alone is a different URL. */
  const home = new URL('/', site).href;

  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Person',
        '@id': personId(origin),
        name: PERSON_NAME,
        jobTitle: JOB_TITLE,
        url: home,
        ...(personImage ? { image: personImage.href } : {}),
        email: CONTACT_MAILTO,
        sameAs: SOCIAL_PROFILES.map((profile) => profile.href),
      },
      {
        '@type': 'WebSite',
        '@id': websiteId(origin),
        url: home,
        name: site.host,
        alternateName: PERSON_NAME,
        author: { '@id': personId(origin) },
        publisher: { '@id': personId(origin) },
        inLanguage: SITE_LANGUAGE,
      },
      ...(article ? [blogPosting(origin, article)] : []),
      ...(breadcrumbs
        ? [breadcrumbList(site, breadcrumbs.page, breadcrumbs.trail)]
        : []),
      ...(profile ? [profilePage(origin, profile)] : []),
    ],
  };
};

/*
 * JSON `\uXXXX` escapes so `</script` and `<!--` in a value cannot end the
 * block. U+2028/9 need none: the block is never parsed as JavaScript.
 */
const ESCAPES = new Map([
  ['<', '\\u003c'],
  ['>', '\\u003e'],
  ['&', '\\u0026'],
]);

export const structuredDataScript = (options: GraphOptions): string =>
  JSON.stringify(structuredData(options)).replace(
    /[<>&]/g,
    (character) => ESCAPES.get(character) ?? character,
  );
