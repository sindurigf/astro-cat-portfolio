/** "light" or "dark"; absent while the visitor follows the system. */
export const THEME_STORAGE_KEY = 'theme';

export const THEME_CHOICES = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
] as const;

export type ThemeChoice = (typeof THEME_CHOICES)[number]['value'];
export type Theme = Exclude<ThemeChoice, 'system'>;

export const isTheme = (value: unknown): value is Theme =>
  value === 'light' || value === 'dark';
