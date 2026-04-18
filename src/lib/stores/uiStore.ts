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
