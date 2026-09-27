/** WCAG 2.2 values shared by specs. Contrast ratios are in contrast.ts. */

/**
 * SC 2.5.8 Target Size (Minimum): 24x24 CSS px on the target's own box. At
 * least 24, so compare with `toBeGreaterThanOrEqual`; a 24.0px target passes.
 */
export const MIN_TARGET = 24;

/** Controls walked by focus.spec.ts (SC 2.4.7, 2.4.11) and sized by target-size.spec.ts (SC 2.5.8). */
export const FOCUSABLE_SELECTOR =
  'a[href], button, input, select, textarea, summary, video[controls], audio[controls], [role="button"], [tabindex]:not([tabindex="-1"])';

/**
 * Every A and AA tag up to WCAG 2.2, for axe. No rule is disabled and no
 * result is excluded: a failure is a defect to fix in the markup, never here.
 */
export const AXE_TAGS = [
  'wcag2a',
  'wcag2aa',
  'wcag21a',
  'wcag21aa',
  'wcag22aa',
];

/** Hard ceiling for one axe scan, above the 30s default: a scan under load runs past it. */
export const AXE_TIMEOUT_MS = 120_000;

/** SC 1.4.10 Reflow width: 1280px at 400% zoom. */
export const REFLOW_VIEWPORT = { width: 320, height: 720 };

/** REFLOW_VIEWPORT less a classic 15px scrollbar: what a browser at 400% leaves. */
export const NARROW_WIDTH = 305;

export const DESKTOP_VIEWPORT = { width: 1280, height: 800 };

/** A common phone in portrait. */
export const PHONE_VIEWPORT = { width: 390, height: 844 };

/** The override from WCAG SC 1.4.12, applied verbatim. */
export const TEXT_SPACING_OVERRIDE = `
  * {
    line-height: 1.5 !important;
    letter-spacing: 0.12em !important;
    word-spacing: 0.16em !important;
  }
  p, li, h1, h2, h3, h4, h5, h6 { margin-bottom: 2em !important; }
`;
