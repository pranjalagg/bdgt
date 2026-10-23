import { isAndroidPlatform, loadPlugin } from '$lib/android';
import type { PluginListenerHandle } from '@capacitor/core';

// Android's back button, as a native app treats it: close the top sheet,
// then go back a page, then leave the app from a tab.

export type BackAction = 'close-sheet' | 'back' | 'to-root' | 'exit';

export interface BackState {
  openSheets: number;
  atTabRoot: boolean;
  canGoBack: boolean; // an earlier page in this app's history
}

export function backDecision(s: BackState): BackAction {
  if (s.openSheets > 0) return 'close-sheet';
  if (s.atTabRoot) return 'exit';
  return s.canGoBack ? 'back' : 'to-root';
}

interface AppPlugin {
  addListener(event: 'backButton', cb: () => void): Promise<PluginListenerHandle>;
  exitApp(): Promise<void>;
}

export function installBackButton(h: {
  state: () => BackState;
  closeSheet: () => void;
  back: () => void;
  toRoot: () => void;
}): () => void {
  if (!isAndroidPlatform()) return () => {};
  let handle: PluginListenerHandle | undefined;
  let stopped = false;
  void loadPlugin<AppPlugin>('App').then(async ({ plugin }) => {
    const listener = await plugin.addListener('backButton', () => {
      const action = backDecision(h.state());
      if (action === 'close-sheet') h.closeSheet();
      else if (action === 'back') h.back();
      else if (action === 'to-root') h.toRoot();
      else void plugin.exitApp();
    });
    if (stopped) void listener.remove();
    else handle = listener;
  });
  return () => {
    stopped = true;
    void handle?.remove();
  };
}
