/* Progressive: without JavaScript every code block stays a named tab stop, so one that overflows can still be scrolled (SC 2.1.1). */
import { reflectFit } from './scroll-fit';

/*
 * The <code> is as wide as its text and at least its block (prose.css), so it
 * resizes both when the block does and when text spacing widens the text.
 */
for (const code of document.querySelectorAll('pre[role=group]>code')) {
  new ResizeObserver(() => reflectFit(code.parentElement!)).observe(code);
}
