/* Pure, no imports: src/plugins/post-fold.mjs and the post page read it. Only module headings fold. */

export const FOLD_CLASS = 'post-fold';

/** The edged block around a module's h2 and its fold. */
export const MODULE_PANEL_CLASS = 'module-panel';

/** An h2 that opens a module: "Module 3: Go Live" or "Side Path: Move a Site". */
export const MODULE_HEADING = /^(Module \d+|Side Path):/;

/** "Module 3" or "Side Path": the part of a module heading its toggle names. */
export const moduleName = (heading: string): string | undefined =>
  MODULE_HEADING.exec(heading.trim())?.[1];

/** The toggle's visible word; its name continues "for Module 3" for screen readers. */
export const MODULE_TOGGLE_LABEL = 'Steps';

/* src/plugins/post-fold.mjs writes the class first, so the attribute reads exactly this. */
const FOLD_MARKUP = new RegExp(`<details class="${FOLD_CLASS}"`);

/** Whether a post's rendered HTML has a fold, so the page needs the fold script. */
export const hasFoldMarkup = (html: string): boolean => FOLD_MARKUP.test(html);
