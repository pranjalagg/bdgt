import { describe, it, expect, vi, beforeEach } from 'vitest';

const setStyle = vi.fn(async (_options: { style: 'DARK' | 'LIGHT' }) => {});
vi.mock('$lib/android', async (importOriginal) => ({
  ...(await importOriginal<typeof import('$lib/android')>()),
  loadPlugin: vi.fn(async () => ({ plugin: { setStyle } })),
}));

import { followTheme } from '$lib/systemBars';

const android = { isNativePlatform: () => true, getPlatform: () => 'android' };
const page = (Capacitor?: unknown) => ({ document, Capacitor }) as unknown as Window;
const colours = () => [...document.querySelectorAll('meta[name="theme-color"]')].map((m) => m.getAttribute('content'));

beforeEach(() => {
  setStyle.mockClear();
  document.head.innerHTML =
    '<meta name="theme-color" media="(prefers-color-scheme: light)" content="#f3f4f1">' +
    '<meta name="theme-color" media="(prefers-color-scheme: dark)" content="#0e0f11">';
});

describe('followTheme', () => {
  it("colours the browser's toolbar for the chosen theme, whatever the system's", () => {
    followTheme('dark', page());
    expect(colours()).toEqual(['#0e0f11', '#0e0f11']);
    followTheme('light', page());
    expect(colours()).toEqual(['#f3f4f1', '#f3f4f1']);
  });

  it('leaves the status bar alone in a browser', async () => {
    followTheme('dark', page());
    await Promise.resolve();
    expect(setStyle).not.toHaveBeenCalled();
  });

  it("sets the Android app's status bar icons to contrast with the theme", async () => {
    followTheme('dark', page(android));
    await vi.waitFor(() => expect(setStyle).toHaveBeenCalledWith({ style: 'DARK' }));
    followTheme('light', page(android));
    await vi.waitFor(() => expect(setStyle).toHaveBeenLastCalledWith({ style: 'LIGHT' }));
  });
});
