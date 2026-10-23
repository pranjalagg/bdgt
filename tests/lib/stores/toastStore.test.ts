import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { get } from 'svelte/store';
import { showToast, toast, dismissToast } from '$lib/stores/toastStore';

beforeEach(() => vi.useFakeTimers());
afterEach(() => { dismissToast(); vi.useRealTimers(); });

describe('toasts', () => {
  it('a new toast replaces the current one and clears itself', () => {
    showToast({ message: 'First' });
    showToast({ message: 'Second' });
    expect(get(toast)?.message).toBe('Second');
    vi.advanceTimersByTime(2100);
    expect(get(toast)?.message).toBe('Second');
    vi.advanceTimersByTime(200);
    expect(get(toast)).toBeNull();
  });

  it('stays longer when it offers an action', () => {
    showToast({ message: 'Deleted', action: { label: 'Undo', run: () => {} } });
    vi.advanceTimersByTime(4000);
    expect(get(toast)?.action?.label).toBe('Undo');
    vi.advanceTimersByTime(300);
    expect(get(toast)).toBeNull();
  });
});
