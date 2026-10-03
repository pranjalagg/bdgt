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

export const activeModal = writable<string | null>(null);

export function openModal(modalId: string) {
  activeModal.set(modalId);
}

export function closeModal() {
  activeModal.set(null);
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
