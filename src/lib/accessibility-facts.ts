import source from '../../ACCESSIBILITY.md?raw';
import { statementRow } from './statement-rows';

/*
 * The volatile facts on /accessibility, read from the ACCESSIBILITY.md §1
 * table. Throws rather than defaulting: a silent default would publish a
 * statement nobody checked.
 */

const tableValue = (field: string): string => statementRow(source, field);

export const accessibilityFacts = {
  targetStandard: tableValue('Target standard'),
  conformanceStatus: tableValue('Conformance status'),
  /** ISO date. */
  lastReviewed: tableValue('Last reviewed'),
  publicReporting: tableValue('Public reporting'),
  privateReporting: tableValue('Private reporting'),
} as const;
