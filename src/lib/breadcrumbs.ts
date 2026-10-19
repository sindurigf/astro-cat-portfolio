import { categoryLabel } from './blog';
import { BLOG_PATH, categoryHref } from './paths';

/*
 * The visible trail stops at the parent (the <h1> follows it); the JSON-LD
 * ends with the page, which Google reads as the last item without a URL.
 */

export interface Crumb {
  label: string;
  href: string;
}

export interface Trail {
  crumbs: readonly Crumb[];
  /** JSON-LD only. */
  current: string;
}

const HOME: Crumb = { label: 'Home', href: '/' };
const BLOG: Crumb = { label: 'Blog', href: BLOG_PATH };

const categoryCrumb = (category: string): Crumb => ({
  label: categoryLabel(category),
  href: categoryHref(category),
});

export const blogTrail = (current: string): Trail => ({
  crumbs: [HOME, BLOG],
  current,
});

export const postTrail = (category: string, current: string): Trail => ({
  crumbs: [HOME, BLOG, categoryCrumb(category)],
  current,
});
