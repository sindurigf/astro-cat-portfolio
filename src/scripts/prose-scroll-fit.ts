/* Progressive: without JavaScript every code block and table stays a named tab stop, so one that overflows can still be scrolled (SC 2.1.1). */
import { reflectFit } from './scroll-fit';

/*
 * Content and box are both watched: a table at its narrowest keeps its size while its box shrinks.
 * SC 2.4.12: the browser shows a tall box reached by keyboard from below bottom first, so
 * scrollIntoView(true) brings its start in; `:focus-visible` guards it: a pointer focus never scrolls.
 */
for (const content of document.querySelectorAll(
  'pre[role=group]>code, .table-scroll>table',
)) {
  const box = content.parentElement!;
  const observer = new ResizeObserver(() => reflectFit(box));
  observer.observe(content);
  observer.observe(box);
  box.addEventListener('focus', () => {
    const room = parseFloat(
      getComputedStyle(document.documentElement).scrollPaddingTop,
    );
    const { top, height } = box.getBoundingClientRect();
    if (
      box.matches(':focus-visible') &&
      top < room &&
      height > innerHeight - room
    ) {
      box.scrollIntoView(true);
    }
  });
}
