import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { load } from 'js-yaml';
import {
  BLOG_CONTENT_DIR,
  BLOG_PATH,
  CONTACT_SEND_PATH,
  CONTACT_SENT_PATH,
  PAGED_SEGMENT,
  TAG_PATH,
} from './paths';

/* Plain Node, from astro.config.mjs: reads frontmatter, not astro:content. */

/* A confirmation page and a POST target: neither is content to index. */
const UNADVERTISED_PATHS = [CONTACT_SENT_PATH, CONTACT_SEND_PATH];

const BLOG_CHILD = new RegExp(`^${BLOG_PATH}([^/]+)/$`);

interface PostSummary {
  slug: string;
  category: string;
  placeholder: boolean;
  /** ISO day of `updated`, else `date`. */
  lastmod: string;
}

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---/;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const ISO_DAY = /^\d{4}-\d{2}-\d{2}/;

/* js-yaml's default schema has no timestamp type, so dates load as strings. */
const isoDay = (value: unknown): string | undefined =>
  typeof value === 'string' ? ISO_DAY.exec(value)?.[0] : undefined;

const frontmatterOf = (raw: string, name: string): Record<string, unknown> => {
  const block = FRONTMATTER.exec(raw)?.[1];
  if (block === undefined) {
    throw new Error(`${name} opens with no frontmatter block.`);
  }
  const data: unknown = load(block);
  if (!isRecord(data)) {
    throw new Error(`${name} frontmatter is not a YAML mapping.`);
  }
  return data;
};

export const readPosts = (dir = BLOG_CONTENT_DIR): PostSummary[] =>
  readdirSync(dir)
    .filter((name) => name.endsWith('.md'))
    .map((name) => {
      const data = frontmatterOf(readFileSync(join(dir, name), 'utf8'), name);
      const { category } = data;
      if (typeof category !== 'string' || category.length === 0) {
        throw new Error(`${name} has no category in its frontmatter.`);
      }

      /* Falls back to `date`; JSON-LD `dateModified` does not. */
      const lastmod = isoDay(data['updated']) ?? isoDay(data['date']);
      if (!lastmod) {
        throw new Error(`${name} has no date in its frontmatter.`);
      }

      return {
        slug: name.replace(/\.md$/, ''),
        category,
        placeholder: data['placeholder'] === true,
        lastmod,
      };
    });

/** Empty categories and placeholder posts are left out. */
export const isAdvertised = (page: string, posts: PostSummary[]): boolean => {
  const { pathname } = new URL(page);

  if (UNADVERTISED_PATHS.some((path) => pathname.endsWith(path))) return false;
  if (pathname.includes(TAG_PATH)) return false;

  const segment = BLOG_CHILD.exec(pathname)?.[1];
  if (segment === undefined || segment === PAGED_SEGMENT) return true;

  const post = posts.find((entry) => entry.slug === segment);
  if (post) return !post.placeholder;

  return posts.some((entry) => entry.category === segment);
};

/** Posts only: no other page records a date. */
export const lastmodFor = (
  page: string,
  posts: PostSummary[],
): string | undefined => {
  const segment = BLOG_CHILD.exec(new URL(page).pathname)?.[1];
  return posts.find((post) => post.slug === segment)?.lastmod;
};
