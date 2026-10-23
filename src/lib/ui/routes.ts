// The four tabs, and the pages that slide up over them. Paths are without
// the deployment base.

export const TAB_ROOTS = ['/', '/budget', '/activity', '/insights'] as const;
export const MODAL_ROOTS = ['/review', '/settings'] as const;

// The tab a page belongs to: the one you return to when there is nowhere
// to go back to. Review opens from Activity, Settings from Home.
const MODAL_HOME: Record<(typeof MODAL_ROOTS)[number], string> = { '/review': '/activity', '/settings': '/' };

export function tabRootOf(path: string): string {
  const first = '/' + (path.split('/')[1] ?? '');
  if (first in MODAL_HOME) return MODAL_HOME[first as keyof typeof MODAL_HOME];
  return (TAB_ROOTS as readonly string[]).includes(first) ? first : '/';
}

export const isTabRoot = (path: string) => (TAB_ROOTS as readonly string[]).includes(path === '' ? '/' : path.replace(/(.)\/$/, '$1'));

// Review and Settings themselves (Close sits where Back would).
export const isModalRoot = (path: string) => (MODAL_ROOTS as readonly string[]).includes(path.replace(/(.)\/$/, '$1'));

// Any page inside Review or Settings: the tab bar steps aside for them.
export const inModal = (path: string) => MODAL_ROOTS.some((m) => path === m || path.startsWith(m + '/'));
