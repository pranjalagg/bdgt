// src/lib/stores/budgetStore.ts
import { writable, derived, get } from 'svelte/store';
import { db, initializeDefaultBuckets } from '$lib/db';
import { currentMonthKey } from './uiStore';
import { getMonthKey, getMonthRange, getLast6Months } from '$lib/utils/dates';
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

// Raw material for every month-by-month derivation (rollovers, goal
// progress): allocation overrides, income and per-bucket spend keyed by
// month. Built once from the raw stores; nothing is persisted.
export const monthlyLedger = derived(
  [transactions, incomes, monthSnapshots],
  ([$transactions, $incomes, $snapshots]) => {
    const monthSet = new Set<string>();

    const allocationOverrides: Record<string, Record<string, number>> = {};
    for (const s of $snapshots) {
      allocationOverrides[s.month] = s.allocations ?? {};
      monthSet.add(s.month);
    }

    const incomeByMonth: Record<string, number> = {};
    for (const i of $incomes) {
      const m = getMonthKey(new Date(i.date));
      incomeByMonth[m] = (incomeByMonth[m] ?? 0) + i.amount;
      monthSet.add(m);
    }

    const spentByMonthBucket: Record<string, Record<string, number>> = {};
    for (const t of $transactions) {
      const m = getMonthKey(new Date(t.date));
      (spentByMonthBucket[m] ??= {})[t.bucketId] =
        (spentByMonthBucket[m][t.bucketId] ?? 0) + t.amount;
      monthSet.add(m);
    }

    return {
      months: [...monthSet].sort(),
      allocationOverrides,
      incomeByMonth,
      spentByMonthBucket,
    };
  }
);

// Rollover carried into the viewed month, per bucket, derived live from
// every prior month's allocation vs. spend. Nothing is persisted.
export const bucketRollovers = derived(
  [buckets, monthlyLedger, currentMonthKey],
  ([$buckets, $ledger, $month]) => {
    const monthsBefore = $ledger.months.filter((m) => m < $month);
    return accumulateRollovers(
      monthsBefore,
      $buckets,
      $ledger.allocationOverrides,
      $ledger.incomeByMonth,
      $ledger.spentByMonthBucket
    );
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

// Transaction and income mutations no longer touch MonthSnapshot: spend,
// income totals and rollovers are all derived from the raw stores now, so
// there is nothing per-month to keep in sync (and no read-modify-write
// race to lose). Snapshots hold only explicit per-month allocation
// overrides, written from setAllocation.
export async function addTransaction(transaction: Omit<Transaction, 'id'>): Promise<string> {
  assertCents(transaction.amount);
  const id = crypto.randomUUID();
  const newTransaction = { ...transaction, id };
  await db.transactions.add(newTransaction);
  transactions.update((t) => [...t, newTransaction]);
  return id;
}

export async function updateTransaction(id: string, updates: Partial<Transaction>): Promise<void> {
  if (updates.amount !== undefined) assertCents(updates.amount);
  await db.transactions.update(id, updates);
  transactions.update((t) => t.map((tx) => (tx.id === id ? { ...tx, ...updates } : tx)));
}

export async function deleteTransaction(id: string): Promise<void> {
  await db.transactions.delete(id);
  transactions.update((t) => t.filter((tx) => tx.id !== id));
}

export async function addIncome(income: Omit<Income, 'id'>): Promise<string> {
  assertCents(income.amount);
  const id = crypto.randomUUID();
  const newIncome = { ...income, id };
  await db.incomes.add(newIncome);
  incomes.update((i) => [...i, newIncome]);
  return id;
}

export async function updateIncome(id: string, updates: Partial<Income>): Promise<void> {
  if (updates.amount !== undefined) assertCents(updates.amount);
  await db.incomes.update(id, updates);
  incomes.update((i) => i.map((inc) => (inc.id === id ? { ...inc, ...updates } : inc)));
}

export async function deleteIncome(id: string): Promise<void> {
  await db.incomes.delete(id);
  incomes.update((i) => i.filter((inc) => inc.id !== id));
}

// Records an explicit allocation for one bucket in the current month,
// overriding the bucket's standing amount. Atomic get-modify-put.
export async function setAllocation(bucketId: string, amount: number): Promise<void> {
  assertCents(amount, 'allocation');
  const month = get(currentMonthKey);

  const saved = await db.transaction('rw', db.monthSnapshots, async () => {
    const existing = await db.monthSnapshots.get(month);
    const snapshot: MonthSnapshot = existing ?? {
      month,
      incomeTotal: 0,
      allocations: {},
      spent: {},
      rollovers: {},
    };
    snapshot.allocations = { ...snapshot.allocations, [bucketId]: amount };
    await db.monthSnapshots.put(snapshot);
    return snapshot;
  });

  monthSnapshots.update((all) => {
    const idx = all.findIndex((s) => s.month === month);
    if (idx >= 0) {
      const next = [...all];
      next[idx] = saved;
      return next;
    }
    return [...all, saved];
  });
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

  // Only fixed buckets carry a per-month override; percentage/hybrid are
  // always re-derived from monthly income, so stale overrides are ignored.
  if (allocationType === 'fixed') {
    await setAllocation(id, fixedAmount);
  }
}

