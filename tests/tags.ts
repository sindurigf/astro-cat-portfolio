/** Tests that never open a page: the `node` project runs them once, the browser projects skip them. */
export const NODE_TAG = '@node';

export const NODE = { tag: NODE_TAG } as const;

/** Tests that read only markup and attributes, the same in every engine: Chromium runs them, the other browsers skip them. */
export const ENGINE_INVARIANT_TAG = '@engine-invariant';

export const ENGINE_INVARIANT = { tag: ENGINE_INVARIANT_TAG } as const;

/** Tests that need a Chromium-only API, such as CDP or layout-shift: only Chromium registers them. */
export const CHROMIUM_ONLY_TAG = '@chromium-only';

export const CHROMIUM_ONLY = { tag: CHROMIUM_ONLY_TAG } as const;

/** Tests of a WebKit-only failure: only WebKit registers them. */
export const WEBKIT_ONLY_TAG = '@webkit-only';

export const WEBKIT_ONLY = { tag: WEBKIT_ONLY_TAG } as const;

/** Forced-colors tests: WebKit ships the media query but paints the author palette (https://bugs.webkit.org/show_bug.cgi?id=225281). */
export const NO_WEBKIT_TAG = '@no-webkit';

export const NO_WEBKIT = { tag: NO_WEBKIT_TAG } as const;

/** Firefox has no `isMobile` touch emulation, and its headless full screen is 1366x768 whatever the viewport: Firefox does not register these. */
export const NO_FIREFOX_TAG = '@no-firefox';

export const NO_FIREFOX = { tag: NO_FIREFOX_TAG } as const;

/** Several tags on one test: Playwright takes a single details object. */
export const tagged = (...details: { tag: string }[]) => ({
  tag: details.map(({ tag }) => tag),
});
