export const HOUR_MS = 3_600_000;
export const DAY_MS = 86_400_000;

const ISO_DAY_LENGTH = 10;

/** "YYYY-MM-DD", the UTC day. */
export const isoDate = (date: Date): string =>
  date.toISOString().slice(0, ISO_DAY_LENGTH);
