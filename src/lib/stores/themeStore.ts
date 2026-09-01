import { writable, derived } from 'svelte/store';
import { browser } from '$app/environment';

export type ThemePreference = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

const STORAGE_KEY = 'theme-preference';

function getInitialPreference(): ThemePreference {
  if (!browser) return 'system';
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'light' || stored === 'dark' || stored === 'system') {
    return stored;
  }
  return 'system';
}

function getSystemTheme(): ResolvedTheme {
  if (!browser) return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export const themePreference = writable<ThemePreference>(getInitialPreference());
export const systemTheme = writable<ResolvedTheme>(getSystemTheme());

export const resolvedTheme = derived(
  [themePreference, systemTheme],
  ([$preference, $system]) => {
    if ($preference === 'system') {
      return $system;
    }
    return $preference;
  }
);

// Apply theme to document and persist preference
if (browser) {
  themePreference.subscribe((preference) => {
    localStorage.setItem(STORAGE_KEY, preference);
  });

  resolvedTheme.subscribe((resolved) => {
    if (resolved === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  });

  // Listen for system theme changes
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    systemTheme.set(e.matches ? 'dark' : 'light');
  });
}

export function setTheme(preference: ThemePreference) {
  themePreference.set(preference);
}
