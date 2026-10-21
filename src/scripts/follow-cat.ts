/* Points the 404 page's "Follow Me" at the page the mistyped address most likely meant. */
import { rankPages, type MatchablePage } from '../lib/page-match';

const follow = document.querySelector<HTMLAnchorElement>('a[data-follow]');
const destination = follow?.querySelector('[data-follow-to]');
const title = document.querySelector('[data-follow-title]');
const data = document.getElementById('site-pages');
const pages = JSON.parse(data?.textContent ?? '[]') as MatchablePage[];
const best = rankPages(pages, location.pathname)[0];
if (follow && destination && best) {
  follow.href = best.path;
  /* No-break space: an ordinary one beside .sr-only collapses in the copied text. */
  destination.textContent = `\u00a0to ${best.title}`;
  if (title) title.textContent = best.title;
}
