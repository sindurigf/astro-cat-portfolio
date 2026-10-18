/** The id of an abbreviation's expansion: one per page, so each abbreviation is expanded once. */
export const abbrId = (short: string): string =>
  `abbr-${short.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
