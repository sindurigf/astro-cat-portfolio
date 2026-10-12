import { createHash } from 'node:crypto';
import { isExampleHost } from './example-host.ts';
import { statementRow } from './statement-rows.ts';

/*
 * ACCESSIBILITY.md ships with the template maintainer's name and reporting
 * routes. A fork that publishes without replacing them sends its visitors'
 * barrier reports to her.
 */

export const digest = (value: string): string =>
  createHash('sha256').update(value).digest('hex');

export interface TemplateStatement {
  /** Section 1 field to the SHA-256 of its shipped value. */
  rows: Readonly<Record<string, string>>;
  /** SHA-256 of the hostname of the template's own demo. */
  demoHost: string;
}

/* Digests, not values: scripts/check-leaks.mjs allows the values in ACCESSIBILITY.md only, and the demo's host nowhere. */
export const TEMPLATE_STATEMENT: TemplateStatement = {
  rows: {
    'Accessibility owner':
      '94491d0682f10b6b08326e0ccfde9acaebdef2875c0bd3140ff7505e1d041f5a',
    'Public reporting':
      '393cad2da441ada869f49273b7f0a0ef9058bc27be10718d0151a6051e25cbd2',
    'Private reporting':
      '88df032ad8640fb3f2e2c6ef30bc3d113615fe83731c5171cafd07a7637456e8',
  },
  demoHost: '9e2bfe4808753776a0c5b0e1f2cd43adae4e44610506b6e88acf4a85d944e1af',
};

const PUBLIC_REPORTING = 'Public reporting';

/** The section 1 rows that still hold the template maintainer's value. */
export const templateStatementRows = (
  statement: string,
  template: TemplateStatement = TEMPLATE_STATEMENT,
): string[] =>
  Object.entries(template.rows)
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

/**
 * Why a real site may not build or pass the live check while it still
 * publishes the template maintainer's rows; null on an example host, on the
 * template's own demo (its host, with the shipped Public reporting under the
 * site's repository), and once the rows are replaced.
 */
export const staleStatementNotice = (
  { siteUrl, repositoryUrl, statement }: Site,
  template: TemplateStatement = TEMPLATE_STATEMENT,
): string | null => {
  const { hostname } = new URL(siteUrl);
  if (isExampleHost(hostname)) return null;

  const rows = templateStatementRows(statement, template);
  const ownDemo =
    digest(hostname) === template.demoHost &&
    rows.includes(PUBLIC_REPORTING) &&
    statementRow(statement, PUBLIC_REPORTING).startsWith(`${repositoryUrl}/`);

  return rows.length === 0 || ownDemo
    ? null
    : `ACCESSIBILITY.md section 1 still names the template's maintainer in ${rows.join(', ')}: ` +
        `barrier reports from ${siteUrl} would go to her. Replace those rows with your own.`;
};
