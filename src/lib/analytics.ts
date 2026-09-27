/*
 * Umami Cloud (EU); on when src/site.config.ts sets it (analytics-site.ts). No cookies or browser storage: tests/privacy.spec.ts.
 * public/vendor/umami.js is a byte-identical copy of UMAMI_UPSTREAM_SCRIPT so
 * `script-src` stays same-origin. It goes stale silently: npm run check:umami.
 */

export const UMAMI_UPSTREAM_SCRIPT = 'https://cloud.umami.is/script.js';

export const UMAMI_SCRIPT_PATH = '/vendor/umami.js';

/** When public/vendor/umami.js was last replaced with the upstream bytes. */
export const UMAMI_VENDORED_ON = '2026-09-25';

/*
 * Explicit, not the tracker default, so CSP `connect-src` has one value to
 * match: tests/headers-rules.spec.ts.
 */
export const UMAMI_HOST_URL = 'https://gateway.umami.is';

/* Umami caps names at 50 characters; what was clicked goes in the data. */
export const CLICK_EVENTS = {
  internalLink: 'Internal link',
  outboundLink: 'Outbound link',
  download: 'Download',
  email: 'Email link',
  button: 'Button',
} as const;

export type ClickEventName = (typeof CLICK_EVENTS)[keyof typeof CLICK_EVENTS];

/*
 * Umami bills each property as an event: a click costs up to 4 of the Hobby
 * plan's 100K a month.
 */
export type ClickEventData = {
  label: string;
  area: string;
  target?: string;
};

/* Under Umami's per-value limit. Labels are site text, never user input. */
export const MAX_LABEL_LENGTH = 100;

export const DOWNLOAD_EXTENSIONS = ['.pdf'] as const;
