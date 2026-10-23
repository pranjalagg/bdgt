import { writable, derived } from 'svelte/store';
import { getCurrentMonthKey, formatMonthYear, isCurrentMonth, msUntilNextDay } from '$lib/utils/dates';

export const currentMonthKey = writable<string>(getCurrentMonthKey());

export const currentMonthDisplay = derived(currentMonthKey, ($month) =>
  formatMonthYear($month)
);

export const isViewingCurrentMonth = derived(currentMonthKey, ($month) =>
  isCurrentMonth($month)
);

// "Now" as a store, so anything derived from today's date (safe to spend,
// days left) recomputes when the day changes instead of freezing at
// whatever the date was when the store last happened to update.
export const today = writable<Date>(new Date());

// Refreshes `today` at local midnight and whenever the tab becomes visible
// again (laptops sleep through midnight, which timers do not survive).
// Returns a cleanup function.
export function startClock(): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      today.set(new Date());
      schedule();
    }, msUntilNextDay());
  };
  const onVisible = () => {
    if (document.visibilityState !== 'visible') return;
    today.set(new Date());
    schedule();
  };

  today.set(new Date());
  schedule();
  document.addEventListener('visibilitychange', onVisible);
  return () => {
    clearTimeout(timer);
    document.removeEventListener('visibilitychange', onVisible);
  };
}

// Sheets stack: opening one over another keeps the lower one, and closing
// takes off the top (or a named one). activeModal is the top, as before.
export const modalStack = writable<string[]>([]);
export const activeModal = derived(modalStack, ($stack) => $stack[$stack.length - 1] ?? null);

export function openModal(modalId: string) {
  modalStack.update((stack) => (stack.includes(modalId) ? stack : [...stack, modalId]));
}

export function closeModal(modalId?: string) {
  modalStack.update((stack) => (modalId === undefined ? stack.slice(0, -1) : stack.filter((id) => id !== modalId)));
}

// Large sheets push the app back behind them; Modal registers which ids do.
const scaleBackIds = writable<Set<string>>(new Set());
export const scaledBack = derived([modalStack, scaleBackIds], ([$stack, $ids]) => $stack.some((id) => $ids.has(id)));

export function setScaleBack(modalId: string, on: boolean) {
  scaleBackIds.update((ids) => {
    const next = new Set(ids);
    if (on) next.add(modalId);
    else next.delete(modalId);
    return next;
  });
}

// Logging a transaction is a persistent action available from any page
// (see Layout.svelte's global Log modal), not a button that only exists
// on the pages that happen to render one. This is the bucket, if any,
// it should open pre-selected to -- e.g. tapping an envelope row.
export const logPreselectedBucketId = writable<string | undefined>(undefined);

export function openLog(bucketId?: string) {
  logPreselectedBucketId.set(bucketId);
  openModal('log');
}
