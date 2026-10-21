/** The root text sizes the Text Size controls step through, as percent of the browser's own size. */
export const TEXT_SCALE_STEPS = [75, 100, 125, 150, 200] as const;

export const TEXT_SCALE_DEFAULT = 100;

/** Set on the root as a plain number (1.25), read by the reading tokens in global.css. */
export const TEXT_SCALE_PROPERTY = '--text-scale';

/** Percent as a string; absent while the size is the default. */
export const TEXT_SCALE_KEY = 'text-scale';
