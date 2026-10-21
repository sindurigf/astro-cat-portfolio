/* Let It Fall: the blocks on screen drop into a pile above the button; the same button, Esc or focus entering the page puts them back. */
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

const button = document.querySelector<HTMLButtonElement>('[data-let-it-fall]');
if (!button) {
  throw new Error('let-it-fall: the page lacks its button.');
}

const status = Object.assign(document.createElement('p'), {
  className: 'sr-only',
});
status.setAttribute('role', 'status');
button.after(status);

const say = (text: string): void => {
  status.textContent = '';
  requestAnimationFrame(() => {
    status.textContent = text;
  });
};

const spread = (range: number): number => (Math.random() - 0.5) * 2 * range;

let fallen: HTMLElement[] = [];

const onScreen = (el: Element): boolean => {
  const { top, bottom, height } = el.getBoundingClientRect();
  return height > 0 && bottom > 0 && top < innerHeight;
};

const fall = (): void => {
  const candidates = [...document.querySelectorAll<HTMLElement>(BLOCKS)].filter(
    onScreen,
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
    const drop = Math.max(
      0,
      floor - el.getBoundingClientRect().bottom - Math.random() * PILE_SCATTER,
    );
    el.style.setProperty('--fall-x', `${spread(DRIFT)}px`);
    el.style.setProperty('--fall-y', `${drop}px`);
    el.style.setProperty('--fall-turn', `${spread(TURN_DEG)}deg`);
    el.style.setProperty('--fall-delay', `${index * STAGGER_MS}ms`);
    el.setAttribute('data-fall-block', '');
    el.setAttribute('data-fell', '');
  });
  button.textContent = LABEL_BACK;
  say(FELL);
};

const restore = (): void => {
  for (const el of fallen) el.removeAttribute('data-fell');
  fallen = [];
  button.textContent = LABEL_FALL;
  say(BACK);
};

button.addEventListener('on-demand', () =>
  fallen.length ? restore() : fall(),
);
addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && fallen.length) restore();
});
/* SC 2.4.11: a control moved by the fall is never focused out of place. */
addEventListener('focusin', (event) => {
  if (fallen.length && event.target !== button) restore();
});
