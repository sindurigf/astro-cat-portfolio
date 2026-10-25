/*
 * The About cats: copies each cat's controls from AboutCats.astro into
 * `#cat-spot-<id>`, runs the colony's frame loop and opens the cards. Each cat
 * opens its card; the Zz or eye beside it puts it to sleep or wakes it (SC 2.2.2).
 */
import { IDLE, createMotionLoop } from './motion-loop';
import { markFailed } from './failed-frame';
import {
  clamp,
  createCatRig,
  loadSheet,
  type Sheet,
} from '../lib/about-cats-rig';
import minervaSheet from '../assets/about-cats-minerva.avif';
import rudraSheet from '../assets/about-cats-rudra.avif';
import helaSheet from '../assets/about-cats-hela.avif';
import type { CatId, Ledge } from '../lib/about-cats-types';
import tricksUrl from '../lib/about-cats-tricks-url';
import {
  isTricksData,
  type PlayMove,
  type TricksData,
} from '../lib/about-cats-tricks';
import { CAT_WEIGHTS, EXTENT_WARMUPS } from '../lib/about-cats-moves';
import {
  createColony,
  type CatSpot,
  type Colony,
  type Hold,
} from '../lib/about-cats';

const SHEETS: Record<CatId, Sheet> = {
  minerva: minervaSheet,
  rudra: rudraSheet,
  hela: helaSheet,
};

/* Where each cat starts on its card, 0 to 1, and which way it faces. */
const PLACES: Record<CatId, { start: number; facing: 1 | -1 }> = {
  minerva: { start: 0.85, facing: -1 },
  hela: { start: 0.8, facing: -1 },
  rudra: { start: 0.8, facing: -1 },
};

const isCatId = (value: string | undefined): value is CatId =>
  value !== undefined && value in SHEETS;

/** Fallback slot between warm-ups where requestIdleCallback is missing (Safari). */
const WARM_GAP_MS = 50;

/* One extent per idle slot, so the first move never samples on a frame. */
const warmExtents = (jobs: readonly (() => unknown)[]): void => {
  const [job, ...rest] = jobs;
  if (!job) return;
  job();
  /* The DOM types always declare it, but Safari lacks it. */
  if (typeof window.requestIdleCallback === 'function')
    window.requestIdleCallback(() => warmExtents(rest));
  else setTimeout(() => warmExtents(rest), WARM_GAP_MS);
};

/* A cat's frames start loading this far before its band scrolls into view. */
const SHEET_AHEAD = '50% 0px';
/** The trick list's distance from its band and from the viewport's edges. */
const TRICKS_MARGIN = 16;
/** A list placed lower than this would be too short to use; it moves up instead. */
const TRICKS_MIN_HEIGHT = 176;
const LOADING_NOTE = 'Loading tricks.';
const FAILED_NOTE = 'The tricks did not load. Open the list again.';
/** Brick tops within this many px of each other are one floor. */
const SAME_FLOOR = 1;
/** Space between the card and its cat, or the band on narrow screens. */
const CARD_GAP = 16;
/** The page's side gutter, kept round the card. */
const CARD_MARGIN = 16;
/** From here the card sits beside the cat; below it, above or below the band. */
const SIDE_BY_SIDE = '(min-width: 40rem)';
const SVG_NS = 'http://www.w3.org/2000/svg';

interface Cat {
  id: CatId;
  name: string;
  spot: HTMLElement;
  button: HTMLButtonElement;
  svg: SVGSVGElement;
  /** The sleep control, the paw and its list: gone under reduced motion. */
  controls: HTMLElement[];
  nap: HTMLButtonElement;
  napLabel: HTMLElement;
  paw: HTMLButtonElement;
  list: HTMLElement;
  note: HTMLElement;
  card: HTMLTemplateElement;
  asleep: boolean;
  /** The tricks shown in its list, in order. */
  listed: PlayMove[];
}

