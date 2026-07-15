export type ThemeMode = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'wadi-theme';
export const THEME_COOKIE = 'wadi-theme';
export const THEME_CHOICE_STORAGE_KEY = 'wadi-theme-choice';
export const THEME_CHOICE_COOKIE = 'wadi-theme-choice';

export function isThemeMode(value: string | null | undefined): value is ThemeMode {
  return value === 'light' || value === 'dark';
}

export function getThemeFromCookieValue(value: string | null | undefined): ThemeMode | null {
  return isThemeMode(value) ? value : null;
}

export function getPreferredTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'light';

  const hasExplicitChoice = window.localStorage.getItem(THEME_CHOICE_STORAGE_KEY) === 'explicit';
  const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (hasExplicitChoice && isThemeMode(storedTheme)) return storedTheme;

  return 'light';
}

export function applyTheme(theme: ThemeMode) {
  if (typeof document === 'undefined') return;

  document.documentElement.classList.toggle('dark', theme === 'dark');
  document.documentElement.dataset.theme = theme;
}

export function persistTheme(theme: ThemeMode) {
  if (typeof window === 'undefined') return;

  window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  window.localStorage.setItem(THEME_CHOICE_STORAGE_KEY, 'explicit');
  document.cookie = `${THEME_COOKIE}=${theme}; path=/; max-age=31536000; samesite=lax`;
  document.cookie = `${THEME_CHOICE_COOKIE}=explicit; path=/; max-age=31536000; samesite=lax`;
}
