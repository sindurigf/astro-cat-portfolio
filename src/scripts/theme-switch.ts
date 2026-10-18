/*
 * The theme menu: System, Light or Dark. BaseLayout.astro's head script sets
 * `data-theme` before first paint; this keeps it, the radios and the OS in step.
 */
import {
  THEME_STORAGE_KEY,
  isTheme,
  type Theme,
  type ThemeChoice,
} from '../lib/theme';

const root = document.documentElement;
const systemLight = matchMedia('(prefers-color-scheme: light)');

/** Undefined when storage is unavailable. */
const storedChoice = (): ThemeChoice | undefined => {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    return isTheme(saved) ? saved : 'system';
  } catch {
    return undefined;
  }
};

const store = (choice: ThemeChoice): void => {
  try {
    if (choice === 'system') localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, choice);
  } catch {
    /* Storage is unavailable; the choice holds for this page. */
  }
};

/* Blocked storage leaves only what was chosen on this page. */
let pageChoice: ThemeChoice = storedChoice() ?? 'system';
const currentChoice = (): ThemeChoice => storedChoice() ?? pageChoice;

const resolve = (choice: ThemeChoice): Theme =>
  choice === 'system' ? (systemLight.matches ? 'light' : 'dark') : choice;

const menus = [...document.querySelectorAll<HTMLElement>('.theme-menu')];
const buttons = [
  ...document.querySelectorAll<HTMLButtonElement>('.theme-switch'),
];

/* Every menu reads the one choice, so two on a page never disagree. */
const apply = (choice: ThemeChoice): void => {
  root.dataset.theme = resolve(choice);
  for (const menu of menus) {
    for (const radio of menu.querySelectorAll<HTMLInputElement>(
      'input[type="radio"]',
    )) {
      radio.checked = radio.value === choice;
    }
  }
};

const choose = (choice: ThemeChoice): void => {
  pageChoice = choice;
  store(choice);
  apply(choice);
};

/*
 * Opens toward the larger side of the viewport, so it fits beside a button
 * anywhere on the page; CSS caps its size to the room left.
 */
const place = (button: HTMLElement, menu: HTMLElement): void => {
  const box = button.getBoundingClientRect();
  const width = root.clientWidth;
  const height = root.clientHeight;
  const opensRight = box.left + box.width / 2 < width / 2;
  const opensDown = box.top + box.height / 2 < height / 2;
  const inline = opensRight ? box.left : width - box.right;
  const block = opensDown ? box.bottom : height - box.top;
  const set = (name: string, value: number | null): void =>
    menu.style.setProperty(name, value === null ? 'auto' : `${value}px`);
  set('--theme-menu-left', opensRight ? inline : null);
  set('--theme-menu-right', opensRight ? null : inline);
  set('--theme-menu-top', opensDown ? block : null);
  set('--theme-menu-bottom', opensDown ? null : block);
  set('--theme-menu-inline', inline);
  set('--theme-menu-block', block);
};

const setUp = (button: HTMLButtonElement): void => {
  const id = button.getAttribute('popovertarget');
  const menu = id ? document.getElementById(id) : null;
  if (!menu || !('showPopover' in menu)) return;

  let frame = 0;
  const follow = (): void => {
    if (frame || !menu.matches(':popover-open')) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      place(button, menu);
    });
  };

  menu.addEventListener('beforetoggle', (event) => {
    const opening = (event as ToggleEvent).newState === 'open';
    if (opening) place(button, menu);
    button.setAttribute('aria-expanded', String(opening));
  });
  /* Focus goes to the chosen radio, so the arrow keys move the choice at once. */
  menu.addEventListener('toggle', (event) => {
    if ((event as ToggleEvent).newState !== 'open') return;
    menu.querySelector<HTMLInputElement>('input:checked')?.focus();
  });
  /* Left open behind the next control, it would cover it (SC 2.4.11). */
  menu.addEventListener('focusout', (event) => {
    const next = event.relatedTarget;
    if (next instanceof Node && (menu.contains(next) || next === button))
      return;
    if (menu.matches(':popover-open')) menu.hidePopover();
  });
  menu.addEventListener('change', (event) => {
    const value = (event.target as HTMLInputElement).value;
    if (value === 'system' || isTheme(value)) choose(value);
  });
  addEventListener('scroll', follow, { passive: true });
  addEventListener('resize', follow);
};

buttons.forEach(setUp);
apply(currentChoice());

systemLight.addEventListener('change', () => {
  if (currentChoice() === 'system') apply('system');
});

/* BaseLayout.astro's listener, added first, has re-applied the stored theme by now. */
addEventListener('pageshow', () => apply(currentChoice()));
