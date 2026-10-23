import { writable, derived } from 'svelte/store';
import { browser } from '$app/environment';
import { followTheme } from '$lib/systemBars';

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

  // The swap happens with transitions off: otherwise every control's
  // colour transition fires at once and the switch smears.
  let firstApply = true;
  resolvedTheme.subscribe((resolved) => {
    const apply = () => {
      document.documentElement.classList.toggle('dark', resolved === 'dark');
      followTheme(resolved);
    };
    if (firstApply) {
      firstApply = false;
      apply();
      return;
    }
    const pause = document.createElement('style');
    // The theme control's own pill still slides.
    pause.textContent = '*:not(.segmented-pill),*::before,*::after{transition:none!important}';
    document.head.appendChild(pause);
    apply();
    void document.documentElement.offsetHeight; // flush styles before transitions return
    setTimeout(() => pause.remove(), 0);
  });

  // Listen for system theme changes
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    systemTheme.set(e.matches ? 'dark' : 'light');
  });
}

export function setTheme(preference: ThemePreference) {
  themePreference.set(preference);
}
