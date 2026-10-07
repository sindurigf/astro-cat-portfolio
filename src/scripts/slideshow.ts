/*
 * `data-current`, not `hidden`: Tailwind's `hidden` is `!important` in an earlier
 * layer, so print could not show the slides. `replaceState` so Back leaves the
 * talk. Until `data-deck-ready`, slides.css shows only the opening slide; a
 * failed start sets `data-deck-failed`, which shows them all.
 */

const SLIDE_ID = /^#slide-(\d+)$/;

const NEXT_KEYS = new Set(['ArrowRight', 'PageDown']);
const PREVIOUS_KEYS = new Set(['ArrowLeft', 'PageUp']);

const TYPING = 'input, textarea, select, [contenteditable]';

/* Share of the viewport one Page Up or Down scrolls, leaving a line of overlap. */
const PAGE_STEP = 0.875;

const required = <T extends Element>(root: ParentNode, selector: string): T => {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`slideshow: ${selector} is missing.`);
  return element;
};

const heading = (slide: HTMLElement): HTMLElement =>
  required<HTMLElement>(slide, '.slide-title');

/* "Pillar 1: Governance", without the space the hidden colon's span leaves. */
const titleOf = (slide: HTMLElement): string =>
  (heading(slide).textContent ?? '')
    .replace(/\s+/g, ' ')
    .replace(' :', ':')
    .trim();

/* Below the sticky header: base.css sets it as html's scroll-padding-top. */
const usableTop = (): number =>
  parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;

const offScreen = (element: HTMLElement): boolean => {
  const box = element.getBoundingClientRect();
  return box.top < 0 || box.bottom > window.innerHeight;
};

const setUnavailable = (button: HTMLButtonElement, unavailable: boolean) => {
  if (unavailable) button.setAttribute('aria-disabled', 'true');
  else button.removeAttribute('aria-disabled');
};

