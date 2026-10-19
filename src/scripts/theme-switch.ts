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

/* Every menu's radios; a menu holds nothing else. */
const radios = document.querySelectorAll<HTMLInputElement>('.theme-menu input');

/* Every menu reads the one choice, so two on a page never disagree. */
const apply = (choice: ThemeChoice): void => {
  root.dataset.theme = resolve(choice);
  for (const radio of radios) radio.checked = radio.value === choice;
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
  const set = (side: string, value: number | null): void =>
    menu.style.setProperty(
      `--theme-menu-${side}`,
      value === null ? 'auto' : `${value}px`,
    );
  set('left', opensRight ? inline : null);
  set('right', opensRight ? null : inline);
  set('top', opensDown ? block : null);
  set('bottom', opensDown ? null : block);
  set('inline', inline);
  set('block', block);
};

const setUp = (button: HTMLButtonElement): void => {
  const id = button.getAttribute('popovertarget');
  const menu = id ? document.getElementById(id) : null;
  /* Without popovers the button is hidden and no menu event ever fires. */
  if (!menu) return;

  let frame = 0;
  const isOpen = (): boolean => menu.matches(':popover-open');
  const follow = (): void => {
    if (frame || !isOpen()) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      place(button, menu);
    });
  };

  menu.addEventListener('beforetoggle', (event) => {
    const opening = (event as ToggleEvent).newState === 'open';
    if (opening) place(button, menu);
    button.setAttribute('aria-expanded', `${opening}`);
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
    if (isOpen()) menu.hidePopover();
  });
  /*
   * A pick closes the menu and hands focus back to its button (SC 2.4.3).
   * Only an open menu takes a pick, so this needs no open check.
   */
  const closeToButton = (): void => {
    menu.hidePopover();
    button.focus();
  };
  /* Arrow keys click the next radio too, with `detail` 0: they move the choice and keep the menu open. */
  menu.addEventListener('click', (event) => {
    if (event.detail && (event.target as Element).closest('label'))
      closeToButton();
  });
  /*
   * Enter, or Space, picks the focused radio. Handled on keydown, so the key's
   * keyup lands on the button without activating it.
   */
  menu.addEventListener('keydown', (event) => {
    const radio = event.target as HTMLInputElement;
    if (radio.type !== 'radio' || (event.key !== 'Enter' && event.key !== ' '))
      return;
    event.preventDefault();
    if (!radio.checked) radio.click();
    closeToButton();
  });
  menu.addEventListener('change', (event) => {
    /* Only the radios' own values, from THEME_CHOICES, reach here. */
    choose((event.target as HTMLInputElement).value as ThemeChoice);
  });
  for (const type of ['scroll', 'resize']) addEventListener(type, follow);
};

document.querySelectorAll<HTMLButtonElement>('.theme-switch').forEach(setUp);
apply(currentChoice());

systemLight.addEventListener('change', () => {
  if (currentChoice() === 'system') apply('system');
});

/* BaseLayout.astro's listener, added first, has re-applied the stored theme by now. */
addEventListener('pageshow', () => apply(currentChoice()));
