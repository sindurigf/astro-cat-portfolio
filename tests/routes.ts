import { readdirSync, existsSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { BLOG_CONTENT_DIR } from '../src/lib/paths';

/**
 * Every built route, hardcoded: Playwright collects tests before `webServer` builds,
 * so reading `dist/` at module scope silently generates wrong tests. a11y.spec.ts "route coverage" catches drift.
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

/** One per category with a published post; empty categories are not built. */
export const CATEGORY_ROUTES = [
  '/blog/professional-journey',
  '/blog/open-source',
] as const;

/** One per tag any post carries, alphabetical, from `src/pages/blog/tag/[tag]/index.astro`. */
export const TAG_ROUTES = [
  '/blog/tag/astro',
  '/blog/tag/career',
  '/blog/tag/community',
  '/blog/tag/examples',
  '/blog/tag/governance',
  '/blog/tag/maintainers',
  '/blog/tag/sustainability',
  '/blog/tag/talks',
] as const;

/** Posts, from `src/pages/blog/[slug].astro`. Newest first. */
export const POST_ROUTES = ['/blog/sample-post', '/blog/sample-talk'] as const;

/** One per deck directory in `src/content/talks/`. */
export const TALK_ROUTES = ['/talks/sample-talk'] as const;

export const TALKS_DIR = 'src/content/talks';

/** The deck directory a talk route is built from. */
export const deckOf = (route: string): string => route.split('/').at(-1)!;

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
 * Post routes from `src/content/blog/`, so a post missing from POST_ROUTES fails
 * with its file name. The `glob()` entry id is the basename; subdirectories break it.
 */
export const postRoutesFromContent = (
  contentDir = BLOG_CONTENT_DIR,
): string[] => {
  if (!existsSync(contentDir)) {
    throw new Error(`Blog content not found at "${contentDir}".`);
  }

  return readdirSync(contentDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => `/blog/${entry.name.replace(/\.md$/, '')}`)
    .sort();
};

/** Posts per category from source frontmatter, so a listing cannot pass by showing its empty state. */
export const postCountByCategory = (
  contentDir = BLOG_CONTENT_DIR,
): Map<string, number> => {
  const counts = new Map<string, number>();
  for (const name of readdirSync(contentDir)) {
    if (!name.endsWith('.md')) continue;
    const category = frontmatterField(
      postFrontmatter(name, contentDir),
      'category',
    );
    if (!category) {
      throw new Error(`${name} has no category in its frontmatter.`);
    }
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }
  return counts;
};

/** The posts each category and tag listing shows, read from the posts' frontmatter. */
export const listingPosts = (
  contentDir = BLOG_CONTENT_DIR,
): Map<string, string[]> => {
  const listings = new Map<string, string[]>(
    [...CATEGORY_ROUTES, ...TAG_ROUTES].map((route) => [route, []]),
  );
  for (const name of readdirSync(contentDir)) {
    if (!name.endsWith('.md')) continue;
    const slug = name.replace(/\.md$/, '');
    const frontmatter = postFrontmatter(name, contentDir);
    const category = frontmatterField(frontmatter, 'category');
    const tags = frontmatterTags(frontmatter);
    for (const route of [
      `/blog/${category}`,
      ...tags.map((tag) => `/blog/tag/${tag}`),
    ]) {
      listings.get(route)?.push(slug);
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
