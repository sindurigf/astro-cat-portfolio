/* Pure, no imports: posts and slides read it with their raw Markdown. */

/** Whether Markdown may hold a fenced or indented code block, the ones src/plugins/code-block.mjs makes a tab stop. A nested list line also counts: a false yes only loads the script. */
export const hasCodeBlock = (markdown: string): boolean =>
  /^ {0,3}(`{3,}|~{3,})/m.test(markdown) || /^(?: {4}|\t)\S/m.test(markdown);
