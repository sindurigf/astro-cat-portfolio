/* Pure: the 404 signpost's map. Each page carries its trail from Home, the way its breadcrumb would read. */
import { CAREER_PATH } from './paths';
import { CV_PATH } from './profiles';
import type { SitePage } from './site-pages';

export interface SignpostPage {
  readonly title: string;
  readonly path: string;
  /** Indexes into the same list, Home first and the page itself last. */
  readonly trail: readonly number[];
}

const HOME_PATH = '/';

/* The nearest page above: the page a #fragment belongs to, else the longest path that contains this one. */
const parentOf = (
  path: string,
  paths: readonly string[],
  cvPath: string | null,
): string | null => {
  if (path === HOME_PATH) return null;
  /* The CV is a file at the root, but a reader finds it from Career. */
  if (path === cvPath && paths.includes(CAREER_PATH)) return CAREER_PATH;
  const [base, fragment] = path.split('#');
  if (fragment !== undefined && base && paths.includes(base)) return base;
  const above = paths
    .filter(
      (other) =>
        !other.includes('#') &&
        other !== path &&
        other.endsWith('/') &&
        path.startsWith(other),
    )
    .sort((a, b) => b.length - a.length);
  return above[0] ?? HOME_PATH;
};

export const signpostPages = (
  pages: readonly SitePage[],
  cvPath: string | null = CV_PATH,
): SignpostPage[] => {
  const paths = pages.map((page) => page.path);
  const indexOf = new Map(paths.map((path, index) => [path, index]));
  const trailOf = (path: string, seen: Set<string> = new Set()): number[] => {
    const index = indexOf.get(path);
    if (index === undefined || seen.has(path)) return [];
    seen.add(path);
    const parent = parentOf(path, paths, cvPath);
    return [...(parent ? trailOf(parent, seen) : []), index];
  };
  return pages.map((page) => ({
    title: page.title,
    path: page.path,
    trail: trailOf(page.path),
  }));
};

/* The pages one step below `page` on its trail. */
export const childrenOf = (
  pages: readonly SignpostPage[],
  page: SignpostPage,
): SignpostPage[] => {
  const index = pages.indexOf(page);
  return pages.filter(
    (other) =>
      other.trail.length === page.trail.length + 1 &&
      other.trail.at(-2) === index,
  );
};

export const sectionsOf = (pages: readonly SignpostPage[]): SignpostPage[] => {
  const home = pages.find((page) => page.trail.length === 1);
  return home ? childrenOf(pages, home) : [];
};
