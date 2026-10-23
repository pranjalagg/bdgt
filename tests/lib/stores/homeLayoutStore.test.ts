import { describe, it, expect, vi, beforeEach } from 'vitest';
import { get } from 'svelte/store';

const rows = vi.hoisted(() => new Map<string, { key: string; value: string | boolean }>());
vi.mock('$lib/db', () => ({
  db: {
    settings: {
      get: vi.fn(async (key: string) => rows.get(key)),
      put: vi.fn(async (row: { key: string; value: string }) => void rows.set(row.key, row)),
    },
  },
}));

import { homeLayout, loadHomeLayout, saveHomeLayout } from '$lib/stores/homeLayoutStore';
import { DEFAULT_LAYOUT } from '$lib/home/layout';

beforeEach(() => rows.clear());

describe('homeLayoutStore', () => {
  it('uses the default when nothing is saved', async () => {
    await loadHomeLayout();
    expect(get(homeLayout)).toEqual(DEFAULT_LAYOUT);
  });
  it('saves to the synced settings row homeLayout and loads it back', async () => {
    const layout = [...DEFAULT_LAYOUT].reverse();
    await saveHomeLayout(layout);
    expect(rows.get('homeLayout')?.value).toBe(JSON.stringify(layout));
    await loadHomeLayout();
    expect(get(homeLayout)).toEqual(layout);
  });
});
