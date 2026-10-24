/* Pure, no imports: the page reads ACCESSIBILITY.md through Vite, the build guard through plain Node. */

/** One `| Field | Value |` row of ACCESSIBILITY.md, without bold markers or autolink brackets. */
export const statementRow = (source: string, field: string): string => {
  const escaped = field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const value = new RegExp(`^\\|\\s*${escaped}\\s*\\|([^|]+)\\|`, 'm').exec(
    source,
  )?.[1];

  if (value === undefined) {
    throw new Error(
      `ACCESSIBILITY.md has no "${field}" row in its section 1 table; ` +
        'restore it or update src/lib/accessibility-facts.ts.',
    );
  }

  return value
    .trim()
    .replace(/\*\*/g, '')
    .replace(/^<(.*)>$/, '$1');
};
