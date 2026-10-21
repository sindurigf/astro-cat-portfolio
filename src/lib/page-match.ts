/* Pure: ranks the site's pages by how close their address is to a mistyped one. */

export interface MatchablePage {
  readonly title: string;
  readonly path: string;
}

/* Distances run from 0, the same, to 1, nothing shared. Above this is no match. */
export const MATCH_LIMIT = 0.6;
/* Two words this close or closer count as the same word. */
const SAME_WORD = 0.25;
/* A typed segment that starts a page's segment ("open" of "open-source"). */
const PREFIX_DISTANCE = 0.2;
/* A segment the page has and the address lacks: the address may name its parent. */
const MISSING_SEGMENT = 0.5;
/* A section of a page (/brand/#color) ranks below a page of its own. */
const FRAGMENT_PENALTY = 0.2;

/* Optimal string alignment: a swapped pair of letters ("contcat") costs one edit. */
const editDistance = (a: string, b: string): number => {
  const rows = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) =>
      i === 0 ? j : j === 0 ? i : 0,
    ),
  );
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let best = Math.min(
        rows[i - 1]![j]! + 1,
        rows[i]![j - 1]! + 1,
        rows[i - 1]![j - 1]! + cost,
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        best = Math.min(best, rows[i - 2]![j - 2]! + 1);
      }
      rows[i]![j] = best;
    }
  }
  return rows[a.length]![b.length]!;
};

const closeness = (a: string, b: string): number => {
  if (a === b) return 0;
  if (a && b.startsWith(a)) return PREFIX_DISTANCE;
  return editDistance(a, b) / Math.max(a.length, b.length);
};

/* Hyphens and underscores dropped, so /opensource meets /open-source. */
const segments = (path: string): string[] =>
  path
    .split('#')[0]!
    .toLowerCase()
    .split('/')
    .map((part) => part.trim().replace(/[-_]/g, ''))
    .filter(Boolean);

const words = (text: string): string[] =>
  text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

/* Every segment counts, position by position, so one close last segment cannot win alone. */
const segmentDistance = (
  asked: readonly string[],
  own: readonly string[],
): number => {
  const count = Math.max(asked.length, own.length);
  if (count === 0) return 0;
  let total = 0;
  for (let i = 0; i < count; i += 1) {
    const a = asked[i];
    const b = own[i];
    total +=
      a === undefined ? MISSING_SEGMENT : b === undefined ? 1 : closeness(a, b);
  }
  /* An address shorter than the page's may name only its last segment (/opensource for /blog/open-source/). */
  const slugOnly =
    asked.length === 1 && own.length > 1
      ? (closeness(asked[0]!, own.at(-1)!) + MISSING_SEGMENT) / 2
      : 1;
  return Math.min(total / count, slugOnly);
};

export const rankPages = <T extends MatchablePage>(
  pages: readonly T[],
  requested: string,
): T[] => {
  let wanted = requested;
  try {
    wanted = decodeURIComponent(requested);
  } catch {
    /* A malformed escape is matched as typed. */
  }
  const asked = segments(wanted);
  const askedWords = segments(wanted.replace(/[-_]/g, '/')).flatMap(words);
  /* Half the score is the address, segment by segment; half is how many typed words the page's title or address has. */
  const scored = pages.map((page) => {
    const own = [
      ...words(page.title),
      ...words(page.path),
      ...segments(page.path),
    ];
    const found = askedWords.filter((askedWord) =>
      own.some((word) => closeness(askedWord, word) <= SAME_WORD),
    ).length;
    const wordDistance = askedWords.length ? 1 - found / askedWords.length : 1;
    const score =
      (segmentDistance(asked, segments(page.path)) + wordDistance) / 2 +
      (page.path.includes('#') ? FRAGMENT_PENALTY : 0);
    return { page, score };
  });
  return scored
    .filter(({ score }) => score <= MATCH_LIMIT)
    .sort((a, b) => a.score - b.score)
    .map(({ page }) => page);
};
