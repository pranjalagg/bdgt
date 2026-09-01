// src/lib/stores/recurringStore.ts
import { writable, derived } from 'svelte/store';
import { db } from '$lib/db';
import { addTransaction } from './budgetStore';
import type { RecurringTransaction } from '$lib/types';

export const recurringTransactions = writable<RecurringTransaction[]>([]);

export async function loadRecurring(): Promise<void> {
  const loaded = await db.recurringTransactions.toArray();
  recurringTransactions.set(loaded);
}

export const upcomingRecurring = derived(recurringTransactions, ($recurring) => {
  const now = new Date();
  const sevenDays = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  return $recurring
    .filter((r) => r.isActive && new Date(r.nextDueDate) <= sevenDays)
    .sort((a, b) => new Date(a.nextDueDate).getTime() - new Date(b.nextDueDate).getTime());
});

export const dueRecurring = derived(recurringTransactions, ($recurring) => {
  const now = new Date();
  now.setHours(23, 59, 59, 999);

  return $recurring.filter((r) => r.isActive && new Date(r.nextDueDate) <= now);
});

function calculateNextDueDate(current: Date, frequency: RecurringTransaction['frequency']): Date {
  const next = new Date(current);

  switch (frequency) {
    case 'weekly':
      next.setDate(next.getDate() + 7);
      break;
    case 'biweekly':
      next.setDate(next.getDate() + 14);
      break;
    case 'monthly':
      next.setMonth(next.getMonth() + 1);
      break;
  }

  return next;
}

// Maximum occurrences generated in a single catch-up pass, so a very
// stale weekly item can't spawn thousands of transactions at once.
const MAX_CATCHUP = 366;

// Every occurrence of a recurring item that is due on or before `until`,
// plus the resulting next due date once all of them are consumed.
export function dueOccurrences(
  nextDueDate: Date,
  frequency: RecurringTransaction['frequency'],
  until: Date = new Date()
): { occurrences: Date[]; nextDueDate: Date } {
  const occurrences: Date[] = [];
  let cursor = new Date(nextDueDate);

  while (cursor <= until && occurrences.length < MAX_CATCHUP) {
    occurrences.push(new Date(cursor));
    cursor = calculateNextDueDate(cursor, frequency);
  }

  // Hit the cap while still behind: skip ahead so we don't re-process
  // the same backlog on every load.
  while (cursor <= until) {
    cursor = calculateNextDueDate(cursor, frequency);
  }

  return { occurrences, nextDueDate: cursor };
}

export async function processRecurring(): Promise<number> {
  const now = new Date();
  now.setHours(23, 59, 59, 999);

  const due = await db.recurringTransactions
    .filter((r) => r.isActive && new Date(r.nextDueDate) <= now)
    .toArray();

  let processed = 0;

  for (const recurring of due) {
    const { occurrences, nextDueDate } = dueOccurrences(
      new Date(recurring.nextDueDate),
      recurring.frequency,
      now
    );

    for (const occurrence of occurrences) {
      await addTransaction({
        amount: recurring.amount,
        bucketId: recurring.bucketId,
        date: occurrence,
        note: recurring.note,
        recurringId: recurring.id,
      });
      processed++;
    }

    await db.recurringTransactions.update(recurring.id, { nextDueDate });
  }

  if (processed > 0) {
    await loadRecurring();
  }

  return processed;
}

export async function addRecurring(recurring: Omit<RecurringTransaction, 'id'>): Promise<string> {
  const id = crypto.randomUUID();
  const newRecurring = { ...recurring, id };
  await db.recurringTransactions.add(newRecurring);
  recurringTransactions.update((r) => [...r, newRecurring]);
  return id;
}

export async function updateRecurring(id: string, updates: Partial<RecurringTransaction>): Promise<void> {
  await db.recurringTransactions.update(id, updates);
  recurringTransactions.update((r) =>
    r.map((rec) => (rec.id === id ? { ...rec, ...updates } : rec))
  );
}

export async function deleteRecurring(id: string): Promise<void> {
  await db.recurringTransactions.delete(id);
  recurringTransactions.update((r) => r.filter((rec) => rec.id !== id));
}

export async function toggleRecurring(id: string): Promise<void> {
  const recurring = await db.recurringTransactions.get(id);
  if (recurring) {
    await updateRecurring(id, { isActive: !recurring.isActive });
  }
}
