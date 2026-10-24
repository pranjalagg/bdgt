import { derived, get, writable } from 'svelte/store';
import { inModal, tabRootOf } from './routes';

// The app's own record of the pages behind the current one (paths without
// the deployment base), kept in step with the browser history. Back, Close
// and Done read it so they go where the person came from, never forward
// into a page they just left.

export type NavKind = 'enter' | 'link' | 'goto' | 'popstate' | 'form' | 'leave';

export function nextStack(stack: string[], kind: NavKind, path: string, replace = false): string[] {
  if (kind === 'enter' || stack.length === 0) return [path];
  if (kind === 'popstate') {
    const behind = stack.lastIndexOf(path, stack.length - 2);
    return behind >= 0 ? stack.slice(0, behind + 1) : [...stack, path];
  }
  return replace ? [...stack.slice(0, -1), path] : [...stack, path];
}

// The page Back returns to, if the app has one behind the current page.
export function backTarget(stack: string[]): string | null {
  return stack.length > 1 ? stack[stack.length - 2] : null;
}

// How many steps back Close or Done goes: past every page inside Review or
// Settings, to the page they opened over. None when they were opened
// directly (there is nothing of the app behind them).
export function closeSteps(stack: string[]): number | null {
  for (let i = stack.length - 1; i >= 0; i--) if (!inModal(stack[i])) return stack.length - 1 - i;
  return null;
}

// How many steps back to a tab's first page, when everything above it is
// that tab's own pages (tapping the current tab pops back to its start, as
// on iOS). None when the tab is not behind, or another tab is in between.
export function stepsBackTo(stack: string[], tab: string): number | null {
  for (let i = stack.length - 2; i >= 0; i--) {
    if (stack[i] === tab) return stack.length - 1 - i;
    if (tabRootOf(stack[i]) !== tab) return null;
  }
  return null;
}

// The page one level up: where Back goes from a page opened directly.
export function parentOf(path: string): string {
  const cut = path.replace(/\/$/, '').lastIndexOf('/');
  return cut > 0 ? path.slice(0, cut) : '/';
}

export const appStack = writable<string[]>([]);
// How many pages back this app can go.
export const historyDepth = derived(appStack, ($s) => Math.max(0, $s.length - 1));

// The next navigation replaces the current page instead of adding one
// (goto with replaceState), so the record must not grow.
let replacing = false;
export function markReplace(): void {
  replacing = true;
}

export function recordNavigation(kind: NavKind, path: string): void {
  appStack.update((s) => nextStack(s, kind, path, replacing));
  replacing = false;
}

// Back from a page: the page behind it when that is where Back points,
// otherwise the given page (a page opened directly has nothing behind it).
export function shouldPop(target: string): boolean {
  return backTarget(get(appStack)) === target;
}