const setUp = (): void => {
  const dialog = document.querySelector<HTMLDialogElement>('dialog.cat-dialog');
  const card = dialog?.querySelector<HTMLElement>('.cat-card');
  const napIcons = document.querySelector<HTMLTemplateElement>(
    'template[data-cat-nap-icons]',
  );
  const [sleepIcon, wakeIcon] = [
    ...(napIcons?.content.querySelectorAll('svg') ?? []),
  ];
  if (!dialog || !card || !sleepIcon || !wakeIcon)
    throw new Error('about-cats: the dialog or the sleep icons are missing.');

  const cats: Cat[] = [];
  for (const template of document.querySelectorAll<HTMLTemplateElement>(
    'template[data-cat-controls]',
  )) {
    const id = template.dataset.catControls;
    const spot = document.getElementById(`cat-spot-${id}`);
    const cardTemplate = document.querySelector<HTMLTemplateElement>(
      `template[data-cat-card="${id}"]`,
    );
    if (!isCatId(id) || !spot || !cardTemplate) continue;
    const parts = template.content.cloneNode(true) as DocumentFragment;
    const button = parts.querySelector<HTMLButtonElement>('.cat-button');
    const svg = parts.querySelector<SVGSVGElement>('.cat-svg');
    const nap = parts.querySelector<HTMLButtonElement>('.cat-nap');
    const napLabel = nap?.querySelector<HTMLElement>('.sr-only');
    const paw = parts.querySelector<HTMLButtonElement>('.cat-tricks-button');
    const list = parts.querySelector<HTMLElement>('.cat-tricks');
    const note = list?.querySelector<HTMLElement>('.cat-tricks-note');
    if (!button || !svg || !nap || !napLabel || !paw || !list || !note)
      throw new Error(`about-cats: the controls for ${id} are incomplete.`);
    cats.push({
      id,
      name: template.dataset.catName ?? id,
      spot,
      button,
      svg,
      controls: [
        ...parts.querySelectorAll<HTMLElement>('[data-motion-control]'),
      ],
      nap,
      napLabel,
      paw,
      list,
      note,
      card: cardTemplate,
      asleep: false,
      listed: [],
    });
    spot.append(button);
  }

  const find = (id: CatId): Cat | undefined =>
    cats.find((cat) => cat.id === id);
  const spotCat = (node: Element): Cat | undefined =>
    cats.find((cat) => cat.spot === node);

  let colony: Colony | null = null;
  let pointerAt: { x: number; y: number; time: number } | null = null;

  const showNap = (cat: Cat): void => {
    cat.nap.replaceChildren(
      (cat.asleep ? wakeIcon : sleepIcon).cloneNode(true),
      cat.napLabel,
    );
    cat.napLabel.textContent = cat.asleep
      ? `Wake ${cat.name}`
      : `Put ${cat.name} to sleep`;
  };

  const showControls = (on: boolean): void => {
    /* Removing an open popover fires no toggle, so its paw would stay expanded. */
    if (!on) closeTricks();
    for (const cat of cats) {
      if (on) cat.spot.append(...cat.controls);
      else for (const node of cat.controls) node.remove();
    }
  };

  const toggleNap = (cat: Cat): void => {
    if (!colony) return;
    if (cat.asleep) colony.wake(cat.id, performance.now());
    else colony.nap(cat.id);
    loop.start();
  };

  /* Names and icons are data, fetched after load, so /about's script carries none of them. */
  let tricks: TricksData | null = null;
  let tricksNote = LOADING_NOTE;

  const icon = (name: string): SVGSVGElement => {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'cat-trick-icon');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    for (const shape of tricks?.icons[name] ?? []) {
      const path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('d', shape.d);
      if (shape.solid) path.setAttribute('class', 'cat-trick-solid');
      svg.append(path);
    }
    return svg;
  };

  /** Draws a cat's list once the tricks are in: Random first, then each trick that fits its band. */
  const showTricks = (cat: Cat): void => {
    const data = tricks;
    cat.note.textContent = data ? '' : tricksNote;
    if (!data) return;
    const names: (PlayMove | 'random')[] = ['random', ...cat.listed];
    const current = cat.list.querySelector('ul');
    if (current && names.join() === current.dataset.names) return;
    const ul = document.createElement('ul');
    ul.setAttribute('role', 'list');
    ul.className = 'cat-trick-list';
    ul.dataset.names = names.join();
    names.forEach((name, i) => {
      const trick = data.tricks[name];
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'cat-trick';
      button.autofocus = i === 0;
      button.append(icon(trick.icon), ` ${trick.label} `);
      button.addEventListener('click', () => pickTrick(cat, name));
      const li = document.createElement('li');
      li.append(button);
      ul.append(li);
    });
    if (current) current.replaceWith(ul);
    else cat.list.prepend(ul);
  };

  /* A list that finished loading while its popover was open and focus had not left the paw: `autofocus` only runs on open. */
  const focusFirstTrickIfOnPaw = (): void => {
    if (!document.activeElement?.matches('.cat-tricks-button')) return;
    document
      .querySelector<HTMLElement>('.cat-tricks:popover-open .cat-trick')
      ?.focus();
  };

  const loadTricks = (): void => {
    if (tricks) return;
    tricksNote = LOADING_NOTE;
    cats.forEach(showTricks);
    fetch(tricksUrl)
      .then((response) =>
        response.ok ? response.json() : Promise.reject(response.status),
      )
      .then((data: unknown) => {
        if (!isTricksData(data)) throw new Error('Unexpected tricks data');
        tricks = data;
        cats.forEach(showTricks);
        focusFirstTrickIfOnPaw();
      })
      .catch((error: unknown) => {
        console.error(error);
        tricksNote = FAILED_NOTE;
        cats.forEach(showTricks);
      });
  };

  const closeTricks = (): void =>
    document
      .querySelectorAll<HTMLElement>('.cat-tricks:popover-open')
      .forEach((list) => list.hidePopover());

  /** The open list's paw and where it stood when the list opened. */
  let openPaw: Element | null | undefined;
  let openPawTop = 0;

  /*
   * A viewport-fixed list would stay behind a scrolled page; its own scrolling
   * does not bubble here. A scroll that leaves the paw in place is the one that
   * brought a just-focused paw into view, reported a frame after the list opened.
   */
  const closeTricksScrolledAway = (): void => {
    if (openPaw?.getBoundingClientRect().top !== openPawTop) closeTricks();
  };

  const onTricksToggle = (cat: Cat, event: Event): void => {
    const open = (event as ToggleEvent).newState === 'open';
    const { spot, paw, list } = cat;
    paw.setAttribute('aria-expanded', String(open));
    /* Another list opening reports here before this one closing. */
    if (open) openPaw = paw;
    else if (openPaw === paw) openPaw = null;
    openPawTop = openPaw?.getBoundingClientRect().top ?? 0;
    const method = openPaw ? 'addEventListener' : 'removeEventListener';
    window[method]('scroll', closeTricksScrolledAway);
    if (!open || !colony) return;
    loadTricks();
    const current = colony;
    cat.listed = (Object.keys(CAT_WEIGHTS[cat.id]) as PlayMove[]).filter(
      (name) => current.playable(cat.id, name),
    );
    showTricks(cat);
    const top = clamp(
      spot.getBoundingClientRect().bottom + TRICKS_MARGIN,
      TRICKS_MARGIN,
      window.innerHeight - TRICKS_MIN_HEIGHT - TRICKS_MARGIN,
    );
    const pawBox = paw.getBoundingClientRect();
    /* Moved up onto its paw and sleep control, it would cover them focused (SC 2.4.12): it goes beside them. */
    const right =
      top < pawBox.bottom + TRICKS_MARGIN
        ? pawBox.left - TRICKS_MARGIN
        : pawBox.right;
    /* CSSOM custom properties: the CSP refuses style attributes, not these. */
    list.style.setProperty(
      '--tricks-right',
      `${document.documentElement.clientWidth - right}px`,
    );
    list.style.setProperty('--tricks-top', `${top}px`);
    list.style.setProperty(
      '--tricks-max',
      `${window.innerHeight - top - TRICKS_MARGIN}px`,
    );
  };

  /*
   * An open list would cover the control focus moved on to (SC 2.4.12). After
   * the move: hidePopover() on a list that still holds focus sends it back.
   */
  const onTricksFocusOut = (): void => {
    setTimeout(() => {
      if (!document.activeElement?.closest('.cat-tricks, .cat-tricks-button'))
        closeTricks();
    });
  };

  const pickTrick = (cat: Cat, name: PlayMove | 'random'): void => {
    closeTricks();
    colony?.trick(cat.id, name, performance.now());
    loop.start();
  };

  /* Rects are read here, once a frame before drawing, not on every pointermove. */
  const feedPointer = (): void => {
    if (!colony || !pointerAt) return;
    const rects = new Map<CatId, DOMRect>();
    for (const cat of cats) rects.set(cat.id, cat.svg.getBoundingClientRect());
    colony.pointer(pointerAt.x, pointerAt.y, pointerAt.time, rects);
    pointerAt = null;
  };

  /** The cat a keyboard user has focused: its button shrinks to the cat's hit box, so the focus ring hugs the cat. */
  let hugged: Cat | null = null;

  const hug = (cat: Cat): void => {
    const area = cat.svg
      .querySelector('.cat-hit-area')
      ?.getBoundingClientRect();
    if (!area) return;
    /* The drawing keeps its own box wherever the button goes. */
    const drawn = cat.svg.getBoundingClientRect();
    const band = cat.spot.getBoundingClientRect();
    const box = {
      x: area.left - band.left,
      y: area.top - band.top,
      w: area.width,
      h: area.height,
      'svg-x': drawn.left - area.left,
      'svg-y': drawn.top - area.top,
      'svg-w': drawn.width,
      'svg-h': drawn.height,
    };
    for (const [name, px] of Object.entries(box))
      cat.button.style.setProperty(`--hug-${name}`, `${px}px`);
    cat.button.dataset.hug = '';
  };

  const unhug = (cat: Cat): void => {
    if (hugged === cat) hugged = null;
    delete cat.button.dataset.hug;
  };

  const tick = (now: number): number => {
    if (!colony) return IDLE;
    feedPointer();
    const next = colony.frame(now);
    if (hugged) hug(hugged);
    return next;
  };

  const hold = (cat: Cat, reason: Hold, on: boolean): void => {
    colony?.hold(cat.id, reason, on);
    loop.start();
  };

  /*
   * Only keyboard focus holds a cat still. Not `:focus-visible`: WebKit matches it
   * when a dialog closed by mouse hands focus back to the button.
   */
  let keyboardLast = false;

  const onFocus = (cat: Cat): void => {
    if (!keyboardLast) return;
    hold(cat, 'focus', true);
    hugged = cat;
    hug(cat);
  };

  const onBlur = (cat: Cat): void => {
    hold(cat, 'focus', false);
    unhug(cat);
  };

  /** Each cat's play clock runs only while its own band is on screen. */
  const showSpot = (node: Element, on: boolean): void => {
    const cat = spotCat(node);
    if (!cat || !colony || loop.reducedMotion()) return;
    colony.visible(cat.id, on, performance.now());
  };

  /** The topmost brick edge under each stretch of a band, read from the laid-out wall, so a raised brick is a step. */
  const ledgesUnder = (spot: Element): Ledge[] => {
    const band = spot.getBoundingClientRect();
    const bricks = [
      ...(spot
        .closest('.cat-perch')
        ?.querySelectorAll(':scope > .card, :scope > .card-block > .card') ??
        []),
    ].map((node) => node.getBoundingClientRect());
    const xs = [...new Set(bricks.flatMap((r) => [r.left, r.right]))].sort(
      (a, b) => a - b,
    );
    const ledges: Ledge[] = [];
    /* Seeded left of every brick, so the first pair has no brick between. */
    xs.reduce((left, right) => {
      const mid = (left + right) / 2;
      const tops = bricks
        .filter((r) => r.left <= mid && mid < r.right)
        .map((r) => r.top);
      if (tops.length === 0) return right;
      const drop = Math.round(Math.min(...tops) - band.bottom);
      const last = ledges.at(-1);
      if (last && Math.abs(last.drop - drop) <= SAME_FLOOR)
        last.x1 = right - band.left;
      else ledges.push({ x0: left - band.left, x1: right - band.left, drop });
      return right;
    }, -Infinity);
    return ledges.length > 1 ? ledges : [];
  };

  const layout = (): void => {
    if (!colony) return;
    const sizes = new Map<
      CatId,
      { width: number; height: number; ledges: Ledge[] }
    >();
    for (const { id, svg, spot } of cats) {
      const width = svg.clientWidth;
      const height = spot.clientHeight;
      const ledges = ledgesUnder(spot);
      const below = Math.max(0, ...ledges.map((l) => l.drop));
      /* WebKit hit-tests an SVG's drawing only inside its box, so the box reaches the lowest brick. */
      svg.style.setProperty('--cat-below', `${below}px`);
      svg.setAttribute('viewBox', `0 0 ${width} ${height + below}`);
      sizes.set(id, { width, height, ledges });
    }
    colony.layout(sizes);
    if (hugged) hug(hugged);
  };

  const onPointer = (event: PointerEvent): void => {
    if (!colony || !loop.running() || !colony.watching()) return;
    pointerAt = { x: event.clientX, y: event.clientY, time: performance.now() };
    loop.start();
  };

  const onReducedMotion = (reduced: boolean): void => {
    if (!colony) return;
    if (reduced) {
      /* The cat's controls go; focus on one moves to its cat rather than the page. */
      const focused = document.activeElement;
      if (
        focused instanceof HTMLElement &&
        focused.matches('.cat-nap, .cat-tricks-button, .cat-trick')
      )
        focused
          .closest('.cat-spot')
          ?.querySelector<HTMLElement>('.cat-button')
          ?.focus();
      colony.still();
    } else {
      for (const { spot } of cats)
        showSpot(spot, spot.hasAttribute('data-cat-visible'));
    }
    showControls(!reduced);
  };

  const loop = createMotionLoop({
    frame: tick,
    resume: (now) => colony?.resume(now),
    canRun: () => true,
    onReducedMotion,
    /* A background tab is off screen too, so it does not use up play time. */
    onVisibility: () => {
      for (const { spot } of cats)
        showSpot(
          spot,
          !document.hidden && spot.hasAttribute('data-cat-visible'),
        );
    },
  });

  /** The cat whose card is open. `close` fires a task later, so a quick second cat can open before it lands. */
  let shownFor: Cat | null = null;
  let openCatId: CatId | null = null;

  const afterClose = (): void => {
    const cat = shownFor;
    shownFor = null;
    if (cat) hold(cat, 'card', false);
  };

  let placeFrame = 0;
  let cardObserver: ResizeObserver | null = null;

  const placeCard = (): void => {
    placeFrame = 0;
    const spot = openCatId ? find(openCatId)?.spot : null;
    const cat = spot?.querySelector('.cat-hit-area')?.getBoundingClientRect();
    if (!dialog.open || !spot || !cat) return;
    const band = spot.getBoundingClientRect();
    const box = dialog.getBoundingClientRect();
    const width = document.documentElement.clientWidth;
    const height = window.innerHeight;
    let x: number;
    let y: number;
    if (window.matchMedia(SIDE_BY_SIDE).matches) {
      const toRight = cat.left + cat.width / 2 < width / 2;
      x = toRight ? cat.right + CARD_GAP : cat.left - CARD_GAP - box.width;
      y = cat.top + cat.height / 2 - box.height / 2;
    } else {
      x = (width - box.width) / 2;
      const below = band.bottom + CARD_GAP;
      y =
        below + box.height <= height - CARD_MARGIN
          ? below
          : band.top - CARD_GAP - box.height;
    }
    x = clamp(x, CARD_MARGIN, width - box.width - CARD_MARGIN);
    y = clamp(y, CARD_MARGIN, height - box.height - CARD_MARGIN);
    /* CSSOM custom properties: the CSP refuses style attributes, not these. */
    dialog.style.setProperty('--cat-card-x', `${x}px`);
    dialog.style.setProperty('--cat-card-y', `${y}px`);
    dialog.dataset.placed = '';
  };

  const schedulePlace = (): void => {
    if (!placeFrame) placeFrame = requestAnimationFrame(placeCard);
  };

  const followCat = (on: boolean): void => {
    if (on) {
      window.addEventListener('resize', schedulePlace);
      window.addEventListener('scroll', schedulePlace, {
        capture: true,
        passive: true,
      });
    } else {
      window.removeEventListener('resize', schedulePlace);
      window.removeEventListener('scroll', schedulePlace, { capture: true });
    }
    cardObserver?.disconnect();
    cardObserver = null;
    if (on) {
      cardObserver = new ResizeObserver(schedulePlace);
      cardObserver.observe(card);
    }
    if (!on) {
      cancelAnimationFrame(placeFrame);
      placeFrame = 0;
      delete dialog.dataset.placed;
    }
  };

  /* Rendered after load, so failed-images.ts never sees this photo. */
  const onPhotoError = (event: Event): void => {
    if (event.target instanceof HTMLImageElement) markFailed(event.target);
  };

  const showCard = (cat: Cat | null): void => {
    openCatId = cat?.id ?? null;
    card.querySelector('.cat-dialog-body')?.remove();
    if (cat) {
      const body = cat.card.content.cloneNode(true) as DocumentFragment;
      body.querySelector('img')?.addEventListener('error', onPhotoError);
      card.append(body);
      dialog.setAttribute('aria-labelledby', `cat-dialog-${cat.id}`);
    } else dialog.removeAttribute('aria-labelledby');
  };

  const openCat = (cat: Cat): void => {
    if (shownFor && !dialog.open) afterClose();
    shownFor = cat;
    showCard(cat);
    if (dialog.open) return;
    dialog.showModal();
    /* Placed in the frame it opens, so it never jumps from the center. */
    placeCard();
    followCat(true);
  };

  const onCatClick = (cat: Cat): void => {
    if (!loop.reducedMotion()) hold(cat, 'card', true);
    openCat(cat);
  };

  dialog.addEventListener('close', () => {
    if (dialog.open) return;
    followCat(false);
    showCard(null);
    afterClose();
  });

  /* A drag that starts on the card, selecting text, may end on the backdrop. */
  let pressedInCard = false;
  dialog.addEventListener('pointerdown', (event) => {
    pressedInCard = event.target instanceof Node && card.contains(event.target);
  });

  /* Outside the card is the backdrop; the dialog's own padding keeps the shadow in view. */
  dialog.addEventListener('click', (event) => {
    /* Only the dialog itself: a click on the link or text inside the card never closes it. */
    if (event.target !== dialog || pressedInCard) return;
    const box = card.getBoundingClientRect();
    const inside =
      event.clientX >= box.left &&
      event.clientX <= box.right &&
      event.clientY >= box.top &&
      event.clientY <= box.bottom;
    if (!inside) dialog.close();
  });

  for (const cat of cats) {
    cat.button.addEventListener('click', () => onCatClick(cat));
    cat.button.addEventListener('focus', () => onFocus(cat));
    cat.button.addEventListener('blur', () => onBlur(cat));
    cat.button.addEventListener('pointerenter', () =>
      hold(cat, 'pointer', true),
    );
    cat.button.addEventListener('pointerleave', () =>
      hold(cat, 'pointer', false),
    );
    cat.nap.addEventListener('click', () => toggleNap(cat));
    cat.paw.addEventListener('focusout', onTricksFocusOut);
    cat.list.addEventListener('beforetoggle', (event) =>
      onTricksToggle(cat, event),
    );
    cat.list.addEventListener('focusout', onTricksFocusOut);
    showNap(cat);
    showTricks(cat);
  }

  loop.connect();
  showControls(!loop.reducedMotion());

  const catSpots: CatSpot[] = cats.map((cat) => ({
    id: cat.id,
    rig: createCatRig(cat.svg, cat.id, SHEETS[cat.id]),
    ...PLACES[cat.id],
  }));
  colony = createColony(catSpots, (id, mood, isAsleep) => {
    const cat = find(id);
    if (!cat) return;
    cat.button.dataset.catState = mood;
    if (cat.asleep === isAsleep) return;
    cat.asleep = isAsleep;
    showNap(cat);
  });
  layout();
  if (loop.reducedMotion()) colony.still();
  else {
    warmExtents(EXTENT_WARMUPS);
    loadTricks();
  }

  const resizeObserver = new ResizeObserver(layout);
  for (const { spot } of cats) resizeObserver.observe(spot);
  const sheetObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const spot = catSpots.find(
          (cat) => cat.id === spotCat(entry.target)?.id,
        );
        if (spot) loadSheet(spot.rig);
        sheetObserver.unobserve(entry.target);
      }
    },
    { rootMargin: SHEET_AHEAD },
  );
  for (const { spot } of cats) sheetObserver.observe(spot);
  loop.observe(
    cats.map((cat) => cat.spot),
    {
      onEntries: (entries) => {
        for (const entry of entries) {
          entry.target.toggleAttribute(
            'data-cat-visible',
            entry.isIntersecting,
          );
          showSpot(entry.target, entry.isIntersecting);
        }
      },
    },
  );
  document.addEventListener('pointermove', onPointer, { passive: true });
  document.addEventListener(
    'keydown',
    () => {
      keyboardLast = true;
    },
    { capture: true },
  );
  document.addEventListener(
    'pointerdown',
    () => {
      keyboardLast = false;
    },
    { capture: true },
  );
};

setUp();
