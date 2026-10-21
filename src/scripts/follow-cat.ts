/* Points the 404 page's "Follow Me" at the page the mistyped address most likely meant. */
import { rankPages, type MatchablePage } from '../lib/page-match';

const follow = document.querySelector<HTMLAnchorElement>('a[data-follow]');
const data = document.getElementById('site-pages');
const pages = JSON.parse(data?.textContent ?? '[]') as MatchablePage[];
const best = rankPages(pages, location.pathname)[0];
if (follow && best) {
  follow.href = best.path;
  follow.textContent = `Follow Me to ${best.title}`;
}
