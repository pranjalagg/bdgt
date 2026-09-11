import { writable, derived } from 'svelte/store';
import { getCurrentMonthKey, formatMonthYear, isCurrentMonth } from '$lib/utils/dates';

export const currentMonthKey = writable<string>(getCurrentMonthKey());

export const currentMonthDisplay = derived(currentMonthKey, ($month) =>
  formatMonthYear($month)
);

export const isViewingCurrentMonth = derived(currentMonthKey, ($month) =>
  isCurrentMonth($month)
);

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
