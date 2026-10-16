/* Progressive: without JavaScript every code block stays a named tab stop, so one that overflows can still be scrolled (SC 2.1.1). */
import { reflectFit } from './scroll-fit';

for (const block of document.querySelectorAll<HTMLElement>(
  '.prose pre[role="group"]',
)) {
  new ResizeObserver(() => reflectFit(block)).observe(block);
}
