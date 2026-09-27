/* Pure strings, no imports: every page links these, and astro:content must not follow them in. */
export const BLOG_PATH = '/blog/';
export const ABOUT_PATH = '/about/';
export const CAREER_PATH = '/career/';
export const CONTACT_PATH = '/contact/';
export const CONTACT_SEND_PATH = '/contact/send/';
export const CONTACT_SENT_PATH = '/contact/sent/';
export const SITEMAP_PATH = '/sitemap-index.xml';
export const SITE_FEED_PATH = '/rss.xml';

/* Relative to the project root, for the loader and for plain-Node readers. */
export const BLOG_CONTENT_DIR = './src/content/blog';

export const postHref = (slug: string): string => `${BLOG_PATH}${slug}/`;

export const markdownSourcePath = (slug: string): string =>
  `${BLOG_PATH}${slug}.md`;

export const categoryHref = (category: string): string =>
  `${BLOG_PATH}${category}/`;

export const TAG_PATH = `${BLOG_PATH}tag/`;

export const tagHref = (tag: string): string => `${TAG_PATH}${tag}/`;

export const tagFeedPath = (tag: string): string => `${tagHref(tag)}rss.xml`;

/* `/blog/page/<n>`, not `/blog/<n>`, which `[category]` and `[slug]` share. */
export const PAGED_SEGMENT = 'page';

export const indexPageHref = (page: number): string =>
  page <= 1 ? BLOG_PATH : `${BLOG_PATH}${PAGED_SEGMENT}/${page}/`;
