/* Fails the build of a real site whose ACCESSIBILITY.md still names the template's maintainer: /accessibility would publish her address as its own. */
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

export const staleStatementGuard = (siteUrl, repositoryUrl) => ({
  name: 'stale-statement',
  hooks: {
    /* The build only: `astro dev` on a half-edited fork still starts. */
    'astro:build:start': () => {
      const notice = staleStatement(siteUrl, repositoryUrl);
      if (notice) throw new Error(notice);
    },
  },
});
