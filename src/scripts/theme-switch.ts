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

const toggle = (button: HTMLButtonElement): void => {
  const next: Theme = currentTheme() === 'light' ? 'dark' : 'light';
  root.dataset.theme = next;
  reflect(button);
  remember(next);
};

const button = document.querySelector<HTMLButtonElement>('.theme-switch');
if (button) {
  reflect(button);
  button.addEventListener('click', () => toggle(button));
}
