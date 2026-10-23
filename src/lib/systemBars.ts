import { isAndroidPlatform, loadPlugin } from '$lib/android';

// The browser's toolbar colour and, in the Android app, the status bar's
// icons follow the theme picked in Settings, not only the system's.

const BACKGROUND = { light: '#f3f4f1', dark: '#0e0f11' } as const;

type SystemBarsPlugin = { setStyle(options: { style: 'DARK' | 'LIGHT' }): Promise<void> };

export function followTheme(theme: 'light' | 'dark', win: Window = window): void {
  for (const meta of win.document.querySelectorAll('meta[name="theme-color"]')) {
    meta.setAttribute('content', BACKGROUND[theme]);
  }
  if (!isAndroidPlatform(win)) return;
  // DARK means light icons, for a dark background.
  void loadPlugin<SystemBarsPlugin>('SystemBars')
    .then(({ plugin }) => plugin.setStyle({ style: theme === 'dark' ? 'DARK' : 'LIGHT' }))
    .catch(() => {});
}
