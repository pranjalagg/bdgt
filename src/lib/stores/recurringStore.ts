// src/lib/stores/recurringStore.ts
import { writable, derived } from 'svelte/store';
import { db, DATE_FIELDS } from '$lib/db';
import { transactions } from './budgetStore';
import { reviveDateFields } from '$lib/utils/dates';
import type { RecurringTransaction, Transaction } from '$lib/types';

export const recurringTransactions = writable<RecurringTransaction[]>([]);

export async function loadRecurring(): Promise<void> {
  const loaded = await db.recurringTransactions.toArray();
  recurringTransactions.set(loaded.map((r) => reviveDateFields(r, DATE_FIELDS.recurringTransactions)));
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
    const next = calculateNextDueDate(cursor, frequency);
    if (next.getTime() === cursor.getTime()) {
      // Unknown/corrupted frequency (e.g. from an unvalidated import):
      // the cursor can't advance. Treat as unprocessable rather than
      // generating the same occurrence forever on every load.
      return { occurrences: [], nextDueDate };
    }
    occurrences.push(new Date(cursor));
    cursor = next;
  }

  // Hit the cap while still behind: skip ahead so we don't re-process
  // the same backlog on every load. (Unreachable for the three real
  // frequencies, which always advance; kept as a defensive mirror of
  // the check above.)
  while (cursor <= until) {
    const next = calculateNextDueDate(cursor, frequency);
    if (next.getTime() === cursor.getTime()) {
      return { occurrences, nextDueDate: cursor };
    }
    cursor = next;
  }

  return { occurrences, nextDueDate: cursor };
}

// Builds every occurrence + due-date advance across all due items without
// writing anything, so processRecurring can commit them in one transaction.
function planRecurringBatch(
  due: RecurringTransaction[],
  now: Date
): { newTransactions: Transaction[]; dueUpdates: { id: string; nextDueDate: Date }[] } {
  const newTransactions: Transaction[] = [];
  const dueUpdates: { id: string; nextDueDate: Date }[] = [];

  for (const recurring of due) {
    // A corrupted amount (e.g. from data that predates assertCents) must
    // not silently mint NaN transactions; skip the item rather than fail
    // the whole batch.
    if (!Number.isFinite(recurring.amount)) continue;

    const { occurrences, nextDueDate } = dueOccurrences(
      new Date(recurring.nextDueDate),
      recurring.frequency,
      now
    );
    if (occurrences.length === 0) continue;

    for (const occurrence of occurrences) {
      newTransactions.push({
        id: crypto.randomUUID(),
        amount: recurring.amount,
        bucketId: recurring.bucketId,
        date: occurrence,
        note: recurring.note,
        recurringId: recurring.id,
      });
    }
    dueUpdates.push({ id: recurring.id, nextDueDate });
  }

  return { newTransactions, dueUpdates };
}

// Generates every missed occurrence for every due item, then commits all
// of the resulting transactions and due-date advances in a single Dexie
// transaction. Previously this wrote one occurrence at a time and only
// advanced nextDueDate after its whole loop: a failure partway through
// left the old due date in place, so the already-inserted occurrences
// would be generated again -- duplicated -- on the next app load.
export async function processRecurring(): Promise<number> {
  const now = new Date();
  now.setHours(23, 59, 59, 999);

  const due = await db.recurringTransactions
    .filter((r) => r.isActive && new Date(r.nextDueDate) <= now)
    .toArray();

  const { newTransactions, dueUpdates } = planRecurringBatch(due, now);
  if (newTransactions.length === 0) return 0;

  await db.transaction('rw', [db.transactions, db.recurringTransactions], async () => {
    await db.transactions.bulkAdd(newTransactions);
    for (const { id, nextDueDate } of dueUpdates) {
      await db.recurringTransactions.update(id, { nextDueDate });
    }
  });

  transactions.update((t) => [...t, ...newTransactions]);
  await loadRecurring();

  return newTransactions.length;
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
