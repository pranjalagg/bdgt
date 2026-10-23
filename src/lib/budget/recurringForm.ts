import type { RecurringTransaction } from '$lib/types';
import { parseCurrency } from '$lib/utils/currency';
import { parseLocalDate } from '$lib/utils/dates';

// What the recurring item form saves. Editing keeps an item's paused or
// active state; only a new item starts active.

export interface RecurringFormValues {
  amount: string;
  bucketId: string;
  frequency: RecurringTransaction['frequency'];
  nextDueDate: string; // YYYY-MM-DD
  note: string;
}

export function recurringFormData(values: RecurringFormValues, existing?: { isActive: boolean }) {
  return {
    amount: parseCurrency(values.amount),
    bucketId: values.bucketId,
    frequency: values.frequency,
    nextDueDate: parseLocalDate(values.nextDueDate),
    note: values.note || undefined,
    isActive: existing ? existing.isActive : true,
  };
}
