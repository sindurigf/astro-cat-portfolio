const DEFAULT_POSTS_PER_PAGE = 9;

export const readPostsPerPage = (raw: string | undefined): number => {
  if (raw === undefined || raw === '') return DEFAULT_POSTS_PER_PAGE;
  if (!/^[1-9]\d*$/.test(raw)) {
    throw new Error(`POSTS_PER_PAGE=${raw} is not a positive whole number.`);
  }
  return Number(raw);
};

/**
 * Posts on one page of /blog. The build reads `POSTS_PER_PAGE` so the Worker
 * suite can paginate today's few posts; `?.` because Playwright imports this
 * outside Vite, where `import.meta.env` is undefined.
 */
export const POSTS_PER_PAGE = readPostsPerPage(import.meta.env?.POSTS_PER_PAGE);

export const pageCount = (total: number): number =>
  Math.max(1, Math.ceil(total / POSTS_PER_PAGE));

/** The slice of items on a 1-indexed page. */
export const postsOnPage = <T>(posts: readonly T[], page: number): T[] =>
  posts.slice((page - 1) * POSTS_PER_PAGE, page * POSTS_PER_PAGE);
