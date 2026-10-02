/* Progressive: photos are plain links and strips scroll natively. */

/** Share of the strip's width. */
const STRIP_STEP = 0.8;

/** `scrollWidth` is rounded, so a strip that fits can measure 1px over. */
const SCROLL_ROUNDING_PX = 1;

/* Cached photos decode faster, so they are not announced as loading. */
const LOADING_DELAY_MS = 200;

const FAILED_MESSAGE = 'This photo could not be loaded.';

const reducedMotion = (): boolean =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const isPlainClick = (event: MouseEvent): boolean =>
  !event.defaultPrevented &&
  event.button === 0 &&
  !event.metaKey &&
  !event.ctrlKey &&
  !event.shiftKey &&
  !event.altKey;

const groupsOf = (root: ParentNode): Map<string, HTMLAnchorElement[]> => {
  const groups = new Map<string, HTMLAnchorElement[]>();
  for (const link of root.querySelectorAll<HTMLAnchorElement>(
    'a[data-photo]',
  )) {
    const name = link.dataset.photo ?? '';
    groups.set(name, [...(groups.get(name) ?? []), link]);
  }
  return groups;
};

const setUpViewer = (viewer: HTMLDialogElement): void => {
  const figure = viewer.querySelector<HTMLElement>('[data-viewer-figure]');
  const caption = viewer.querySelector<HTMLElement>('[data-viewer-caption]');
  const count = viewer.querySelector<HTMLElement>('[data-viewer-count]');
  const steps = viewer.querySelector<HTMLElement>('[data-viewer-steps]');
  const close = viewer.querySelector<HTMLButtonElement>('[data-viewer-close]');
  const message = viewer.querySelector<HTMLElement>('[data-viewer-message]');
  if (!figure || !caption || !count || !steps || !close || !message) {
    throw new Error('photo-viewer: the dialog is missing one of its parts.');
  }

  const image = document.createElement('img');

  /* Empty: the caption carries the description, also when the photo fails. */
  image.alt = '';
  let links: HTMLAnchorElement[] = [];
  let index = 0;

  /* A decode that finishes after a newer request is dropped. */
  let request = 0;

  const position = (): string => `${index + 1} of ${links.length}`;

  /* Decode before swapping, so the live region never runs ahead of paint. */
  const show = async (next: number): Promise<void> => {
    index = (next + links.length) % links.length;
    const link = links[index];
    const alt = link.querySelector('img')?.alt ?? '';
    const token = ++request;

    const waited = window.setTimeout(() => {
      if (token !== request) return;
      figure.dataset.state = 'loading';
      count.textContent = `Loading photo ${position()}`;
    }, LOADING_DELAY_MS);

    const loader = new Image();
    loader.src = link.href;
    const loaded = await loader
      .decode()
      .then(() => true)
      .catch(() => false);

    window.clearTimeout(waited);
    if (token !== request) return;

    caption.textContent = alt;

    if (!loaded) {
      figure.dataset.state = 'failed';
      message.textContent = FAILED_MESSAGE;
      count.textContent = `Photo ${position()} could not be loaded`;
      return;
    }

    delete figure.dataset.state;
    message.textContent = '';
    image.src = loader.src;
    count.textContent = position();
  };

  const open = (group: HTMLAnchorElement[], link: HTMLAnchorElement): void => {
    links = group;
    if (!image.isConnected) figure.prepend(image);
    steps.hidden = group.length < 2;
    void show(group.indexOf(link));
    viewer.showModal();
  };

  for (const group of groupsOf(document).values()) {
    for (const link of group) {
      link.addEventListener('click', (event) => {
        if (!isPlainClick(event)) return;
        event.preventDefault();
        open(group, link);
      });
    }
  }

  for (const button of viewer.querySelectorAll<HTMLButtonElement>(
    '[data-viewer-step]',
  )) {
    const step = Number(button.dataset.viewerStep);
    button.addEventListener('click', () => void show(index + step));
  }

  viewer.addEventListener('keydown', (event) => {
    if (links.length < 2) return;
    if (event.key === 'ArrowRight') void show(index + 1);
    if (event.key === 'ArrowLeft') void show(index - 1);
  });

  close.addEventListener('click', () => viewer.close());

  /* The dialog returns focus to the opener; after stepping, the photo shown is where the reader is. */
  viewer.addEventListener('close', () => links[index]?.focus());
};

const setUpStrips = (): void => {
  /*
   * A photo keyboard-focused part outside the strip is aligned to its start, a
   * snap point: `inline: 'nearest'` lands between snaps and snap undoes it.
   * Keyboard only: moving the strip under a mouse press loses the click.
   */
  for (const strip of document.querySelectorAll<HTMLElement>('.photo-strip')) {
    strip.addEventListener('focusin', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement) || target === strip) return;
      if (!target.matches(':focus-visible')) return;
      const box = target.getBoundingClientRect();
      const view = strip.getBoundingClientRect();
      if (box.left < view.left || box.right > view.right) {
        target.scrollIntoView({ block: 'nearest', inline: 'start' });
      }
    });
  }

  for (const button of document.querySelectorAll<HTMLButtonElement>(
    '[data-strip-scroll]',
  )) {
    const strip = document.getElementById(
      button.getAttribute('aria-controls') ?? '',
    );
    if (!strip) continue;
    const direction = Number(button.dataset.stripScroll);
    const overflows = (): boolean =>
      strip.scrollWidth - strip.clientWidth > SCROLL_ROUNDING_PX;
    const atEdge = (): boolean =>
      direction < 0
        ? strip.scrollLeft <= 0
        : strip.scrollLeft >=
          strip.scrollWidth - strip.clientWidth - SCROLL_ROUNDING_PX;
    const update = (): void => {
      const disabled = String(atEdge());
      if (button.getAttribute('aria-disabled') !== disabled) {
        button.setAttribute('aria-disabled', disabled);
      }
    };
    /* A strip that fits has nothing to scroll, so its arrows leave the tab order. */
    const fit = (): void => {
      const hide = !overflows();
      if (hide && document.activeElement === button) strip.focus();
      button.hidden = hide;
      update();
    };
    fit();
    const resizes = new ResizeObserver(fit);
    resizes.observe(strip);
    for (const tile of strip.children) resizes.observe(tile);
    strip.addEventListener('scroll', update, { passive: true });
    button.addEventListener('click', () => {
      if (atEdge()) return;
      strip.scrollBy({
        left: direction * strip.clientWidth * STRIP_STEP,
        behavior: reducedMotion() ? 'auto' : 'smooth',
      });
    });
  }
};

const viewer = document.querySelector<HTMLDialogElement>('#photo-viewer');
if (viewer) setUpViewer(viewer);
setUpStrips();
