import { ABOUT_PATH, BLOG_PATH, CAREER_PATH, CONTACT_PATH } from './paths';

/* Shared by Header.astro's three navigations so they agree on "current". */

export interface NavLink {
  readonly href: string;
  readonly label: string;
}

export const HOME_HREF = '/';

export const NAV_LINKS: readonly NavLink[] = [
  { href: HOME_HREF, label: 'Home' },
  { href: ABOUT_PATH, label: 'About' },
  { href: CAREER_PATH, label: 'Career' },
  { href: BLOG_PATH, label: 'Blog' },
];

/* No Home: beside the logo link it would be a redundant link and tab stop. */
export const HEADER_LINKS: readonly NavLink[] = NAV_LINKS.filter(
  (link) => link.href !== HOME_HREF,
);

/** Styled as a button, but marked current on /contact like any nav link. */
export const CTA: NavLink = {
  href: CONTACT_PATH,
  label: 'Get in touch',
};

/*
 * Compared with trailing slashes so `/career` never matches `/careers`. `/` can
 * only be the page, since every path is below it.
 */
type NavState = 'page' | 'section' | null;

const withTrailingSlash = (path: string): string =>
  path.endsWith('/') ? path : `${path}/`;

const navState = (currentPath: string, href: string): NavState => {
  if (href === HOME_HREF) return currentPath === HOME_HREF ? 'page' : null;

  const current = withTrailingSlash(currentPath);
  const target = withTrailingSlash(href);
  if (current === target) return 'page';
  return current.startsWith(target) ? 'section' : null;
};

/** The visual state; `ariaCurrent` decides the announcement. */
export const isActive = (currentPath: string, href: string): boolean =>
  navState(currentPath, href) !== null;

/*
 * `page` on the page itself, `true` inside its section. Not `location`, which
 * announces as the page's own address.
 */
export const ariaCurrent = (
  currentPath: string,
  href: string,
): 'page' | 'true' | undefined => {
  const state = navState(currentPath, href);
  if (state === 'page') return 'page';
  return state === 'section' ? 'true' : undefined;
};
