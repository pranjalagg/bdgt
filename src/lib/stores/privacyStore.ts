import { writable } from 'svelte/store';
import { browser } from '$app/environment';

const STORAGE_KEY = 'bdgt-hide-amounts';

function initial(): boolean {
  if (!browser) return false;
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

// When true every money figure is blurred (see `:root.privacy` in app.css),
// for glancing at the app with someone next to you or sharing a screen.
// Remembered per browser.
export const hideAmounts = writable<boolean>(initial());

if (browser) {
  hideAmounts.subscribe((hidden) => {
    document.documentElement.classList.toggle('privacy', hidden);
    try {
      localStorage.setItem(STORAGE_KEY, String(hidden));
    } catch {
      // storage unavailable: the choice just won't persist
    }
  });
}

export function toggleHideAmounts() {
  hideAmounts.update((v) => !v);
}
