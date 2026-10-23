import { MODAL_ROOTS } from './routes';

// Which way a page change moves, as a native app would: deeper pages push
// in from the right and come back the same way, Review and Settings slide
// up over everything, and switching tabs only fades.

export type NavDirection = 'push' | 'pop' | 'tab' | 'up' | 'down';

const segments = (path: string) => path.split('/').filter(Boolean);
const modalOf = (path: string) => MODAL_ROOTS.find((m) => path === m || path.startsWith(m + '/'));

export function navDirection(from: string | null, to: string): NavDirection {
  if (from === null) return 'tab';
  const fromModal = modalOf(from);
  const toModal = modalOf(to);
  if (toModal && !fromModal) return 'up';
  if (fromModal && !toModal) return 'down';
  const f = segments(from);
  const t = segments(to);
  if (f[0] !== t[0]) return 'tab';
  if (t.length > f.length) return 'push';
  if (t.length < f.length) return 'pop';
  return 'tab';
}
