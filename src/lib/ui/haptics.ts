import { isAndroidPlatform, loadPlugin } from '$lib/android';

// A small physical tick in the Android app when you pick something, cross a
// swipe threshold or finish an action. Nothing happens on the web.

export type HapticKind = 'selection' | 'light' | 'medium' | 'success' | 'warning';

interface HapticsPlugin {
  selectionChanged(): Promise<void>;
  impact(options: { style: 'LIGHT' | 'MEDIUM' | 'HEAVY' }): Promise<void>;
  notification(options: { type: 'SUCCESS' | 'WARNING' | 'ERROR' }): Promise<void>;
}

export function haptic(kind: HapticKind): void {
  if (!isAndroidPlatform()) return;
  void loadPlugin<HapticsPlugin>('Haptics')
    .then(({ plugin }) => {
      if (kind === 'selection') return plugin.selectionChanged();
      if (kind === 'light') return plugin.impact({ style: 'LIGHT' });
      if (kind === 'medium') return plugin.impact({ style: 'MEDIUM' });
      return plugin.notification({ type: kind === 'success' ? 'SUCCESS' : 'WARNING' });
    })
    .catch(() => {});
}
