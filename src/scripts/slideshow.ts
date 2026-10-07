/*
 * `data-current`, not `hidden`: Tailwind's `hidden` is `!important` in an earlier
 * layer, so print could not show the slides. `replaceState` so Back leaves the
 * talk. Until `data-deck-ready`, slides.css shows only the opening slide; a
 * failed start sets `data-deck-failed`, which shows them all.
 */

const SLIDE_ID = /^#slide-(\d+)$/;

const NEXT_KEYS = new Set(['ArrowRight', 'PageDown']);
const PREVIOUS_KEYS = new Set(['ArrowLeft', 'PageUp']);

/* Presentation-app keys, full screen only: on the page they scroll as usual. */
const FULL_SCREEN_NEXT_KEYS = new Set([' ', 'Enter', 'ArrowDown']);
const FULL_SCREEN_PREVIOUS_KEYS = new Set(['ArrowUp']);

/* Keys that scroll a slide taller than its screen or frame before they turn it. */
const SCROLL_FIRST_KEYS = new Set(['PageDown', 'PageUp', ' ']);

const TYPING = 'input, textarea, select, [contenteditable]';

/* Space and Enter on these press or follow them, so the deck leaves them alone. */
const ACTIVATES = 'a[href], button, summary, [tabindex]:not([tabindex="-1"])';

const CURSOR_IDLE_MS = 2000;

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

  const ends = new Map([
    ['Home', 0],
    ['End', slides.length - 1],
  ]);

  const inFullScreen = (): boolean => document.fullscreenElement === deck;

  /* The presenter view keeps its controls in full screen, so only the audience deck takes presentation keys. */
  const presenting = (): boolean =>
    inFullScreen() && !deck.classList.contains('presenter');

  const indexOf = (hash: string): number | undefined => {
    const number = Number(SLIDE_ID.exec(hash)?.[1]);
    const index = slides.findIndex((slide) => slide.id === `slide-${number}`);
    return index === -1 ? undefined : index;
  };

  let current = indexOf(location.hash) ?? 0;

  const show = (
    index: number,
    { focus, address = true }: { focus: boolean; address?: boolean },
  ): boolean => {
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

    target.scrollTop = 0;
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

    const moveFocus = focus || focusWasInside;
    if (moveFocus) {
      const title = heading(target);
      title.tabIndex = -1;
      title.focus();
    }
    return moveFocus;
  };

  const go = (index: number, { tell = true } = {}): void => {
    if (index < 0 || index >= slides.length || index === current) return;
    /* A focused heading is announced, so the live region would say it twice. */
    const announced = show(index, { focus: false });
    status.textContent = announced
      ? ''
      : `Slide ${index + 1} of ${slides.length}: ${titleOf(slides[index])}`;
    if (tell) channel?.postMessage({ slide: slides[index].id });
  };

  channel?.addEventListener('message', (event: MessageEvent<unknown>) => {
    const slide = (event.data as { slide?: unknown } | null)?.slide;
    const index = typeof slide === 'string' ? indexOf(`#${slide}`) : undefined;
    if (index !== undefined) go(index, { tell: false });
  });

  previous.addEventListener('click', () => go(current - 1));
  next.addEventListener('click', () => go(current + 1));

  /* In full screen slides.css makes the slide its own scroller; on the page the window scrolls. */
  const scrollsInside = (slide: HTMLElement): boolean =>
    getComputedStyle(slide).overflowY !== 'visible';

  /* Scroll-first keys scroll a slide taller than the screen, as at 400% zoom, before they turn it. */
  const slideRunsPast = (forward: boolean): boolean => {
    const slide = slides[current];
    if (scrollsInside(slide)) {
      return forward
        ? slide.scrollTop + slide.clientHeight < slide.scrollHeight - 1
        : slide.scrollTop > 0;
    }
    const box = slide.getBoundingClientRect();
    return forward ? box.bottom > window.innerHeight : box.top < usableTop();
  };

  const scrollSlide = (forward: boolean): void => {
    const slide = slides[current];
    const direction = forward ? 1 : -1;
    const scroller = scrollsInside(slide) ? slide : window;
    const height = scrollsInside(slide)
      ? slide.clientHeight
      : window.innerHeight;
    scroller.scrollBy({
      top: direction * height * PAGE_STEP,
      behavior: 'instant',
    });
  };

  const isNext = (key: string): boolean =>
    NEXT_KEYS.has(key) || (presenting() && FULL_SCREEN_NEXT_KEYS.has(key));

  const isPrevious = (key: string): boolean =>
    PREVIOUS_KEYS.has(key) ||
    (presenting() && FULL_SCREEN_PREVIOUS_KEYS.has(key));

  document.addEventListener('keydown', (event) => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey) return;
    if (event.metaKey) return;
    const key = event.key;
    const backSpace = key === ' ' && event.shiftKey && presenting();
    if (event.shiftKey && !backSpace) return;
    const target = event.target;
    /* Only from the deck or the page itself: the footer and header keep their keys. */
    const inDeck =
      target === document.body ||
      target === document.documentElement ||
      (target instanceof Node && deck.contains(target));
    if (!inDeck) return;
    if (target instanceof Element && target.closest(TYPING)) return;
    const pressesControl = key === ' ' || key === 'Enter';
    if (
      pressesControl &&
      target instanceof Element &&
      target.closest(ACTIVATES)
    ) {
      return;
    }
    const forward = !backSpace && isNext(key);
    const backward = backSpace || isPrevious(key);
    if (!forward && !backward && !ends.has(key)) return;
    event.preventDefault();
    /* Scrolled here, not left to the browser, which may target the hidden slides. */
    if (SCROLL_FIRST_KEYS.has(key) && slideRunsPast(forward)) {
      scrollSlide(forward);
      return;
    }
    /* A held key turns one slide, not the deck. */
    if (event.repeat) return;
    if (forward) go(current + 1);
    else if (backward) go(current - 1);
    else go(ends.get(key) ?? current);
  });

  window.addEventListener('hashchange', () => {
    const index = indexOf(location.hash);
    if (index !== undefined) show(index, { focus: true });
  });

  let idleTimer: number | undefined;
  const wake = (): void => {
    window.clearTimeout(idleTimer);
    delete deck.dataset.deckIdle;
    if (!presenting()) return;
    idleTimer = window.setTimeout(() => {
      deck.dataset.deckIdle = '';
    }, CURSOR_IDLE_MS);
  };
  deck.addEventListener('pointermove', wake);

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
    /* The audience deck hides its bar in full screen, so focus goes to the slide and back to the button. */
    let wasFullScreen = false;
    document.addEventListener('fullscreenchange', () => {
      const entered = inFullScreen();
      if (entered === wasFullScreen) return;
      wasFullScreen = entered;
      fullscreen.setAttribute('aria-pressed', String(entered));
      wake();
      if (presenting()) show(current, { focus: true, address: false });
      else if (!entered) fullscreen.focus();
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
