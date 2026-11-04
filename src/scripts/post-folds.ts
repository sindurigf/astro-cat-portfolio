/* Progressive: the folds are native <details> and work without it. Chromium opens them for find-in-page; other engines may not. */

/** Whether it opened the closed fold around the target. Folds never nest. */
const openFoldAround = (target: Element | null): boolean => {
  const fold = target?.closest<HTMLDetailsElement>('details.post-fold');
  if (!fold || fold.open) return false;
  fold.open = true;
  return true;
};

/* A malformed escape such as #50%-off throws URIError; the raw id is the best guess. */
const decodeId = (hash: string): string => {
  const id = hash.slice(1);
  try {
    return decodeURIComponent(id);
  } catch {
    return id;
  }
};

/* A module h2 sits just outside its fold; a link to it opens the module a reader closed. */
const openFor = (id: string): void => {
  const target = id ? document.getElementById(id) : null;
  /* The browser scrolled before the fold opened, to where the closed target was not shown. */
  if (openFoldAround(target)) target?.scrollIntoView();
  const next = target?.nextElementSibling;
  if (next instanceof HTMLDetailsElement && next.matches('[data-module]'))
    next.open = true;
};

/* A link to an id inside a closed fold, where the browser does not open it itself. */
const openForHash = (): void => openFor(decodeId(location.hash));

openForHash();
addEventListener('hashchange', openForHash);

/* Same-page links, including one to the hash already in the address bar, which fires no hashchange. */
document.addEventListener('click', (event) => {
  if (!(event.target instanceof Element)) return;
  const link = event.target.closest<HTMLAnchorElement>('a[href^="#"]');
  if (link) openFor(decodeId(link.hash));
});

const controls = document.querySelector<HTMLElement>('.module-controls');
if (controls) {
  controls.hidden = false;
  controls.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;
    const action =
      event.target.closest<HTMLElement>('[data-modules]')?.dataset.modules;
    if (!action) return;
    for (const fold of document.querySelectorAll<HTMLDetailsElement>(
      'details[data-module]',
    )) {
      fold.open = action === 'open';
    }
  });
}

/* Text Size and long words can outgrow the bar's corner (SC 1.4.4, 1.4.10); the toggle then drops below the bar. */
const STACKED = 'module-panel-stacked';

const overlaps = (a: DOMRect, b: DOMRect): boolean =>
  a.right > b.left && a.left < b.right && a.bottom > b.top && a.top < b.bottom;

const crowded = (panel: HTMLElement): boolean => {
  const heading = panel.querySelector(':scope > h2');
  const toggle = panel.querySelector(':scope > details > summary');
  if (!heading || !toggle) return false;
  if (toggle.scrollWidth > toggle.clientWidth) return true;
  const range = document.createRange();
  range.selectNodeContents(heading);
  const box = toggle.getBoundingClientRect();
  return [...range.getClientRects()].some((line) => overlaps(line, box));
};

const panels = [...document.querySelectorAll<HTMLElement>('.module-panel')];

/* Measured beside first, so a panel goes back once there is room; all unstacked, then all measured, for one layout. */
const fitAll = (): void => {
  for (const panel of panels) panel.classList.remove(STACKED);
  const crowdedNow = panels.map(crowded);
  panels.forEach((panel, index) =>
    panel.classList.toggle(STACKED, crowdedNow[index]),
  );
};

/* At once for a saved Text Size, not a frame later, so the bar settles before the reader sees it shift. */
fitAll();

let fitting = 0;
/* A frame later: changing a watched size inside the callback is a ResizeObserver loop error. */
const watcher = new ResizeObserver(() => {
  cancelAnimationFrame(fitting);
  fitting = requestAnimationFrame(fitAll);
});
for (const panel of panels) {
  watcher.observe(panel);
  const toggle = panel.querySelector(':scope > details > summary');
  if (toggle) watcher.observe(toggle);
}

/* Print shows every fold, then puts the reader's choice back. */
let openedForPrint: HTMLDetailsElement[] = [];
addEventListener('beforeprint', () => {
  openedForPrint = [
    ...document.querySelectorAll<HTMLDetailsElement>(
      'details.post-fold:not([open])',
    ),
  ];
  for (const fold of openedForPrint) fold.open = true;
});
addEventListener('afterprint', () => {
  for (const fold of openedForPrint) fold.open = false;
  openedForPrint = [];
});
