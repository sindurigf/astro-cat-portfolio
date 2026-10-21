/* Let It Fall: the blocks on screen drop into a pile above the button; the same button, Esc, focus anywhere else or a new window width puts them back. */
export {};

const LABEL_FALL = 'Let It Fall';
const LABEL_BACK = 'Put It Back';
const FELL = 'The page fell down. Press Put It Back to rebuild it.';
const BACK = 'The page is back in place.';
const NOTHING = 'Nothing on screen to drop. Scroll up and try again.';
/* Outermost of these move; their contents ride along. */
const BLOCKS = [
  'main :is(h1, h2, h3, p, ul, ol, figure, img, blockquote, table, pre, .card, .btn-primary, .btn-secondary, .badge)',
  /* The footer too: at the button on a phone, it is most of the screen. */
  'footer :is(.footer-stickers > li, nav li, .footer-copyright, .footer-ai)',
].join(', ');
/* px: how far the pile stops short of the button, and the scatter of its blocks. */
const PILE_GAP = 12;
const PILE_SCATTER = 60;
const DRIFT = 20;
const TURN_DEG = 25;
const STAGGER_MS = 25;
const HALF_TURN_DEG = 180;
/* A second press this soon after the first is the same press, as when both wait on the first load. */
const REPEAT_MS = 300;

const button = document.querySelector<HTMLButtonElement>('[data-let-it-fall]');
const status = document.querySelector<HTMLElement>('[data-let-it-fall-status]');
if (!button || !status) {
  throw new Error('let-it-fall: the footer lacks its button or status.');
}

const say = (text: string): void => {
  status.textContent = '';
  requestAnimationFrame(() => {
    status.textContent = text;
  });
};

const spread = (range: number): number => (Math.random() - 0.5) * 2 * range;

/* A computed color's fourth number is its alpha; three numbers mean opaque. */
const RGBA_PARTS = 4;
const clear = (color: string): boolean => {
  const parts = color.match(/[\d.]+/g) ?? [];
  return parts.length === RGBA_PARTS && Number(parts[RGBA_PARTS - 1]) === 0;
};
/* The fill a block's text was drawn on, so it keeps its contrast wherever it lands (SC 1.4.3). */
const ground = (el: Element): string => {
  for (let at: Element | null = el; at; at = at.parentElement) {
    const fill = getComputedStyle(at).backgroundColor;
    if (!clear(fill)) return fill;
  }
  return getComputedStyle(document.body).backgroundColor;
};

let fallen: HTMLElement[] = [];
let lastPress = -Infinity;
let width = innerWidth;

const onScreen = (el: Element): boolean => {
  const { top, bottom, height } = el.getBoundingClientRect();
  return height > 0 && bottom > 0 && top < innerHeight;
};

/* A block already moved by its own transform, or inside a raised or clipping layer, would land above the button or vanish. */
const free = (el: Element): boolean => {
  if (getComputedStyle(el).transform !== 'none') return false;
  for (
    let up = el.parentElement;
    up && up !== document.body;
    up = up.parentElement
  ) {
    const style = getComputedStyle(up);
    if (style.zIndex !== 'auto' || style.overflow !== 'visible') return false;
  }
  return true;
};

const FALL_VARS = [
  '--fall-x',
  '--fall-y',
  '--fall-turn',
  '--fall-ground',
  '--fall-delay',
];

/* Home at once: drops the fall's transition, clip and offsets, so a block is measured where it rests. */
const home = (el: HTMLElement): void => {
  /* Dropping the transition rule does not stop a running transition; cancelling does. */
  for (const animation of el.getAnimations()) animation.cancel();
  el.removeAttribute('data-fall-block');
  for (const name of FALL_VARS) el.style.removeProperty(name);
};

/* Once a block has climbed home, it drops its transition, so its own hover and press timing come back. */
const settle = (el: HTMLElement): void => {
  void Promise.all(el.getAnimations().map((a) => a.finished)).then(
    () => {
      if (!el.hasAttribute('data-fell')) home(el);
    },
    /* A new fall cancels the climb on purpose; anything else is a real error. */
    (error: unknown) => {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        reportError(error);
      }
    },
  );
};

const fall = (): void => {
  /* A press mid-climb: the climbing blocks snap home first, or their clip and transforms would hide them from the next fall. */
  for (const el of document.querySelectorAll<HTMLElement>(
    '[data-fall-block]',
  )) {
    home(el);
  }
  const candidates = [...document.querySelectorAll<HTMLElement>(BLOCKS)].filter(
    (el) => onScreen(el) && free(el),
  );
  fallen = candidates.filter(
    (el) => !candidates.some((other) => other !== el && other.contains(el)),
  );
  if (!fallen.length) {
    say(NOTHING);
    return;
  }
  const floor =
    Math.min(innerHeight, button.getBoundingClientRect().top) - PILE_GAP;
  fallen.forEach((el, index) => {
    const box = el.getBoundingClientRect();
    const turn = spread(TURN_DEG);
    const radians = (Math.abs(turn) * Math.PI) / HALF_TURN_DEG;
    /* A tilted block reaches lower than its upright box: half its rotated height gain. */
    const tilt =
      (box.width * Math.sin(radians) +
        box.height * Math.cos(radians) -
        box.height) /
      2;
    /* Negative for a block already near the button: it rises just enough to tilt clear of it. */
    const drop = floor - box.bottom - tilt - Math.random() * PILE_SCATTER;
    el.style.setProperty('--fall-x', `${spread(DRIFT)}px`);
    el.style.setProperty('--fall-y', `${drop}px`);
    el.style.setProperty('--fall-turn', `${turn}deg`);
    el.style.setProperty('--fall-ground', ground(el));
    el.style.setProperty('--fall-delay', `${index * STAGGER_MS}ms`);
    el.setAttribute('data-fall-block', '');
    el.setAttribute('data-fell', '');
  });
  width = innerWidth;
  button.textContent = LABEL_BACK;
  say(FELL);
};

const restore = (): void => {
  for (const el of fallen) {
    el.removeAttribute('data-fell');
    settle(el);
  }
  fallen = [];
  button.textContent = LABEL_FALL;
  say(BACK);
};

button.addEventListener('on-demand', () => {
  const now = performance.now();
  if (now - lastPress < REPEAT_MS) return;
  lastPress = now;
  if (fallen.length) restore();
  else fall();
});
addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && fallen.length) restore();
});
/* SC 2.4.11: a control moved by the fall is never focused out of place. */
addEventListener('focusin', (event) => {
  if (fallen.length && event.target !== button) restore();
});
/* Offsets are measured for one width; a rotated phone or a zoom would leave the pile in the wrong place. */
addEventListener('resize', () => {
  if (fallen.length && innerWidth !== width) restore();
});
