/* Warns on a build of a real site whose ACCESSIBILITY.md still names the template's maintainer. */
import { readFileSync } from 'node:fs';
import { staleStatementNotice } from '../src/lib/statement-guard.ts';

const STATEMENT = new URL('../ACCESSIBILITY.md', import.meta.url);

/** The notice for this checkout's statement, or null. */
export const staleStatement = (siteUrl, repositoryUrl) =>
  staleStatementNotice({
    siteUrl,
    repositoryUrl,
    statement: readFileSync(STATEMENT, 'utf8'),
  });

export const staleStatementWarning = (siteUrl, repositoryUrl) => ({
  name: 'stale-statement',
  hooks: {
    'astro:build:start': ({ logger }) => {
      const notice = staleStatement(siteUrl, repositoryUrl);
      if (notice) logger.warn(notice);
    },
  },
});
