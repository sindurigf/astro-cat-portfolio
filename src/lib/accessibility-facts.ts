import source from '../../ACCESSIBILITY.md?raw';

/*
 * The volatile facts on /accessibility, read from the ACCESSIBILITY.md §1
 * table. Throws rather than defaulting: a silent default would publish a
 * statement nobody checked.
 */

/** One `| Field | Value |` row, without bold markers or autolink brackets. */
const tableValue = (field: string): string => {
  const escaped = field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`^\\|\\s*${escaped}\\s*\\|([^|]+)\\|`, 'm').exec(
    source,
  );

  if (!match) {
    throw new Error(
      `ACCESSIBILITY.md has no "${field}" row in its section 1 table; ` +
        'restore it or update src/lib/accessibility-facts.ts.',
    );
  }

  return match[1]
    .trim()
    .replace(/\*\*/g, '')
    .replace(/^<(.*)>$/, '$1');
};

export const accessibilityFacts = {
  targetStandard: tableValue('Target standard'),
  conformanceStatus: tableValue('Conformance status'),
  /** ISO date. */
  lastReviewed: tableValue('Last reviewed'),
  publicReporting: tableValue('Public reporting'),
  privateReporting: tableValue('Private reporting'),
} as const;
