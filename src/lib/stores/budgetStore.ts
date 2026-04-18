// src/lib/stores/budgetStore.ts
import { writable, derived, get } from 'svelte/store';
import { db, initializeDefaultBuckets } from '$lib/db';
import { currentMonthKey } from './uiStore';
import { getMonthKey, getPreviousMonthKey, getMonthRange } from '$lib/utils/dates';
import { calculateBucketRemaining, calculateUnallocated } from '$lib/utils/calculations';
import type { Bucket, Transaction, Income, MonthSnapshot, BucketStatus } from '$lib/types';

export const buckets = writable<Bucket[]>([]);
export const transactions = writable<Transaction[]>([]);
export const incomes = writable<Income[]>([]);
export const monthSnapshots = writable<MonthSnapshot[]>([]);
export const isLoading = writable(true);

export async function loadData(): Promise<void> {
  isLoading.set(true);
  await initializeDefaultBuckets();

  const [loadedBuckets, loadedTransactions, loadedIncomes, loadedSnapshots] = await Promise.all([
    db.buckets.orderBy('order').toArray(),
    db.transactions.toArray(),
    db.incomes.toArray(),
    db.monthSnapshots.toArray(),
  ]);

  buckets.set(loadedBuckets);
  transactions.set(loadedTransactions);
  incomes.set(loadedIncomes);
  monthSnapshots.set(loadedSnapshots);
  isLoading.set(false);
}

export const currentMonthTransactions = derived(
  [transactions, currentMonthKey],
  ([$transactions, $month]) => {
    const { start, end } = getMonthRange($month);
    return $transactions.filter((t) => {
      const date = new Date(t.date);
      return date >= start && date <= end;
    });
  }
);

export const currentMonthIncomes = derived(
  [incomes, currentMonthKey],
  ([$incomes, $month]) => {
    const { start, end } = getMonthRange($month);
    return $incomes.filter((i) => {
      const date = new Date(i.date);
      return date >= start && date <= end;
    });
  }
);

export const currentMonthIncome = derived(currentMonthIncomes, ($incomes) =>
  $incomes.reduce((sum, i) => sum + i.amount, 0)
);

export const currentSnapshot = derived(
  [monthSnapshots, currentMonthKey],
  ([$snapshots, $month]) =>
    $snapshots.find((s) => s.month === $month) || {
      month: $month,
      incomeTotal: 0,
      allocations: {},
      spent: {},
      rollovers: {},
    }
);

export const bucketStatuses = derived(
  [buckets, currentSnapshot, currentMonthTransactions],
  ([$buckets, $snapshot, $transactions]) => {
    const spent: Record<string, number> = {};
    for (const t of $transactions) {
      spent[t.bucketId] = (spent[t.bucketId] || 0) + t.amount;
    }

    return $buckets.map((bucket): BucketStatus => {
      const allocated = $snapshot.allocations[bucket.id] || 0;
      const bucketSpent = spent[bucket.id] || 0;
      const rollover = $snapshot.rollovers[bucket.id] || 0;
      const remaining = calculateBucketRemaining(allocated, bucketSpent, rollover);

      return { bucket, allocated, spent: bucketSpent, rollover, remaining };
    });
  }
);

export const unallocated = derived(
  [currentMonthIncome, currentSnapshot],
  ([$income, $snapshot]) => calculateUnallocated($income, $snapshot.allocations)
);

// Actions
export async function addBucket(bucket: Omit<Bucket, 'id'>): Promise<string> {
  const id = crypto.randomUUID();
  const newBucket = { ...bucket, id };
  await db.buckets.add(newBucket);
  buckets.update((b) => [...b, newBucket].sort((a, b) => a.order - b.order));
  return id;
}

export async function updateBucket(id: string, updates: Partial<Bucket>): Promise<void> {
  await db.buckets.update(id, updates);
  buckets.update((b) => b.map((bucket) => (bucket.id === id ? { ...bucket, ...updates } : bucket)));
}

export async function deleteBucket(id: string): Promise<void> {
  await db.buckets.delete(id);
  buckets.update((b) => b.filter((bucket) => bucket.id !== id));
}

export async function addTransaction(transaction: Omit<Transaction, 'id'>): Promise<string> {
  const id = crypto.randomUUID();
  const newTransaction = { ...transaction, id };
  await db.transactions.add(newTransaction);
  transactions.update((t) => [...t, newTransaction]);
  return id;
}

export async function updateTransaction(id: string, updates: Partial<Transaction>): Promise<void> {
  await db.transactions.update(id, updates);
  transactions.update((t) => t.map((tx) => (tx.id === id ? { ...tx, ...updates } : tx)));
}

export async function deleteTransaction(id: string): Promise<void> {
  await db.transactions.delete(id);
  transactions.update((t) => t.filter((tx) => tx.id !== id));
}

export async function addIncome(income: Omit<Income, 'id'>): Promise<string> {
  const id = crypto.randomUUID();
  const newIncome = { ...income, id };
  await db.incomes.add(newIncome);
  incomes.update((i) => [...i, newIncome]);
  return id;
}

export async function deleteIncome(id: string): Promise<void> {
  await db.incomes.delete(id);
  incomes.update((i) => i.filter((inc) => inc.id !== id));
}

export async function setAllocation(bucketId: string, amount: number): Promise<void> {
  const $month = get(currentMonthKey);
  let snapshot = await db.monthSnapshots.get($month);

  if (!snapshot) {
    snapshot = {
      month: $month,
      incomeTotal: 0,
      allocations: {},
      spent: {},
      rollovers: {},
    };
  }

  snapshot.allocations[bucketId] = amount;
  await db.monthSnapshots.put(snapshot);

  monthSnapshots.update((s) => {
    const idx = s.findIndex((snap) => snap.month === $month);
    if (idx >= 0) {
      s[idx] = snapshot!;
      return [...s];
    }
    return [...s, snapshot!];
  });
}
