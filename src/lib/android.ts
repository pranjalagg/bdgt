// What the page needs to know about running inside the Android app, and how
// it reaches the plugins compiled into it. In a browser none of this loads:
// Capacitor is imported only when the page runs inside the app.

type CapacitorGlobal = { isNativePlatform?: () => boolean; getPlatform?: () => string };

// True inside the Android app: Capacitor's bridge is on `window` before any
// page script runs.
export function isAndroidPlatform(win: unknown = typeof window === 'undefined' ? undefined : window): boolean {
  const cap = (win as { Capacitor?: CapacitorGlobal } | undefined)?.Capacitor;
  try {
    return cap?.isNativePlatform?.() === true && cap.getPlatform?.() === 'android';
  } catch {
    return false;
  }
}

// Capacitor's plugin object answers every property, `then` included, so a
// Promise must never resolve to it (it would be taken for a thenable and
// called). It is handed out inside this box instead.
export interface PluginHandle<T> {
  plugin: T;
}

const loaded = new Map<string, Promise<PluginHandle<unknown>>>();

// A plugin compiled into the app, loaded on first use.
export function loadPlugin<T>(name: string): Promise<PluginHandle<T>> {
  let handle = loaded.get(name);
  if (!handle) {
    handle = import('@capacitor/core').then(({ registerPlugin }) => ({ plugin: registerPlugin<T>(name) }));
    loaded.set(name, handle);
  }
  return handle as Promise<PluginHandle<T>>;
}
