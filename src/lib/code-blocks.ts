/* Pure, no imports: posts and slides read it with their raw Markdown. */

/** Whether Markdown may hold a table, the ones src/plugins/table-scroll.mjs wraps: a GFM delimiter row such as `| --- | :-: |`, also in a blockquote, or an HTML `<table>`. */
export const hasTable = (markdown: string): boolean =>
  /^ {0,3}(?:>[ \t]*)*\|?[ \t]*:?-+:?[ \t]*\|[ \t|:-]*$/m.test(markdown) ||
  /<table\b/i.test(markdown);

/** Whether Markdown may hold a fenced or indented code block, the ones src/plugins/code-block.mjs makes a tab stop. A nested list line also counts: a false yes only loads the script. */
export const hasCodeBlock = (markdown: string): boolean =>
  /^ {0,3}(`{3,}|~{3,})/m.test(markdown) || /^(?: {4}|\t)\S/m.test(markdown);
