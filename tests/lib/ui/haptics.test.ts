import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { plugin, loadPlugin } = vi.hoisted(() => {
  const plugin = {
    selectionChanged: vi.fn(async () => {}),
    impact: vi.fn(async (_o: { style: string }) => {}),
    notification: vi.fn(async (_o: { type: string }) => {}),
  };
  return { plugin, loadPlugin: vi.fn(async () => ({ plugin })) };
});
vi.mock('$lib/android', async (importOriginal) => ({
  ...(await importOriginal<typeof import('$lib/android')>()),
  loadPlugin,
}));

import { haptic } from '$lib/ui/haptics';

const w = window as unknown as { Capacitor?: unknown };

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => {
  delete w.Capacitor;
});

describe('haptic', () => {
  it('does nothing in a browser', async () => {
    haptic('success');
    await Promise.resolve();
    expect(loadPlugin).not.toHaveBeenCalled();
  });

  it('maps each kind to the Haptics plugin in the Android app', async () => {
    w.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android' };
    haptic('selection');
    haptic('light');
    haptic('medium');
    haptic('success');
    haptic('warning');
    await vi.waitFor(() => expect(plugin.notification).toHaveBeenCalledTimes(2));
    expect(loadPlugin).toHaveBeenCalledWith('Haptics');
    expect(plugin.selectionChanged).toHaveBeenCalledTimes(1);
    expect(plugin.impact.mock.calls.map((c) => c[0])).toEqual([{ style: 'LIGHT' }, { style: 'MEDIUM' }]);
    expect(plugin.notification.mock.calls.map((c) => c[0])).toEqual([{ type: 'SUCCESS' }, { type: 'WARNING' }]);
  });
});
