import { get } from 'svelte/store';
import { goto } from '$app/navigation';
import { base } from '$app/paths';
import { appStack, backTarget, closeSteps, markReplace, parentOf, stepsBackTo } from './history';
import { tabRootOf } from './routes';

// Going back the way a native app does: to the page you came from when it
// is the one Back names, otherwise to that page in place of this one, so
// the history never gains a page you would return to by pressing Back.

const href = (path: string) => (path === '/' ? base || '/' : base + path);
const here = () => location.pathname.slice(base.length).replace(/(.)\/$/, '$1') || '/';
export const appPathOf = (url: string) => new URL(url, location.href).pathname.slice(base.length).replace(/(.)\/$/, '$1') || '/';

function replaceWith(path: string) {
  markReplace();
  void goto(href(path), { replaceState: true });
}

// A Back button naming its page, or (no page named) the edge swipe: the
// page behind this one, else the page one level up.
export function goBack(to?: string): void {
  const behind = backTarget(get(appStack));
  if (behind !== null && (to === undefined || behind === to)) history.back();
  else replaceWith(to ?? parentOf(here()));
}

// Close or Done on Review and Settings: back past every page inside them,
// or to the tab they open from when they were opened directly.
export function closeModalPage(): void {
  const steps = closeSteps(get(appStack));
  if (steps) history.go(-steps);
  else replaceWith(tabRootOf(here()));
}

// Tapping the current tab from a page inside it: back to the tab's first
// page, or to it in place of this page when it is not behind.
export function popToTab(tab: string): void {
  const steps = stepsBackTo(get(appStack), tab);
  if (steps) history.go(-steps);
  else replaceWith(tab);
}

// A replacing navigation the history record must not count as a new page.
export function replaceTo(path: string): void {
  replaceWith(path);
}
