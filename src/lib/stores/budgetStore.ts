// src/lib/stores/budgetStore.ts
import { writable, derived, get } from 'svelte/store';
import { db, initializeDefaultBuckets } from '$lib/db';
import { currentMonthKey } from './uiStore';
import { getMonthKey, getPreviousMonthKey, getMonthRange, getLast6Months, getCurrentMonthKey } from '$lib/utils/dates';
import { calculateBucketRemaining, computeAllocation, getTotalPercentage, calculateSavingsRate, spentExcludingSavings, accumulateRollovers } from '$lib/utils/calculations';
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
  await syncMonthSnapshot(getCurrentMonthKey());
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

export const currentMonthFixedIncome = derived(currentMonthIncomes, ($incomes) =>
  $incomes.filter((i) => i.type === 'fixed').reduce((sum, i) => sum + i.amount, 0)
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

export const computedAllocations = derived(
  [buckets, currentMonthIncome],
  ([$buckets, $income]) => {
    const allocations: Record<string, number> = {};
    for (const bucket of $buckets) {
      allocations[bucket.id] = computeAllocation(bucket, $income);
    }
    return allocations;
  }
);

export const totalPercentage = derived(buckets, ($buckets) => getTotalPercentage($buckets));

// Rollover carried into the viewed month, per bucket, derived live from
// every prior month's allocation vs. spend. Nothing is persisted.
export const bucketRollovers = derived(
  [buckets, transactions, incomes, monthSnapshots, currentMonthKey],
  ([$buckets, $transactions, $incomes, $snapshots, $month]) => {
    const months = new Set<string>();
    for (const s of $snapshots) months.add(s.month);
    for (const t of $transactions) months.add(getMonthKey(new Date(t.date)));
    for (const i of $incomes) months.add(getMonthKey(new Date(i.date)));
    const monthsBefore = [...months].filter((m) => m < $month).sort();

    const allocationOverrides: Record<string, Record<string, number>> = {};
    for (const s of $snapshots) allocationOverrides[s.month] = s.allocations ?? {};

    const incomeByMonth: Record<string, number> = {};
    for (const i of $incomes) {
      const m = getMonthKey(new Date(i.date));
      incomeByMonth[m] = (incomeByMonth[m] ?? 0) + i.amount;
    }

    const spentByMonthBucket: Record<string, Record<string, number>> = {};
    for (const t of $transactions) {
      const m = getMonthKey(new Date(t.date));
      (spentByMonthBucket[m] ??= {})[t.bucketId] =
        (spentByMonthBucket[m][t.bucketId] ?? 0) + t.amount;
    }

    return accumulateRollovers(monthsBefore, $buckets, allocationOverrides, incomeByMonth, spentByMonthBucket);
  }
);

export const bucketStatuses = derived(
  [buckets, currentSnapshot, currentMonthTransactions, computedAllocations, bucketRollovers],
  ([$buckets, $snapshot, $transactions, $computed, $rollovers]) => {
    const spent: Record<string, number> = {};
    for (const t of $transactions) {
      spent[t.bucketId] = (spent[t.bucketId] || 0) + t.amount;
    }

    return $buckets.map((bucket): BucketStatus => {
      const allocated = bucket.allocationType === 'fixed'
        ? ($snapshot.allocations[bucket.id] ?? bucket.fixedAmount ?? 0)
        : $computed[bucket.id];
      const bucketSpent = spent[bucket.id] || 0;
      const rollover = $rollovers[bucket.id] || 0;
      const remaining = calculateBucketRemaining(allocated, bucketSpent, rollover);

      return { bucket, allocated, spent: bucketSpent, rollover, remaining };
    });
  }
);

export const unallocated = derived(
  [currentMonthIncome, bucketStatuses],
  ([$income, $statuses]) => {
    const totalAllocated = $statuses.reduce((sum, s) => sum + s.allocated, 0);
    return $income - totalAllocated;
  }
);

export const savingsRate = derived(
  [currentMonthIncome, bucketStatuses],
  ([$income, $statuses]) => {
    const totalSpent = $statuses.reduce(
      (sum, s) => (s.bucket.isSavings ? sum : sum + s.spent),
      0
    );
    return calculateSavingsRate($income, totalSpent);
  }
);

export const savingsRateTrend = derived(
  [transactions, incomes, buckets, currentMonthKey],
  ([$transactions, $incomes, $buckets, $currentMonth]) => {
    const months = getLast6Months($currentMonth);
    const savingsBucketIds = new Set($buckets.filter((b) => b.isSavings).map((b) => b.id));
    return months.map(month => {
      const { start, end } = getMonthRange(month);
      const monthIncome = $incomes
        .filter(i => {
          const date = new Date(i.date);
          return date >= start && date <= end;
        })
        .reduce((sum, i) => sum + i.amount, 0);
      const monthTransactions = $transactions.filter(t => {
        const date = new Date(t.date);
        return date >= start && date <= end;
      });
      const monthSpent = spentExcludingSavings(monthTransactions, savingsBucketIds);
      return { month, rate: calculateSavingsRate(monthIncome, monthSpent) };
    });
  }
);

// parseCurrency() returns NaN on bad input; without this guard an
// invalid form value could persist NaN straight into IndexedDB.
function assertCents(amount: number, label = 'amount'): void {
  if (!Number.isFinite(amount)) {
    throw new Error(`Invalid ${label}: expected a finite number of cents`);
  }
}

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

// Deleting a bucket cascades to everything scoped to it. Without this,
// transactions kept a dead bucketId: money vanished from category views
// while still counting in raw-transaction totals.
export async function deleteBucket(id: string): Promise<void> {
  await db.buckets.delete(id);
  await db.transactions.where('bucketId').equals(id).delete();
  await db.recurringTransactions.where('bucketId').equals(id).delete();
  await db.savingsGoals.where('bucketId').equals(id).delete();

  buckets.update((b) => b.filter((bucket) => bucket.id !== id));
  transactions.update((t) => t.filter((tx) => tx.bucketId !== id));
}

export async function addTransaction(transaction: Omit<Transaction, 'id'>): Promise<string> {
  assertCents(transaction.amount);
  const id = crypto.randomUUID();
  const newTransaction = { ...transaction, id };
  await db.transactions.add(newTransaction);
  transactions.update((t) => [...t, newTransaction]);
  await syncMonthSnapshot(getMonthKey(new Date(transaction.date)));
  return id;
}

export async function updateTransaction(id: string, updates: Partial<Transaction>): Promise<void> {
  if (updates.amount !== undefined) assertCents(updates.amount);
  const existing = get(transactions).find((t) => t.id === id);
  await db.transactions.update(id, updates);
  transactions.update((t) => t.map((tx) => (tx.id === id ? { ...tx, ...updates } : tx)));
  if (existing) {
    const month = getMonthKey(new Date(existing.date));
    await syncMonthSnapshot(month);
    if (updates.date) {
      const newMonth = getMonthKey(new Date(updates.date));
      if (newMonth !== month) {
        await syncMonthSnapshot(newMonth);
      }
    }
  }
}

export async function deleteTransaction(id: string): Promise<void> {
  const existing = get(transactions).find((t) => t.id === id);
  await db.transactions.delete(id);
  transactions.update((t) => t.filter((tx) => tx.id !== id));
  if (existing) {
    await syncMonthSnapshot(getMonthKey(new Date(existing.date)));
  }
}

export async function addIncome(income: Omit<Income, 'id'>): Promise<string> {
  assertCents(income.amount);
  const id = crypto.randomUUID();
  const newIncome = { ...income, id };
  await db.incomes.add(newIncome);
  incomes.update((i) => [...i, newIncome]);
  await syncMonthSnapshot(getMonthKey(new Date(income.date)));
  return id;
}

export async function updateIncome(id: string, updates: Partial<Income>): Promise<void> {
  if (updates.amount !== undefined) assertCents(updates.amount);
  const existing = get(incomes).find((i) => i.id === id);
  await db.incomes.update(id, updates);
  incomes.update((i) => i.map((inc) => (inc.id === id ? { ...inc, ...updates } : inc)));
  if (existing) {
    const month = getMonthKey(new Date(existing.date));
    await syncMonthSnapshot(month);
    if (updates.date) {
      const newMonth = getMonthKey(new Date(updates.date));
      if (newMonth !== month) {
        await syncMonthSnapshot(newMonth);
      }
    }
  }
}

export async function deleteIncome(id: string): Promise<void> {
  const existing = get(incomes).find((i) => i.id === id);
  await db.incomes.delete(id);
  incomes.update((i) => i.filter((inc) => inc.id !== id));
  if (existing) {
    await syncMonthSnapshot(getMonthKey(new Date(existing.date)));
  }
}

export async function setAllocation(bucketId: string, amount: number): Promise<void> {
  assertCents(amount, 'allocation');
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

  await syncMonthSnapshot($month);
}

export async function updateBucketAllocation(
  id: string,
  allocationType: 'fixed' | 'percentage' | 'hybrid',
  fixedAmount: number,
  percentageAmount: number
): Promise<void> {
  await db.buckets.update(id, { allocationType, fixedAmount, percentageAmount });
  buckets.update((b) =>
    b.map((bucket) =>
      bucket.id === id
        ? { ...bucket, allocationType, fixedAmount, percentageAmount }
        : bucket
    )
  );

  if (allocationType === 'fixed' || allocationType === 'hybrid') {
    await setAllocation(id, fixedAmount);
  } else {
    const $month = get(currentMonthKey);
    await syncMonthSnapshot($month);
  }
}

export async function syncMonthSnapshot(monthKey: string): Promise<void> {
  const allIncomes = get(incomes);
  const { start, end } = getMonthRange(monthKey);
  const monthIncomes = allIncomes.filter((i) => {
    const date = new Date(i.date);
    return date >= start && date <= end;
  });
  const incomeTotal = monthIncomes.reduce((sum, i) => sum + i.amount, 0);

  const allTransactions = get(transactions);
  const monthTransactions = allTransactions.filter((t) => {
    const date = new Date(t.date);
    return date >= start && date <= end;
  });
  
  const spent: Record<string, number> = {};
  for (const t of monthTransactions) {
    spent[t.bucketId] = (spent[t.bucketId] || 0) + t.amount;
  }

  let snapshot = await db.monthSnapshots.get(monthKey);
  if (!snapshot) {
    snapshot = {
      month: monthKey,
      incomeTotal: 0,
      allocations: {},
      spent: {},
      rollovers: {},
    };
  }

  snapshot.incomeTotal = incomeTotal;
  snapshot.spent = spent;

  const allBuckets = get(buckets);
  for (const bucket of allBuckets) {
    if (bucket.allocationType === 'fixed') {
      if (snapshot.allocations[bucket.id] === undefined) {
        snapshot.allocations[bucket.id] = bucket.fixedAmount || 0;
      }
    } else {
      snapshot.allocations[bucket.id] = computeAllocation(bucket, incomeTotal);
    }
  }

  await db.monthSnapshots.put(snapshot);

  monthSnapshots.update((s) => {
    const idx = s.findIndex((snap) => snap.month === monthKey);
    if (idx >= 0) {
      s[idx] = snapshot!;
      return [...s];
    }
    return [...s, snapshot!];
  });
}

