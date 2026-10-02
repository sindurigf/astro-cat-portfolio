import { readdirSync, existsSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { BLOG_CONTENT_DIR } from '../src/lib/paths';
import { DECK_FILE } from '../src/lib/slides';

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---/;

/**
 * A post's first frontmatter block. Matching over the whole file can hit a fenced
 * example in the prose; `src/lib/sitemap-filter.ts` uses the same bound.
 */
export const frontmatterOf = (source: string, label: string): string => {
  const block = FRONTMATTER.exec(source)?.[1];
  if (block === undefined) {
    throw new Error(`${label} opens with no frontmatter block.`);
  }
  return block;
};

/** One single-line frontmatter field, unquoted; undefined when absent. */
export const frontmatterField = (
  frontmatter: string,
  key: string,
): string | undefined =>
  new RegExp(`^${key}:\\s*(.+?)\\s*$`, 'm')
    .exec(frontmatter)?.[1]
    ?.replace(/^(['"])(.*)\1$/, '$2');

/** A date field's `YYYY-MM-DD`, time dropped; undefined when absent. */
export const frontmatterDay = (
  frontmatter: string,
  key: string,
): string | undefined =>
  /^\d{4}-\d{2}-\d{2}/.exec(frontmatterField(frontmatter, key) ?? '')?.[0];

/** The inline `tags: [a, b]` list of one post's frontmatter. */
export const frontmatterTags = (frontmatter: string): string[] =>
  (/^tags:\s*\[([^\]]*)\]/m.exec(frontmatter)?.[1] ?? '')
    .split(',')
    .map((tag) => tag.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean);

/** A post's frontmatter, by file name or by slug. */
export const postFrontmatter = (
  name: string,
  contentDir = BLOG_CONTENT_DIR,
): string => {
  const file = name.endsWith('.md') ? name : `${name}.md`;
  return frontmatterOf(readFileSync(join(contentDir, file), 'utf8'), file);
};

/**
 * Pages, hardcoded: Playwright collects tests before `webServer` builds, so reading
 * `dist/` at module scope silently generates wrong tests. a11y.spec.ts "route coverage" catches drift.
 */
const PAGE_ROUTES = [
  '/',
  '/404',
  '/about',
  '/career',
  '/contact',
  // `/contact/send/` is absent: on-demand, renders nothing for a GET, not in the
  // build. tests/contact.spec.ts covers it.
  '/contact/sent',
  // Linked from the footer, so every suite that walks ROUTES measures them.
  '/accessibility',
  '/privacy',
  '/credits',
] as const;

interface PostSummary {
  route: string;
  date: string;
  published: boolean;
  category: string;
  tags: string[];
  hasCover: boolean;
  featured: boolean;
}

/** Markdown files in src/content/blog/; git drops the folder once every post is deleted. */
export const postFileNames = (): string[] =>
  existsSync(BLOG_CONTENT_DIR)
    ? readdirSync(BLOG_CONTENT_DIR).filter((name) => name.endsWith('.md'))
    : [];

/** Every post in src/content/blog/, newest first. Source exists at collection; "route coverage" holds it to dist/. */
export const POSTS: readonly PostSummary[] = postFileNames()
  .map((name) => {
    const frontmatter = postFrontmatter(name);
    const date = frontmatterDay(frontmatter, 'date');
    const category = frontmatterField(frontmatter, 'category');
    if (!date || !category) {
      throw new Error(`${name} has no date or no category in its frontmatter.`);
    }
    return {
      route: `/blog/${name.replace(/\.md$/, '')}`,
      date,
      published: frontmatterField(frontmatter, 'placeholder') !== 'true',
      category,
      tags: frontmatterTags(frontmatter),
      hasCover: frontmatterField(frontmatter, 'cover') !== undefined,
      featured: frontmatterField(frontmatter, 'featured') === 'true',
    };
  })
  .sort(
    (a, b) => b.date.localeCompare(a.date) || a.route.localeCompare(b.route),
  );

const PUBLISHED = POSTS.filter((post) => post.published);

export const NO_POST = `no post in ${BLOG_CONTENT_DIR}`;

export const NO_PUBLISHED_POST = `no published post in ${BLOG_CONTENT_DIR}`;

/** `/blog` features the newest published post, whose cover is its one photo. */
export const BLOG_FEATURES_COVER = PUBLISHED[0]?.hasCover === true;

/** The homepage features published posts marked `featured`. */
export const HOME_FEATURES_POST = PUBLISHED.some((post) => post.featured);

/** Posts, from `src/pages/blog/[slug].astro`, placeholders included. Newest first. */
export const POST_ROUTES: readonly string[] = POSTS.map((post) => post.route);

/** The posts every listing shows. Newest first. */
export const PUBLISHED_POST_ROUTES: readonly string[] = PUBLISHED.map(
  (post) => post.route,
);

/** One per category with a published post; empty categories are not built. */
export const CATEGORY_ROUTES: readonly string[] = [
  ...new Set(PUBLISHED.map((post) => `/blog/${post.category}`)),
].sort();

/** One per tag a published post carries, alphabetical, from `src/pages/blog/tag/[tag]/index.astro`. */
export const TAG_ROUTES: readonly string[] = [
  ...new Set(
    PUBLISHED.flatMap((post) => post.tags.map((tag) => `/blog/tag/${tag}`)),
  ),
].sort();

/** Posts, newest first, whose Markdown source passes `matches`. */
export const postsWhere = (matches: (source: string) => boolean): string[] =>
  POST_ROUTES.filter((route) =>
    matches(
      readFileSync(
        join(BLOG_CONTENT_DIR, `${route.split('/').pop()}.md`),
        'utf8',
      ),
    ),
  );

const postsMatching = (pattern: RegExp): string[] =>
  postsWhere((source) => pattern.test(source));

/** A post with a level-2 heading, so its page has a contents list. */
export const CONTENTS_POST_ROUTE: string | undefined =
  postsMatching(/^## /m)[0];

export const NO_CONTENTS_POST =
  'no post has a level-2 heading, so no page has a contents list';

/** Posts with a Markdown image, which post-figure.mjs frames and loads first. */
export const PHOTO_POST_ROUTES = postsMatching(/!\[[^\]]*\]\(/);

export const TALKS_DIR = 'src/content/talks';

/** One per deck directory holding a deck file, as `src/lib/talk-loader.ts` reads them. */
export const TALK_ROUTES: readonly string[] = existsSync(TALKS_DIR)
  ? readdirSync(TALKS_DIR, { withFileTypes: true })
      .filter(
        (entry) =>
          entry.isDirectory() &&
          existsSync(join(TALKS_DIR, entry.name, DECK_FILE)),
      )
      .map((entry) => `/talks/${entry.name}`)
      .sort()
  : [];

export const NO_TALK = `no deck in ${TALKS_DIR}`;

/** The deck directory a talk route is built from. */
export const deckOf = (route: string): string => route.split('/').at(-1)!;

/** A talk and the post sharing its deck's name that links the talk's PDF. */
export interface PairedTalk {
  talk: string;
  post: string;
}

export const PAIRED_TALKS: readonly PairedTalk[] = TALK_ROUTES.flatMap((talk) =>
  postsWhere((source) => source.includes(`](${talk}.pdf)`))
    .filter((post) => deckOf(post) === deckOf(talk))
    .map((post) => ({ talk, post })),
);

/**
 * No `/blog/page/2` until a tenth post (POSTS_PER_PAGE). The `page` segment keeps
 * `/blog/2` from clashing with a numeric category or slug.
 */
const INDEX_ROUTES = ['/blog'] as const;

export const ROUTES = [
  ...PAGE_ROUTES,
  ...INDEX_ROUTES,
  ...CATEGORY_ROUTES,
  ...TAG_ROUTES,
  ...POST_ROUTES,
  ...TALK_ROUTES,
] as const;

export const DIST_DIR = 'dist/client';

export { BLOG_CONTENT_DIR };

/** Published posts per category, so a listing cannot pass by showing its empty state. */
export const postCountByCategory = (): Map<string, number> => {
  const counts = new Map<string, number>();
  for (const { category } of PUBLISHED) {
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }
  return counts;
};

/** The posts each category and tag listing shows, read from the posts' frontmatter. */
export const listingPosts = (): Map<string, string[]> => {
  const listings = new Map<string, string[]>(
    [...CATEGORY_ROUTES, ...TAG_ROUTES].map((route) => [route, []]),
  );
  for (const { route, category, tags } of PUBLISHED) {
    const slug = route.replace('/blog/', '');
    for (const listing of [
      `/blog/${category}`,
      ...tags.map((tag) => `/blog/tag/${tag}`),
    ]) {
      listings.get(listing)?.push(slug);
    }
  }
  return listings;
};

// One category and tag listing per group showing the same posts (longest name
// kept), for walks that do not depend on label length. axe and reflow walk every route.
export const SAMPLED_ROUTES: readonly string[] = (() => {
  const keep = new Map<string, string>();
  for (const [route, posts] of listingPosts()) {
    const group = `${route.startsWith('/blog/tag/') ? 'tag' : 'category'}:${[...posts].sort().join(',')}`;
    const kept = keep.get(group);
    if (!kept || route.length > kept.length) keep.set(group, route);
  }
  const listings = new Set<string>([...CATEGORY_ROUTES, ...TAG_ROUTES]);
  const kept = new Set(keep.values());
  return ROUTES.filter((route) => !listings.has(route) || kept.has(route));
})();

/**
 * Routes from the build's HTML. `404.astro` builds to `404.html`, not
 * `404/index.html`; matching only `index.html` would let `/404` vanish unnoticed.
 */
export const builtPages = (
  distDir = DIST_DIR,
): { route: string; file: string }[] => {
  if (!existsSync(distDir)) {
    throw new Error(
      `Build output not found at "${distDir}". Run \`npm run build\` first.`,
    );
  }

  const found: { route: string; file: string }[] = [];

  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);

      if (entry.isDirectory()) {
        walk(full);
        continue;
      }

      if (!entry.name.endsWith('.html')) continue;

      const segments = relative(distDir, full).split(sep);

      if (entry.name === 'index.html') {
        const rel = segments.slice(0, -1).join('/');
        found.push({ route: rel === '' ? '/' : `/${rel}`, file: full });
        continue;
      }

      segments[segments.length - 1] = entry.name.replace(/\.html$/, '');
      found.push({ route: `/${segments.join('/')}`, file: full });
    }
  };

  walk(distDir);

  return found;
};

export const routesFromBuild = (distDir = DIST_DIR): string[] =>
  builtPages(distDir)
    .map((page) => page.route)
    .sort();

/** Every built page's HTML, keyed by route. Call inside a test body. */
export const builtHtml = (distDir = DIST_DIR): Map<string, string> =>
  new Map(
    builtPages(distDir).map((page) => [
      page.route,
      readFileSync(page.file, 'utf8'),
    ]),
  );

/**
 * Routes whose HTML hydrates `component` (matched on `component-url`), to guard a
 * spec's hardcoded subset of ROUTES. Call inside a test body, never at module scope.
 */
export const islandRoutesFromBuild = (
  component: string,
  distDir = DIST_DIR,
): string[] => {
  const marker = new RegExp(`component-url="[^"]*/${component}\\.[^"]*\\.js"`);

  return builtPages(distDir)
    .filter((page) => marker.test(readFileSync(page.file, 'utf8')))
    .map((page) => page.route)
    .sort();
};

let goldRoutes: string[] | undefined;

/**
 * Built pages, the error page aside, with no link to `route`. The link itself,
 * not the path: a page's own canonical carries its path.
 */
export const pagesNotLinking = (route: string): string[] =>
  builtPages()
    .filter((page) => page.route !== '/404')
    .filter(
      ({ file }) => !readFileSync(file, 'utf8').includes(`href="${route}/"`),
    )
    .map((page) => page.route);

/** Routes whose built HTML has a `.surface-gold` section, read once. Call inside a test body. */
export const goldRoutesFromBuild = (): string[] =>
  (goldRoutes ??= builtPages()
    .filter((page) =>
      /class="[^"]*\bsurface-gold\b/.test(readFileSync(page.file, 'utf8')),
    )
    .map((page) => page.route)
    .sort());