const wire = (deck: HTMLElement): void => {
  const slides = [...deck.querySelectorAll<HTMLElement>('.slide')];
  if (slides.length === 0) throw new Error('slideshow: the deck is empty.');

  const bar = required<HTMLElement>(deck, '[data-deck-bar]');
  const previous = required<HTMLButtonElement>(bar, '[data-deck-previous]');
  const next = required<HTMLButtonElement>(bar, '[data-deck-next]');
  const count = required<HTMLElement>(bar, '[data-deck-count]');
  const part = required<HTMLElement>(bar, '[data-deck-part]');
  const fullscreen = required<HTMLButtonElement>(bar, '[data-deck-fullscreen]');
  const status = required<HTMLElement>(deck, '[data-deck-status]');
  const notes = [...deck.querySelectorAll<HTMLElement>('[data-for-slide]')];
  const upcoming = deck.querySelector<HTMLElement>('[data-deck-upcoming]');
  const channel =
    'BroadcastChannel' in window && deck.dataset.deck
      ? new BroadcastChannel(`talk:${deck.dataset.deck}`)
      : undefined;

  const indexOf = (hash: string): number | undefined => {
    const number = Number(SLIDE_ID.exec(hash)?.[1]);
    const index = slides.findIndex((slide) => slide.id === `slide-${number}`);
    return index === -1 ? undefined : index;
  };

  let current = indexOf(location.hash) ?? 0;

  const show = (
    index: number,
    { focus, address = true }: { focus: boolean; address?: boolean },
  ): void => {
    const target = slides[index];
    const focusWasInside = slides[current].contains(document.activeElement);
    current = index;

    slides.forEach((slide) => {
      slide.toggleAttribute('data-current', slide === target);
    });
    notes.forEach((note) => {
      note.toggleAttribute(
        'data-current',
        `slide-${note.dataset.forSlide}` === target.id,
      );
    });
    if (upcoming) {
      upcoming.textContent = slides[index + 1]
        ? titleOf(slides[index + 1])
        : 'The end of the talk.';
    }
    count.textContent = `${index + 1} / ${slides.length}`;
    part.textContent = target.dataset.part ?? '';
    setUnavailable(previous, index === 0);
    setUnavailable(next, index === slides.length - 1);
    if (address) history.replaceState(null, '', `#${target.id}`);

    if (target.getBoundingClientRect().top < 0) {
      target.scrollIntoView({ block: 'start' });
    }
    /* Focus stays on a bar control (APG carousel), so a taller slide must not push it off screen. */
    const active = document.activeElement;
    if (
      active instanceof HTMLElement &&
      bar.contains(active) &&
      offScreen(active)
    ) {
      active.scrollIntoView({ block: 'nearest' });
    }

    if (focus || focusWasInside) {
      const title = heading(target);
      title.tabIndex = -1;
      title.focus();
    }
  };

  const go = (index: number, { tell = true } = {}): void => {
    if (index < 0 || index >= slides.length || index === current) return;
    show(index, { focus: false });
    status.textContent = `Slide ${index + 1} of ${slides.length}: ${titleOf(
      slides[index],
    )}`;
    if (tell) channel?.postMessage({ slide: slides[index].id });
  };

  channel?.addEventListener('message', (event: MessageEvent<unknown>) => {
    const slide = (event.data as { slide?: unknown } | null)?.slide;
    const index = typeof slide === 'string' ? indexOf(`#${slide}`) : undefined;
    if (index !== undefined) go(index, { tell: false });
  });

  previous.addEventListener('click', () => go(current - 1));
  next.addEventListener('click', () => go(current + 1));

  /* Page keys scroll a slide taller than the screen, as at 400% zoom, before they turn it. */
  const slideRunsPast = (key: string): boolean => {
    const box = slides[current].getBoundingClientRect();
    if (key === 'PageDown') return box.bottom > window.innerHeight;
    if (key === 'PageUp') return box.top < usableTop();
    return false;
  };

  const targetFor = (key: string): number | undefined => {
    if (NEXT_KEYS.has(key)) return current + 1;
    if (PREVIOUS_KEYS.has(key)) return current - 1;
    if (key === 'Home') return 0;
    if (key === 'End') return slides.length - 1;
    return undefined;
  };

  document.addEventListener('keydown', (event) => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey) return;
    if (event.metaKey || event.shiftKey) return;
    const target = event.target;
    /* Only from the deck or the page itself: the footer and header keep their keys. */
    const inDeck =
      target === document.body ||
      target === document.documentElement ||
      (target instanceof Node && deck.contains(target));
    if (!inDeck) return;
    if (target instanceof Element && target.closest(TYPING)) return;
    if (slideRunsPast(event.key)) {
      /* Scrolled here, not left to the browser, which may target the hidden slides. */
      event.preventDefault();
      const direction = event.key === 'PageDown' ? 1 : -1;
      window.scrollBy({
        top: direction * window.innerHeight * PAGE_STEP,
        behavior: 'instant',
      });
      return;
    }
    const to = targetFor(event.key);
    if (to === undefined) return;
    event.preventDefault();
    go(to);
  });

  window.addEventListener('hashchange', () => {
    const index = indexOf(location.hash);
    if (index !== undefined) show(index, { focus: true });
  });

  /* iPhone has no Fullscreen API outside video, so the button stays hidden. */
  if (document.fullscreenEnabled) {
    fullscreen.hidden = false;
    fullscreen.addEventListener('click', () => {
      const request = document.fullscreenElement
        ? document.exitFullscreen()
        : deck.requestFullscreen();
      request.catch(() => {
        status.textContent = 'Full screen is not available here.';
      });
    });
    document.addEventListener('fullscreenchange', () => {
      fullscreen.setAttribute(
        'aria-pressed',
        String(document.fullscreenElement === deck),
      );
    });
  }

  deck.dataset.deckReady = '';
  delete deck.dataset.deckFailed;
  /* The browser scrolled to a linked slide before the others were hidden. */
  const linked = indexOf(location.hash) !== undefined;
  show(current, { focus: false, address: linked });
  if (linked) slides[current].scrollIntoView({ block: 'start' });
};

const deck = document.querySelector<HTMLElement>('[data-deck]');
if (deck) {
  try {
    wire(deck);
  } catch (error) {
    delete deck.dataset.deckReady;
    deck.dataset.deckFailed = '';
    throw error;
  }
}
