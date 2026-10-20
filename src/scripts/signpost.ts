/*
 * The 404 page's signpost: turns the section links 404.astro renders into signs
 * that choose a way, and lists the pages down the chosen one. The Cat's way,
 * toward the page the address most likely meant, starts chosen.
 */
import { rankPages } from '../lib/page-match';
import { childrenOf, type SignpostPage } from '../lib/signpost-pages';

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
  const pagesColumn = root?.querySelector<HTMLElement>('[data-pending]');
  const status = root?.querySelector('[aria-live]');
  if (!root || !data || !pagesColumn || !status) return;
  const pages = JSON.parse(data.textContent ?? '[]') as SignpostPage[];
  const home = pages.find((page) => page.trail.length === 1);
  if (!home) return;
  const byPath = new Map(pages.map((page) => [page.path, page]));
  const best = rankPages(
    pages.filter((page) => page !== home),
    location.pathname,
  )[0];
  const onCatsWay = (page: SignpostPage): boolean =>
    best?.trail.includes(pages.indexOf(page)) ?? false;

  const signs = [
    ...root.querySelectorAll<HTMLAnchorElement>('a.crossroads-sign'),
  ].flatMap((link) => {
    const section = byPath.get(link.dataset.path ?? '');
    if (!section) return [];
    const sign = make('button', link.className, section.title);
    sign.type = 'button';
    if (onCatsWay(section)) {
      sign.append(make('span', 'sr-only', ' (the Cat went this way)'));
    }
    link.replaceWith(sign);
    return [{ sign, section }];
  });
  let chosen = signs.find(({ section }) => onCatsWay(section)) ?? signs[0];
  if (!chosen) return;

  const pagesLabel = make('div', 'crossroads-heading label');
  pagesLabel.id = 'crossroads-pages-label';
  const links = make('ul', 'crossroads-pages');
  links.setAttribute('role', 'list');
  links.setAttribute('aria-labelledby', pagesLabel.id);
  pagesColumn.append(pagesLabel, links);

  /* A #fragment of a page is listed only when it is the Cat's pick, so no list outgrows the signs. */
  const draw = (): void => {
    const { section } = chosen!;
    const down = [
      section,
      ...childrenOf(pages, section).filter(
        (page) => !page.path.includes('#') || page === best,
      ),
    ];
    pagesLabel.textContent = `Down the ${section.title} Way`;
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
    for (const entry of signs) {
      entry.sign.setAttribute('aria-pressed', String(entry === chosen));
    }
  };

  for (const entry of signs) {
    entry.sign.addEventListener('click', () => {
      chosen = entry;
      draw();
      const count = links.children.length;
      status.textContent = `${count} ${count === 1 ? 'page' : 'pages'} down the ${entry.section.title} way.`;
    });
  }
  draw();
  delete pagesColumn.dataset.pending;
};

start();
