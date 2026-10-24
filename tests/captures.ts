import { defined } from '../src/lib/defined';

/** Capture group `group` of every match of the global `pattern` in `text`. */
export const captures = (text: string, pattern: RegExp, group = 1): string[] =>
  [...text.matchAll(pattern)].map((match) =>
    defined(match[group], `group ${group} of ${pattern} in "${match[0]}"`),
  );
