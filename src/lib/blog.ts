import { getCollection, type CollectionEntry } from 'astro:content';
import { BLOG_CATEGORIES, type BlogCategory } from '../content.config';
import { BLOG_PATH, categoryHref, postHref } from './paths';
import { JOURNEY_POST } from './site';

export type BlogPost = CollectionEntry<'blog'>;

/** Drops placeholders, whose pages are still built with `noindex`. */
export const publishedPosts = (posts: readonly BlogPost[]): BlogPost[] =>
  posts.filter((post) => !post.data.placeholder);

export const sortByNewest = (posts: readonly BlogPost[]): BlogPost[] =>
  [...posts].sort((a, b) => b.data.date.getTime() - a.data.date.getTime());

/**
 * Published posts, newest first: the source for every listing. `[slug].astro`
 * and `llms.txt` read the collection directly because they must see
 * placeholders; routing llms.txt through here would drop them.
 */
export const getSortedPosts = async (): Promise<BlogPost[]> =>
  publishedPosts(sortByNewest(await getCollection('blog')));

export const getFeaturedPosts = async (limit: number): Promise<BlogPost[]> =>
  (await getSortedPosts()).filter((post) => post.data.featured).slice(0, limit);

/** Categories with a published post, in `BLOG_CATEGORIES` order; others have no page or link. */
export const getCategoriesWithPosts = async (): Promise<BlogCategory[]> => {
  const used = new Set(
    (await getSortedPosts()).map((post) => post.data.category),
  );
  return BLOG_CATEGORIES.filter((category) => used.has(category));
};

export const cardProps = (post: BlogPost) => ({
  href: postHref(post.id),
  title: post.data.title,
  teaser: post.data.teaser,
  category: post.data.category,
  date: post.data.date,
  readingTime: post.data.readingTime,
});

/** `category: null` is the "All Posts" row. */
interface CategoryFilterOption {
  label: string;
  href: string;
  category: BlogCategory | null;
}

/* Chicago lowercases these inside a title, never first or last. */
const MINOR_WORDS = new Set([
  'a',
  'an',
  'the',
  'and',
  'but',
  'or',
  'nor',
  'for',
  'yet',
  'so',
  'at',
  'by',
  'in',
  'of',
  'on',
  'to',
  'from',
  'with',
]);

const capitalise = (word: string): string =>
  word.charAt(0).toUpperCase() + word.slice(1);

/* Chicago title case for the unstyled <title>; visible uses are uppercase CSS. */
export const categoryLabel = (category: string): string => {
  const words = category.split('-');
  const last = words.length - 1;
  return words
    .map((word, index) =>
      index > 0 && index < last && MINOR_WORDS.has(word)
        ? word
        : capitalise(word),
    )
    .join(' ');
};

/* Proper nouns; other tags use `categoryLabel`. */
const TAG_LABELS: Record<string, string> = {
  astro: 'Astro',
};

export const tagLabel = (tag: string): string =>
  TAG_LABELS[tag] ?? categoryLabel(tag);

/*
 * Soft hyphens for headings too long for the narrowest slab (SC 1.4.10); labels
 * stay clean for titles and feeds. tests/reflow.spec.ts names the next word.
 */
const SOFT_BREAKS: Record<string, string> = {
  professional: 'profes\u00ADsional',
  sustainability: 'sustain\u00ADability',
};

export const headingLabel = (label: string): string =>
  label
    .split(' ')
    .map((word) => {
      const broken = SOFT_BREAKS[word.toLowerCase()];
      if (!broken) return word;
      return word[0] === word[0].toUpperCase()
        ? broken[0].toUpperCase() + broken.slice(1)
        : broken;
    })
    .join(' ');

/** Tags sorted alphabetically so built routes stay stable as posts land. */
export const getPostsByTag = async (): Promise<Map<string, BlogPost[]>> => {
  const byTag = new Map<string, BlogPost[]>();

  for (const post of await getSortedPosts()) {
    for (const tag of post.data.tags) {
      byTag.set(tag, [...(byTag.get(tag) ?? []), post]);
    }
  }

  return new Map([...byTag].sort(([a], [b]) => a.localeCompare(b)));
};

export const CATEGORY_FILTERS: readonly CategoryFilterOption[] = [
  { label: 'All Posts', href: BLOG_PATH, category: null },
  ...BLOG_CATEGORIES.map((category) => ({
    label: categoryLabel(category),
    href: categoryHref(category),
    category,
  })),
];

interface CloseRowLink {
  href: string;
  label: string;
}

/** `journeyPost` from src/site.config.ts; a slug that is no published post fails the build. */
const getJourneyPost = async (): Promise<CloseRowLink | null> => {
  if (JOURNEY_POST === null) return null;
  const post = (await getSortedPosts()).find(({ id }) => id === JOURNEY_POST);
  if (post === undefined) {
    throw new Error(
      `src/site.config.ts: journeyPost is "${JOURNEY_POST}", which is no published post in src/content/blog/. Name one, or set it to null.`,
    );
  }
  return { href: postHref(post.id), label: post.data.title };
};

/** A close row's links: the journey post, then `next` as its button; or `next` alone. */
export const closeRowLinks = async (next: CloseRowLink) => {
  const journey = await getJourneyPost();
  return journey
    ? {
        readHref: journey.href,
        readLabel: journey.label,
        actionHref: next.href,
        actionLabel: next.label,
      }
    : { eyebrow: 'Next', readHref: next.href, readLabel: next.label };
};
