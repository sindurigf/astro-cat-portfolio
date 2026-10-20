/*
 * The 404 page's crossroads: the site's sections as signs, and the pages down
 * the chosen one as links. The Cat's way, toward the page the address most
 * likely meant, starts chosen. The data comes from #signpost-pages.
 */
import { rankPages } from '../lib/page-match';
import type { SignpostPage } from '../lib/signpost-pages';

/* Carroll's text, Project Gutenberg #11, chapter VI. */
const CAT_LINE =
  '“That depends a good deal on where you want to get to,” said the Cat.';
const CAT_PICK = 'The Cat’s pick';

const make = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

const start = (): void => {
  const root = document.getElementById('crossroads');
  const data = document.getElementById('signpost-pages');
  const guide = root?.querySelector<HTMLElement>('[data-guide]');
  if (!root || !data || !guide) return;
  const pages = JSON.parse(data.textContent ?? '[]') as SignpostPage[];
  const home = pages.find((page) => page.trail.length === 1);
  if (!home) return;

  const childrenOf = (page: SignpostPage): SignpostPage[] => {
    const index = pages.indexOf(page);
    return pages.filter(
      (other) =>
        other.trail.length === page.trail.length + 1 &&
        other.trail.at(-2) === index,
    );
  };
  const sections = childrenOf(home);
  const best = rankPages(
    pages.filter((page) => page !== home),
    location.pathname,
  )[0];
  const onCatsWay = (page: SignpostPage): boolean =>
    best?.trail.includes(pages.indexOf(page)) ?? false;
  let chosen = sections.find(onCatsWay) ?? sections[0];
  if (!chosen) return;

  const cat = make('p', 'crossroads-cat', CAT_LINE);
  const signsLabel = make('div', 'crossroads-heading label', 'Sections');
  signsLabel.id = 'crossroads-signs-label';
  const signs = make('ul', 'crossroads-signs');
  signs.setAttribute('role', 'list');
  signs.setAttribute('aria-labelledby', signsLabel.id);
  const pole = make('div', 'crossroads-pole');
  pole.setAttribute('aria-hidden', 'true');
  const pagesLabel = make('div', 'crossroads-heading label');
  pagesLabel.id = 'crossroads-pages-label';
  const links = make('ul', 'crossroads-pages');
  links.setAttribute('role', 'list');
  links.setAttribute('aria-labelledby', pagesLabel.id);
  const status = make('p', 'sr-only');
  status.setAttribute('aria-live', 'polite');

  const drawPages = (): void => {
    const down = [chosen!, ...childrenOf(chosen!)];
    pagesLabel.textContent = `Down the ${chosen!.title} Way`;
    links.replaceChildren(
      ...down.map((page) => {
        const item = make('li');
        const link = make('a', 'crossroads-page', page.title);
        link.href = page.path;
        if (page === best) {
          link.classList.add('crossroads-page-pick');
          link.append(make('span', 'crossroads-pick label', CAT_PICK));
        }
        item.append(link);
        return item;
      }),
    );
    for (const sign of signs.querySelectorAll('button')) {
      sign.setAttribute(
        'aria-pressed',
        String(sign.dataset.path === chosen!.path),
      );
    }
  };

  signs.append(
    ...sections.map((section) => {
      const item = make('li', 'crossroads-sign-row');
      const sign = make('button', 'crossroads-sign label', section.title);
      sign.type = 'button';
      sign.dataset.path = section.path;
      sign.addEventListener('click', () => {
        chosen = section;
        drawPages();
        const count = links.children.length;
        status.textContent = `${count} ${count === 1 ? 'page' : 'pages'} down the ${section.title} way.`;
      });
      item.append(sign);
      if (onCatsWay(section)) {
        sign.append(make('span', 'sr-only', ' (the Cat went this way)'));
      }
      return item;
    }),
  );

  const signsColumn = make('div', 'crossroads-column');
  signsColumn.append(signsLabel, signs);
  const pagesColumn = make('div', 'crossroads-column');
  pagesColumn.append(pagesLabel, links);
  const map = make('div', 'crossroads-map');
  map.append(signsColumn, pole, pagesColumn);

  guide.hidden = false;
  pole.append(guide);
  drawPages();
  root.querySelector('[data-fallback]')?.remove();
  root.prepend(cat, map, status);
};

start();
