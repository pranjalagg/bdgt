import { vi } from 'vitest';

// Node 26 ships an experimental localStorage that does nothing without a
// file flag, which shadows jsdom's. Tests that touch it get a plain in-memory
// one instead. Call vi.unstubAllGlobals() afterwards.
export function stubLocalStorage(): void {
  const data = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, String(value)),
    removeItem: (key: string) => void data.delete(key),
    clear: () => data.clear(),
    key: (index: number) => [...data.keys()][index] ?? null,
    get length() {
      return data.size;
    },
  });
}
