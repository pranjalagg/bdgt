import { writable, type Readable } from 'svelte/store';
import { db } from '$lib/db';
import { DEFAULT_LAYOUT, parseHomeLayout, serializeHomeLayout, type HomeLayout } from '$lib/home/layout';

// Which cards Home shows, in order. One row in the synced settings table,
// so it follows the person across devices and goes into backups.

const KEY = 'homeLayout';
const layout = writable<HomeLayout>(DEFAULT_LAYOUT.map((c) => ({ ...c })));
export const homeLayout: Readable<HomeLayout> = { subscribe: layout.subscribe };

export async function loadHomeLayout(): Promise<void> {
  const row = await db.settings.get(KEY);
  layout.set(parseHomeLayout(row?.value ?? null));
}

export async function saveHomeLayout(next: HomeLayout): Promise<void> {
  layout.set(next);
  await db.settings.put({ key: KEY, value: serializeHomeLayout(next) });
}
