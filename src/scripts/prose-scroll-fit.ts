/* Progressive: without JavaScript every code block and table stays a named tab stop, so one that overflows can still be scrolled (SC 2.1.1). */
import { reflectFit } from './scroll-fit';

/*
 * The content is at least its box wide and grows with text spacing
 * (prose.css). Both are watched: a table at its narrowest keeps its size
 * while its box shrinks past it.
 */
for (const content of document.querySelectorAll(
  'pre[role=group]>code, .table-scroll>table',
)) {
  const box = content.parentElement!;
  const observer = new ResizeObserver(() => reflectFit(box));
  observer.observe(content);
  observer.observe(box);
}

/*
 * SC 2.4.12: a table taller than the window, reached backward, comes into
 * view bottom first in Firefox, its top under the sticky header. Its start
 * then scrolls in, below `scroll-padding-top`.
 */
for (const box of document.querySelectorAll<HTMLElement>('.table-scroll')) {
  box.addEventListener('focus', () => {
    const { scrollPaddingTop } = getComputedStyle(document.documentElement);
    if (box.getBoundingClientRect().top < parseFloat(scrollPaddingTop)) {
      box.scrollIntoView({ block: 'start' });
    }
  });
}
