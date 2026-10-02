/* Reflects and flips data-theme; BaseLayout.astro sets it before first paint. */
import { THEME_STORAGE_KEY } from '../lib/theme';

type Theme = 'light' | 'dark';

const root = document.documentElement;

const currentTheme = (): Theme =>
  root.dataset.theme === 'light' ? 'light' : 'dark';

const reflect = (button: HTMLButtonElement): void => {
  button.setAttribute('aria-pressed', String(currentTheme() === 'light'));
};

const remember = (theme: Theme): void => {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    /* Storage is unavailable; the theme holds for this page. */
  }
};

/* Every switch reads the one `data-theme`, so two on a page never disagree. */
const buttons = [
  ...document.querySelectorAll<HTMLButtonElement>('.theme-switch'),
];

const toggle = (): void => {
  const next: Theme = currentTheme() === 'light' ? 'dark' : 'light';
  root.dataset.theme = next;
  buttons.forEach(reflect);
  remember(next);
};

for (const button of buttons) {
  reflect(button);
  button.addEventListener('click', toggle);
}
