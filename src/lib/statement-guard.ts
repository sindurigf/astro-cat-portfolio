import { createHash } from 'node:crypto';
import { isExampleHost } from './example-host.ts';
import { statementRow } from './statement-rows.ts';

/*
 * ACCESSIBILITY.md ships with the template maintainer's name and reporting
 * routes. A fork that publishes without replacing them sends its visitors'
 * barrier reports to her.
 */

/* SHA-256 of each shipped value, not the value: scripts/check-leaks.mjs allows those in ACCESSIBILITY.md only. */
const TEMPLATE_ROWS: Readonly<Record<string, string>> = {
  'Accessibility owner':
    '94491d0682f10b6b08326e0ccfde9acaebdef2875c0bd3140ff7505e1d041f5a',
  'Public reporting':
    '393cad2da441ada869f49273b7f0a0ef9058bc27be10718d0151a6051e25cbd2',
  'Private reporting':
    '88df032ad8640fb3f2e2c6ef30bc3d113615fe83731c5171cafd07a7637456e8',
};

const digest = (value: string): string =>
  createHash('sha256').update(value).digest('hex');

/** The section 1 rows that still hold the template maintainer's value. */
export const templateStatementRows = (statement: string): string[] =>
  Object.entries(TEMPLATE_ROWS)
    .filter(
      ([field, shipped]) => digest(statementRow(statement, field)) === shipped,
    )
    .map(([field]) => field);

interface Site {
  /** `site.url`, after any SITE_URL override. */
  siteUrl: string;
  /** `site.repository`, after any REPOSITORY_URL override. */
  repositoryUrl: string;
  /** ACCESSIBILITY.md, whole. */
  statement: string;
}

const PUBLIC_REPORTING = 'Public reporting';

/**
 * What a build and the live check say when a real site still publishes the
 * template maintainer's rows; null on an example host, on the template's own
 * deployment (its shipped Public reporting sits under the site's repository),
 * and once the rows are replaced.
 */
export const staleStatementNotice = ({
  siteUrl,
  repositoryUrl,
  statement,
}: Site): string | null => {
  if (isExampleHost(new URL(siteUrl).hostname)) return null;

  const rows = templateStatementRows(statement);
  const ownDeployment =
    rows.includes(PUBLIC_REPORTING) &&
    statementRow(statement, PUBLIC_REPORTING).startsWith(`${repositoryUrl}/`);

  return rows.length === 0 || ownDeployment
    ? null
    : `ACCESSIBILITY.md section 1 still names the template's maintainer in ${rows.join(', ')}: ` +
        `barrier reports from ${siteUrl} would go to her. Replace those rows with your own.`;
};
