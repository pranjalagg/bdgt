import { writable } from 'svelte/store';
import { tabRootOf } from './routes';

// How many pages back this app can go. A page opened directly (a link, the
// Android launcher) has nowhere to go back to.
export const historyDepth = writable(0);

// Where Close on Review or Settings goes: back, or the tab it opens from.
export function closeTarget(depth: number, path: string): 'back' | string {
  return depth > 0 ? 'back' : tabRootOf(path);
}
