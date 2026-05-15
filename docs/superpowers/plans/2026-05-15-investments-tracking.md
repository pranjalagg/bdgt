# Investment Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add standalone investments tab with lot-based stock tracking, portfolio summary, holdings list, and recent activity.

**Architecture:** Lot-based data model where each purchase is a separate lot. Sells reference specific lots. Holdings computed by grouping active lots by symbol. Same Dexie + Svelte store pattern as existing features.

**Tech Stack:** SvelteKit 5, Tailwind CSS, Dexie (IndexedDB), TypeScript

---

## File Structure

| File | Responsibility |
|------|----------------|
| `src/lib/types.ts` | Add InvestmentLot and InvestmentSell interfaces |
| `src/lib/db/index.ts` | Add investmentLots and investmentSells tables |
| `src/lib/stores/investmentStore.ts` | CRUD functions and derived stores for investments |
| `src/lib/utils/export.ts` | Update export/import to include investment data |
| `src/lib/components/layout/Nav.svelte` | Add Investments nav item |
| `src/lib/components/investments/PortfolioSummary.svelte` | Summary card |
| `src/lib/components/investments/HoldingsTable.svelte` | Holdings list with expandable lots |
| `src/lib/components/investments/ActivityList.svelte` | Recent transactions |
| `src/lib/components/investments/AddLotModal.svelte` | Form for new purchase |
| `src/lib/components/investments/SellModal.svelte` | Form to sell from lot |
| `src/routes/investments/+page.svelte` | Investments page |
| `tests/lib/stores/investmentStore.test.ts` | Store tests |

---

## Task 1: Add Investment Types

**Files:**
- Modify: `src/lib/types.ts`

- [ ] **Step 1: Add InvestmentLot interface**

Add to `src/lib/types.ts` after SavingsGoal:

```typescript
export interface InvestmentLot {
  id: string;
  symbol: string;
  shares: number;
  pricePerShare: number;
  purchaseDate: Date;
  note?: string;
  soldShares: number;
}
```

- [ ] **Step 2: Add InvestmentSell interface**

Add after InvestmentLot:

```typescript
export interface InvestmentSell {
  id: string;
  lotId: string;
  shares: number;
  pricePerShare: number;
  sellDate: Date;
  note?: string;
}
```

- [ ] **Step 3: Update ExportData type**

Update the ExportData type's data property to include:

```typescript
export type ExportData = {
  version: number;
  exportedAt: string;
  data: {
    buckets: Bucket[];
    transactions: Transaction[];
    recurringTransactions: RecurringTransaction[];
    incomes: Income[];
    monthSnapshots: MonthSnapshot[];
    savingsGoals: SavingsGoal[];
    investmentLots: InvestmentLot[];
    investmentSells: InvestmentSell[];
  };
};
```

- [ ] **Step 4: Run type check**

Run: `npm run check`
Expected: PASS (no type errors)

- [ ] **Step 5: Commit**

```bash
git add src/lib/types.ts
git commit --no-gpg-sign -m "feat(investments): add InvestmentLot and InvestmentSell types"
```

---

## Task 2: Add Database Tables

**Files:**
- Modify: `src/lib/db/index.ts`

- [ ] **Step 1: Add table declarations to BudgetDatabase class**

Add after `savingsGoals!: Table<SavingsGoal, string>;`:

```typescript
investmentLots!: Table<InvestmentLot, string>;
investmentSells!: Table<InvestmentSell, string>;
```

- [ ] **Step 2: Add import for new types**

Update import to include:

```typescript
import type { Bucket, Transaction, RecurringTransaction, Income, MonthSnapshot, SavingsGoal, InvestmentLot, InvestmentSell } from '$lib/types';
```

- [ ] **Step 3: Add version 4 migration**

Add after the version(3) block:

```typescript
this.version(4).stores({
  buckets: 'id, name, order',
  transactions: 'id, bucketId, date, recurringId',
  recurringTransactions: 'id, bucketId, nextDueDate, isActive',
  incomes: 'id, date',
  monthSnapshots: 'month',
  savingsGoals: 'id, bucketId',
  investmentLots: 'id, symbol, purchaseDate',
  investmentSells: 'id, lotId, sellDate'
});
```

- [ ] **Step 4: Run type check**

Run: `npm run check`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/index.ts
git commit --no-gpg-sign -m "feat(investments): add database tables for lots and sells"
```

---

## Task 3: Create Investment Store - Core

**Files:**
- Create: `src/lib/stores/investmentStore.ts`
- Create: `tests/lib/stores/investmentStore.test.ts`

- [ ] **Step 1: Write test for addLot**

Create `tests/lib/stores/investmentStore.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';

vi.mock('$lib/db', () => ({
  db: {
    investmentLots: {
      add: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      toArray: vi.fn().mockResolvedValue([]),
      get: vi.fn(),
    },
    investmentSells: {
      add: vi.fn(),
      toArray: vi.fn().mockResolvedValue([]),
      where: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) }),
    },
  },
}));

import { lots, sells, addLot, loadInvestments } from '$lib/stores/investmentStore';
import { db } from '$lib/db';

describe('investmentStore', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await loadInvestments();
  });

  describe('addLot', () => {
    it('adds lot to database and store', async () => {
      const lot = {
        symbol: 'AAPL',
        shares: 10,
        pricePerShare: 15000,
        purchaseDate: new Date('2026-05-01'),
        soldShares: 0,
      };

      const id = await addLot(lot);

      expect(id).toBeDefined();
      expect(db.investmentLots.add).toHaveBeenCalledWith(expect.objectContaining({
        symbol: 'AAPL',
        shares: 10,
        pricePerShare: 15000,
      }));
      expect(get(lots)).toHaveLength(1);
      expect(get(lots)[0].symbol).toBe('AAPL');
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/stores/investmentStore.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: Create investmentStore with addLot**

Create `src/lib/stores/investmentStore.ts`:

```typescript
import { writable, get } from 'svelte/store';
import { db } from '$lib/db';
import type { InvestmentLot, InvestmentSell } from '$lib/types';

export const lots = writable<InvestmentLot[]>([]);
export const sells = writable<InvestmentSell[]>([]);
export const isLoadingInvestments = writable(true);

export async function loadInvestments(): Promise<void> {
  isLoadingInvestments.set(true);
  const [loadedLots, loadedSells] = await Promise.all([
    db.investmentLots.toArray(),
    db.investmentSells.toArray(),
  ]);
  lots.set(loadedLots);
  sells.set(loadedSells);
  isLoadingInvestments.set(false);
}

export async function addLot(lot: Omit<InvestmentLot, 'id'>): Promise<string> {
  const id = crypto.randomUUID();
  const newLot: InvestmentLot = { ...lot, id, symbol: lot.symbol.toUpperCase() };
  await db.investmentLots.add(newLot);
  lots.update((l) => [...l, newLot]);
  return id;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/stores/investmentStore.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/stores/investmentStore.ts tests/lib/stores/investmentStore.test.ts
git commit --no-gpg-sign -m "feat(investments): add investmentStore with addLot"
```

---

## Task 4: Investment Store - updateLot and deleteLot

**Files:**
- Modify: `src/lib/stores/investmentStore.ts`
- Modify: `tests/lib/stores/investmentStore.test.ts`

- [ ] **Step 1: Write test for updateLot**

Add to `tests/lib/stores/investmentStore.test.ts`:

```typescript
import { lots, sells, addLot, updateLot, deleteLot, loadInvestments } from '$lib/stores/investmentStore';

describe('updateLot', () => {
  it('updates lot in database and store', async () => {
    const lot = {
      symbol: 'AAPL',
      shares: 10,
      pricePerShare: 15000,
      purchaseDate: new Date('2026-05-01'),
      soldShares: 0,
    };
    const id = await addLot(lot);

    await updateLot(id, { shares: 15 });

    expect(db.investmentLots.update).toHaveBeenCalledWith(id, { shares: 15 });
    expect(get(lots)[0].shares).toBe(15);
  });
});
```

- [ ] **Step 2: Write test for deleteLot**

Add to test file:

```typescript
describe('deleteLot', () => {
  it('deletes lot from database and store', async () => {
    const lot = {
      symbol: 'AAPL',
      shares: 10,
      pricePerShare: 15000,
      purchaseDate: new Date('2026-05-01'),
      soldShares: 0,
    };
    const id = await addLot(lot);

    await deleteLot(id);

    expect(db.investmentLots.delete).toHaveBeenCalledWith(id);
    expect(get(lots)).toHaveLength(0);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run tests/lib/stores/investmentStore.test.ts`
Expected: FAIL (functions not defined)

- [ ] **Step 4: Implement updateLot and deleteLot**

Add to `src/lib/stores/investmentStore.ts`:

```typescript
export async function updateLot(id: string, updates: Partial<InvestmentLot>): Promise<void> {
  if (updates.symbol) {
    updates.symbol = updates.symbol.toUpperCase();
  }
  await db.investmentLots.update(id, updates);
  lots.update((l) => l.map((lot) => (lot.id === id ? { ...lot, ...updates } : lot)));
}

export async function deleteLot(id: string): Promise<void> {
  const sellsForLot = await db.investmentSells.where('lotId').equals(id).toArray();
  if (sellsForLot.length > 0) {
    throw new Error('Cannot delete lot with existing sells');
  }
  await db.investmentLots.delete(id);
  lots.update((l) => l.filter((lot) => lot.id !== id));
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/lib/stores/investmentStore.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/stores/investmentStore.ts tests/lib/stores/investmentStore.test.ts
git commit --no-gpg-sign -m "feat(investments): add updateLot and deleteLot"
```

---

## Task 5: Investment Store - sellFromLot

**Files:**
- Modify: `src/lib/stores/investmentStore.ts`
- Modify: `tests/lib/stores/investmentStore.test.ts`

- [ ] **Step 1: Write test for sellFromLot**

Add to test file:

```typescript
import { lots, sells, addLot, updateLot, deleteLot, sellFromLot, loadInvestments } from '$lib/stores/investmentStore';

describe('sellFromLot', () => {
  it('creates sell record and updates lot soldShares', async () => {
    vi.mocked(db.investmentLots.get).mockResolvedValue({
      id: 'lot-1',
      symbol: 'AAPL',
      shares: 10,
      pricePerShare: 15000,
      purchaseDate: new Date('2026-05-01'),
      soldShares: 0,
    });

    const lot = {
      symbol: 'AAPL',
      shares: 10,
      pricePerShare: 15000,
      purchaseDate: new Date('2026-05-01'),
      soldShares: 0,
    };
    const lotId = await addLot(lot);

    vi.mocked(db.investmentLots.get).mockResolvedValue({
      ...lot,
      id: lotId,
    });

    await sellFromLot(lotId, 3, 16000, new Date('2026-05-10'));

    expect(db.investmentSells.add).toHaveBeenCalledWith(expect.objectContaining({
      lotId,
      shares: 3,
      pricePerShare: 16000,
    }));
    expect(db.investmentLots.update).toHaveBeenCalledWith(lotId, { soldShares: 3 });
    expect(get(sells)).toHaveLength(1);
    expect(get(lots)[0].soldShares).toBe(3);
  });

  it('throws error if selling more than available', async () => {
    const lot = {
      symbol: 'AAPL',
      shares: 10,
      pricePerShare: 15000,
      purchaseDate: new Date('2026-05-01'),
      soldShares: 8,
    };
    const lotId = await addLot(lot);

    vi.mocked(db.investmentLots.get).mockResolvedValue({
      ...lot,
      id: lotId,
    });

    await expect(sellFromLot(lotId, 5, 16000, new Date('2026-05-10'))).rejects.toThrow('Cannot sell more shares than available');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/stores/investmentStore.test.ts`
Expected: FAIL (function not defined)

- [ ] **Step 3: Implement sellFromLot**

Add to `src/lib/stores/investmentStore.ts`:

```typescript
export async function sellFromLot(
  lotId: string,
  shares: number,
  pricePerShare: number,
  sellDate: Date,
  note?: string
): Promise<string> {
  const lot = await db.investmentLots.get(lotId);
  if (!lot) {
    throw new Error('Lot not found');
  }

  const availableShares = lot.shares - lot.soldShares;
  if (shares > availableShares) {
    throw new Error('Cannot sell more shares than available');
  }

  const id = crypto.randomUUID();
  const newSell: InvestmentSell = {
    id,
    lotId,
    shares,
    pricePerShare,
    sellDate,
    note,
  };

  await db.investmentSells.add(newSell);
  sells.update((s) => [...s, newSell]);

  const newSoldShares = lot.soldShares + shares;
  await db.investmentLots.update(lotId, { soldShares: newSoldShares });
  lots.update((l) => l.map((lt) => (lt.id === lotId ? { ...lt, soldShares: newSoldShares } : lt)));

  return id;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/lib/stores/investmentStore.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/stores/investmentStore.ts tests/lib/stores/investmentStore.test.ts
git commit --no-gpg-sign -m "feat(investments): add sellFromLot with validation"
```

---

## Task 6: Investment Store - Derived Stores

**Files:**
- Modify: `src/lib/stores/investmentStore.ts`

- [ ] **Step 1: Add Holding type**

Add to top of `src/lib/stores/investmentStore.ts`:

```typescript
import { writable, derived, get } from 'svelte/store';

export interface Holding {
  symbol: string;
  totalShares: number;
  avgCostBasis: number;
  totalCost: number;
  lots: InvestmentLot[];
}

export interface PortfolioSummary {
  totalInvested: number;
  holdingsCount: number;
  topHoldings: Holding[];
}

export interface Activity {
  type: 'buy' | 'sell';
  symbol: string;
  shares: number;
  pricePerShare: number;
  date: Date;
  lotId?: string;
}
```

- [ ] **Step 2: Add holdings derived store**

Add after the writable stores:

```typescript
export const holdings = derived(lots, ($lots) => {
  const symbolMap = new Map<string, InvestmentLot[]>();

  for (const lot of $lots) {
    const existing = symbolMap.get(lot.symbol) || [];
    existing.push(lot);
    symbolMap.set(lot.symbol, existing);
  }

  const result: Holding[] = [];
  for (const [symbol, symbolLots] of symbolMap) {
    const totalShares = symbolLots.reduce((sum, l) => sum + (l.shares - l.soldShares), 0);
    if (totalShares <= 0) continue;

    const totalCost = symbolLots.reduce((sum, l) => {
      const remainingShares = l.shares - l.soldShares;
      return sum + remainingShares * l.pricePerShare;
    }, 0);

    const avgCostBasis = totalShares > 0 ? Math.round(totalCost / totalShares) : 0;

    result.push({
      symbol,
      totalShares,
      avgCostBasis,
      totalCost,
      lots: symbolLots.filter((l) => l.shares - l.soldShares > 0),
    });
  }

  return result.sort((a, b) => b.totalCost - a.totalCost);
});
```

- [ ] **Step 3: Add portfolioSummary derived store**

Add after holdings:

```typescript
export const portfolioSummary = derived(holdings, ($holdings): PortfolioSummary => {
  const totalInvested = $holdings.reduce((sum, h) => sum + h.totalCost, 0);
  const holdingsCount = $holdings.length;
  const topHoldings = $holdings.slice(0, 5);

  return { totalInvested, holdingsCount, topHoldings };
});
```

- [ ] **Step 4: Add recentActivity derived store**

Add after portfolioSummary:

```typescript
export const recentActivity = derived([lots, sells], ([$lots, $sells]): Activity[] => {
  const activities: Activity[] = [];

  for (const lot of $lots) {
    activities.push({
      type: 'buy',
      symbol: lot.symbol,
      shares: lot.shares,
      pricePerShare: lot.pricePerShare,
      date: new Date(lot.purchaseDate),
      lotId: lot.id,
    });
  }

  for (const sell of $sells) {
    const lot = $lots.find((l) => l.id === sell.lotId);
    if (lot) {
      activities.push({
        type: 'sell',
        symbol: lot.symbol,
        shares: sell.shares,
        pricePerShare: sell.pricePerShare,
        date: new Date(sell.sellDate),
        lotId: sell.lotId,
      });
    }
  }

  return activities
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .slice(0, 10);
});
```

- [ ] **Step 5: Run type check**

Run: `npm run check`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/stores/investmentStore.ts
git commit --no-gpg-sign -m "feat(investments): add derived stores for holdings, summary, activity"
```

---

## Task 7: Update Export/Import

**Files:**
- Modify: `src/lib/utils/export.ts`

- [ ] **Step 1: Update exportToJson**

Update the function to include investment data:

```typescript
export async function exportToJson(): Promise<string> {
  const [buckets, transactions, recurringTransactions, incomes, monthSnapshots, savingsGoals, investmentLots, investmentSells] = await Promise.all([
    db.buckets.toArray(),
    db.transactions.toArray(),
    db.recurringTransactions.toArray(),
    db.incomes.toArray(),
    db.monthSnapshots.toArray(),
    db.savingsGoals.toArray(),
    db.investmentLots.toArray(),
    db.investmentSells.toArray(),
  ]);

  const data: ExportData = {
    version: 1,
    exportedAt: new Date().toISOString(),
    data: { buckets, transactions, recurringTransactions, incomes, monthSnapshots, savingsGoals, investmentLots, investmentSells },
  };

  return JSON.stringify(data, null, 2);
}
```

- [ ] **Step 2: Update importFromJson**

Update the function to handle investment data:

```typescript
export async function importFromJson(json: string): Promise<void> {
  const data: ExportData = JSON.parse(json);

  if (data.version !== 1) {
    throw new Error('Unsupported backup version');
  }

  const incomesWithType = data.data.incomes.map((i) => ({
    ...i,
    type: i.type || 'fixed',
  }));

  await db.transaction('rw', [db.buckets, db.transactions, db.recurringTransactions, db.incomes, db.monthSnapshots, db.savingsGoals, db.investmentLots, db.investmentSells], async () => {
    await db.buckets.clear();
    await db.transactions.clear();
    await db.recurringTransactions.clear();
    await db.incomes.clear();
    await db.monthSnapshots.clear();
    await db.savingsGoals.clear();
    await db.investmentLots.clear();
    await db.investmentSells.clear();

    await db.buckets.bulkAdd(data.data.buckets);
    await db.transactions.bulkAdd(data.data.transactions);
    await db.recurringTransactions.bulkAdd(data.data.recurringTransactions);
    await db.incomes.bulkAdd(incomesWithType);
    await db.monthSnapshots.bulkAdd(data.data.monthSnapshots);
    if (data.data.savingsGoals) {
      await db.savingsGoals.bulkAdd(data.data.savingsGoals);
    }
    if (data.data.investmentLots) {
      await db.investmentLots.bulkAdd(data.data.investmentLots);
    }
    if (data.data.investmentSells) {
      await db.investmentSells.bulkAdd(data.data.investmentSells);
    }
  });
}
```

- [ ] **Step 3: Update resetAllData**

Update to include investment tables:

```typescript
export async function resetAllData(): Promise<void> {
  await db.transaction('rw', [db.buckets, db.transactions, db.recurringTransactions, db.incomes, db.monthSnapshots, db.savingsGoals, db.investmentLots, db.investmentSells], async () => {
    await db.buckets.clear();
    await db.transactions.clear();
    await db.recurringTransactions.clear();
    await db.incomes.clear();
    await db.monthSnapshots.clear();
    await db.savingsGoals.clear();
    await db.investmentLots.clear();
    await db.investmentSells.clear();
  });
}
```

- [ ] **Step 4: Run type check**

Run: `npm run check`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/utils/export.ts
git commit --no-gpg-sign -m "feat(investments): include investment data in export/import"
```

---

## Task 8: Add Navigation Link

**Files:**
- Modify: `src/lib/components/layout/Nav.svelte`

- [ ] **Step 1: Add trending-up icon path**

Add to `iconPaths` object after 'chart':

```typescript
'trending-up': '<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>',
```

- [ ] **Step 2: Add Investments to mainNavItems**

Add after Analytics in the `mainNavItems` array:

```typescript
const mainNavItems = [
  { href: '/', label: 'Dashboard', icon: 'home' },
  { href: '/buckets', label: 'Buckets', icon: 'folder' },
  { href: '/transactions', label: 'Transactions', icon: 'list' },
  { href: '/recurring', label: 'Recurring', icon: 'refresh' },
  { href: '/analytics', label: 'Analytics', icon: 'chart' },
  { href: '/investments', label: 'Investments', icon: 'trending-up' },
];
```

- [ ] **Step 3: Run dev server and verify**

Run: `npm run dev`
Verify: Investments link appears in nav between Analytics and Settings

- [ ] **Step 4: Commit**

```bash
git add src/lib/components/layout/Nav.svelte
git commit --no-gpg-sign -m "feat(investments): add Investments link to navigation"
```

---

## Task 9: Create PortfolioSummary Component

**Files:**
- Create: `src/lib/components/investments/PortfolioSummary.svelte`

- [ ] **Step 1: Create component**

Create `src/lib/components/investments/PortfolioSummary.svelte`:

```svelte
<script lang="ts">
  import { formatCurrency } from '$lib/utils/currency';
  import type { PortfolioSummary } from '$lib/stores/investmentStore';

  export let summary: PortfolioSummary;
</script>

<div class="card p-5">
  <h2 class="section-title mb-4">Portfolio Summary</h2>
  <div class="flex flex-wrap gap-6">
    <div>
      <p class="metric-label">Total Invested</p>
      <p class="text-2xl font-bold tabular-nums text-gray-800 dark:text-gray-100">
        {formatCurrency(summary.totalInvested)}
      </p>
    </div>
    <div>
      <p class="metric-label">Holdings</p>
      <p class="text-2xl font-bold tabular-nums text-gray-800 dark:text-gray-100">
        {summary.holdingsCount}
      </p>
    </div>
  </div>
  {#if summary.topHoldings.length > 0}
    <div class="mt-4">
      <p class="metric-label mb-2">Top Holdings</p>
      <div class="flex flex-wrap gap-2">
        {#each summary.topHoldings.slice(0, 3) as holding}
          <span class="rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary">
            {holding.symbol}
          </span>
        {/each}
      </div>
    </div>
  {/if}
</div>
```

- [ ] **Step 2: Run type check**

Run: `npm run check`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/lib/components/investments/PortfolioSummary.svelte
git commit --no-gpg-sign -m "feat(investments): add PortfolioSummary component"
```

---

## Task 10: Create HoldingsTable Component

**Files:**
- Create: `src/lib/components/investments/HoldingsTable.svelte`

- [ ] **Step 1: Create component**

Create `src/lib/components/investments/HoldingsTable.svelte`:

```svelte
<script lang="ts">
  import { formatCurrency } from '$lib/utils/currency';
  import type { Holding } from '$lib/stores/investmentStore';

  export let holdings: Holding[];
  export let onAddPurchase: () => void;
  export let onSellFromLot: (lotId: string) => void;

  let expandedSymbol: string | null = null;

  function toggleExpand(symbol: string) {
    expandedSymbol = expandedSymbol === symbol ? null : symbol;
  }

  function formatShares(shares: number): string {
    return shares % 1 === 0 ? shares.toString() : shares.toFixed(4);
  }
</script>

<div class="card">
  <div class="flex items-center justify-between border-b border-gray-100 px-5 py-4 dark:border-border-dark">
    <h2 class="section-title">Holdings</h2>
    <button class="btn-primary text-sm" on:click={onAddPurchase}>
      + Add Purchase
    </button>
  </div>

  {#if holdings.length === 0}
    <div class="px-5 py-8 text-center text-muted">
      No holdings yet. Add your first purchase to get started.
    </div>
  {:else}
    <div class="divide-y divide-gray-100 dark:divide-border-dark">
      {#each holdings as holding}
        <div>
          <button
            class="flex w-full items-center justify-between px-5 py-4 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50"
            on:click={() => toggleExpand(holding.symbol)}
          >
            <div class="flex items-center gap-3">
              <span class="font-semibold text-gray-800 dark:text-gray-100">{holding.symbol}</span>
              <span class="text-sm text-muted">{formatShares(holding.totalShares)} shares</span>
            </div>
            <div class="flex items-center gap-4">
              <div class="text-right">
                <p class="font-medium tabular-nums text-gray-800 dark:text-gray-100">
                  {formatCurrency(holding.totalCost)}
                </p>
                <p class="text-xs text-muted">
                  avg {formatCurrency(holding.avgCostBasis)}/share
                </p>
              </div>
              <svg
                class="h-5 w-5 text-gray-400 transition-transform {expandedSymbol === holding.symbol ? 'rotate-180' : ''}"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </button>

          {#if expandedSymbol === holding.symbol}
            <div class="border-t border-gray-100 bg-gray-50/50 px-5 py-3 dark:border-border-dark dark:bg-gray-800/30">
              <p class="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Lots</p>
              <div class="space-y-2">
                {#each holding.lots as lot}
                  {@const remainingShares = lot.shares - lot.soldShares}
                  <div class="flex items-center justify-between rounded-lg bg-white p-3 dark:bg-surface-dark">
                    <div>
                      <p class="text-sm font-medium text-gray-800 dark:text-gray-100">
                        {formatShares(remainingShares)} shares @ {formatCurrency(lot.pricePerShare)}
                      </p>
                      <p class="text-xs text-muted">
                        Purchased {new Date(lot.purchaseDate).toLocaleDateString()}
                      </p>
                    </div>
                    {#if remainingShares > 0}
                      <button
                        class="btn-secondary text-xs"
                        on:click|stopPropagation={() => onSellFromLot(lot.id)}
                      >
                        Sell
                      </button>
                    {/if}
                  </div>
                {/each}
              </div>
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>
```

- [ ] **Step 2: Run type check**

Run: `npm run check`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/lib/components/investments/HoldingsTable.svelte
git commit --no-gpg-sign -m "feat(investments): add HoldingsTable component with expandable lots"
```

---

## Task 11: Create ActivityList Component

**Files:**
- Create: `src/lib/components/investments/ActivityList.svelte`

- [ ] **Step 1: Create component**

Create `src/lib/components/investments/ActivityList.svelte`:

```svelte
<script lang="ts">
  import { formatCurrency } from '$lib/utils/currency';
  import type { Activity } from '$lib/stores/investmentStore';

  export let activities: Activity[];

  function formatShares(shares: number): string {
    return shares % 1 === 0 ? shares.toString() : shares.toFixed(4);
  }
</script>

<div class="card">
  <div class="border-b border-gray-100 px-5 py-4 dark:border-border-dark">
    <h2 class="section-title">Recent Activity</h2>
  </div>

  {#if activities.length === 0}
    <div class="px-5 py-8 text-center text-muted">
      No activity yet.
    </div>
  {:else}
    <ul class="divide-y divide-gray-100 dark:divide-border-dark">
      {#each activities as activity}
        <li class="flex items-center gap-3 px-5 py-3">
          <span
            class="flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium
                   {activity.type === 'buy' ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'}"
          >
            {activity.type === 'buy' ? '↓' : '↑'}
          </span>
          <div class="flex-1">
            <p class="text-sm font-medium text-gray-800 dark:text-gray-100">
              {activity.type === 'buy' ? 'Bought' : 'Sold'} {formatShares(activity.shares)} {activity.symbol}
            </p>
            <p class="text-xs text-muted">
              @ {formatCurrency(activity.pricePerShare)} · {activity.date.toLocaleDateString()}
            </p>
          </div>
          <p class="font-medium tabular-nums {activity.type === 'buy' ? 'text-gray-800 dark:text-gray-100' : 'text-success'}">
            {activity.type === 'buy' ? '' : '+'}{formatCurrency(activity.shares * activity.pricePerShare)}
          </p>
        </li>
      {/each}
    </ul>
  {/if}
</div>
```

- [ ] **Step 2: Run type check**

Run: `npm run check`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/lib/components/investments/ActivityList.svelte
git commit --no-gpg-sign -m "feat(investments): add ActivityList component"
```

---

## Task 12: Create AddLotModal Component

**Files:**
- Create: `src/lib/components/investments/AddLotModal.svelte`

- [ ] **Step 1: Create component**

Create `src/lib/components/investments/AddLotModal.svelte`:

```svelte
<script lang="ts">
  import Modal from '$lib/components/shared/Modal.svelte';
  import { closeModal } from '$lib/stores/uiStore';
  import { addLot } from '$lib/stores/investmentStore';
  import { parseCurrency, isValidCurrency } from '$lib/utils/currency';

  let symbol = '';
  let shares = '';
  let pricePerShare = '';
  let purchaseDate = new Date().toISOString().split('T')[0];
  let note = '';
  let isSubmitting = false;
  let error = '';

  $: isValid = symbol.trim() && parseFloat(shares) > 0 && isValidCurrency(pricePerShare) && purchaseDate;

  async function handleSubmit() {
    if (!isValid) return;

    isSubmitting = true;
    error = '';

    try {
      await addLot({
        symbol: symbol.trim().toUpperCase(),
        shares: parseFloat(shares),
        pricePerShare: parseCurrency(pricePerShare),
        purchaseDate: new Date(purchaseDate),
        note: note.trim() || undefined,
        soldShares: 0,
      });
      closeModal();
      resetForm();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to add purchase';
    } finally {
      isSubmitting = false;
    }
  }

  function resetForm() {
    symbol = '';
    shares = '';
    pricePerShare = '';
    purchaseDate = new Date().toISOString().split('T')[0];
    note = '';
  }
</script>

<Modal id="add-lot" title="Add Purchase">
  <form on:submit|preventDefault={handleSubmit} class="space-y-4 pt-4">
    {#if error}
      <p class="text-sm text-danger">{error}</p>
    {/if}

    <div>
      <label for="symbol" class="label">Symbol</label>
      <input
        id="symbol"
        type="text"
        bind:value={symbol}
        placeholder="AAPL"
        class="input-base mt-1 uppercase"
        required
      />
    </div>

    <div class="grid grid-cols-2 gap-4">
      <div>
        <label for="shares" class="label">Shares</label>
        <input
          id="shares"
          type="number"
          step="any"
          min="0"
          bind:value={shares}
          placeholder="10"
          class="input-base mt-1"
          required
        />
      </div>
      <div>
        <label for="price" class="label">Price per Share</label>
        <input
          id="price"
          type="text"
          bind:value={pricePerShare}
          placeholder="$150.00"
          class="input-base mt-1"
          required
        />
      </div>
    </div>

    <div>
      <label for="date" class="label">Purchase Date</label>
      <input
        id="date"
        type="date"
        bind:value={purchaseDate}
        class="input-base mt-1"
        required
      />
    </div>

    <div>
      <label for="note" class="label">Note (optional)</label>
      <input
        id="note"
        type="text"
        bind:value={note}
        placeholder="First purchase"
        class="input-base mt-1"
      />
    </div>

    <div class="flex justify-end gap-3 pt-2">
      <button type="button" class="btn-secondary" on:click={closeModal}>
        Cancel
      </button>
      <button type="submit" class="btn-primary" disabled={!isValid || isSubmitting}>
        {isSubmitting ? 'Adding...' : 'Add Purchase'}
      </button>
    </div>
  </form>
</Modal>
```

- [ ] **Step 2: Run type check**

Run: `npm run check`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/lib/components/investments/AddLotModal.svelte
git commit --no-gpg-sign -m "feat(investments): add AddLotModal component"
```

---

## Task 13: Create SellModal Component

**Files:**
- Create: `src/lib/components/investments/SellModal.svelte`

- [ ] **Step 1: Create component**

Create `src/lib/components/investments/SellModal.svelte`:

```svelte
<script lang="ts">
  import Modal from '$lib/components/shared/Modal.svelte';
  import { closeModal } from '$lib/stores/uiStore';
  import { lots, sellFromLot } from '$lib/stores/investmentStore';
  import { parseCurrency, isValidCurrency, formatCurrency } from '$lib/utils/currency';

  export let lotId: string;

  let shares = '';
  let pricePerShare = '';
  let sellDate = new Date().toISOString().split('T')[0];
  let note = '';
  let isSubmitting = false;
  let error = '';

  $: lot = $lots.find((l) => l.id === lotId);
  $: availableShares = lot ? lot.shares - lot.soldShares : 0;
  $: sharesNum = parseFloat(shares) || 0;
  $: isValid = sharesNum > 0 && sharesNum <= availableShares && isValidCurrency(pricePerShare) && sellDate;

  async function handleSubmit() {
    if (!isValid || !lot) return;

    isSubmitting = true;
    error = '';

    try {
      await sellFromLot(
        lotId,
        sharesNum,
        parseCurrency(pricePerShare),
        new Date(sellDate),
        note.trim() || undefined
      );
      closeModal();
      resetForm();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to sell shares';
    } finally {
      isSubmitting = false;
    }
  }

  function resetForm() {
    shares = '';
    pricePerShare = '';
    sellDate = new Date().toISOString().split('T')[0];
    note = '';
  }

  function sellAll() {
    shares = availableShares.toString();
  }
</script>

<Modal id="sell-lot" title="Sell Shares">
  {#if lot}
    <form on:submit|preventDefault={handleSubmit} class="space-y-4 pt-4">
      {#if error}
        <p class="text-sm text-danger">{error}</p>
      {/if}

      <div class="rounded-lg bg-gray-50 p-3 dark:bg-gray-800/50">
        <p class="text-sm font-medium text-gray-800 dark:text-gray-100">
          {lot.symbol} · {availableShares} shares available
        </p>
        <p class="text-xs text-muted">
          Cost basis: {formatCurrency(lot.pricePerShare)}/share
        </p>
      </div>

      <div>
        <div class="flex items-center justify-between">
          <label for="sell-shares" class="label">Shares to Sell</label>
          <button type="button" class="text-xs text-primary hover:underline" on:click={sellAll}>
            Sell all
          </button>
        </div>
        <input
          id="sell-shares"
          type="number"
          step="any"
          min="0"
          max={availableShares}
          bind:value={shares}
          placeholder={availableShares.toString()}
          class="input-base mt-1"
          required
        />
        {#if sharesNum > availableShares}
          <p class="mt-1 text-xs text-danger">Cannot sell more than available shares</p>
        {/if}
      </div>

      <div>
        <label for="sell-price" class="label">Sell Price per Share</label>
        <input
          id="sell-price"
          type="text"
          bind:value={pricePerShare}
          placeholder="$160.00"
          class="input-base mt-1"
          required
        />
      </div>

      <div>
        <label for="sell-date" class="label">Sell Date</label>
        <input
          id="sell-date"
          type="date"
          bind:value={sellDate}
          class="input-base mt-1"
          required
        />
      </div>

      <div>
        <label for="sell-note" class="label">Note (optional)</label>
        <input
          id="sell-note"
          type="text"
          bind:value={note}
          placeholder="Taking profits"
          class="input-base mt-1"
        />
      </div>

      <div class="flex justify-end gap-3 pt-2">
        <button type="button" class="btn-secondary" on:click={closeModal}>
          Cancel
        </button>
        <button type="submit" class="btn-primary" disabled={!isValid || isSubmitting}>
          {isSubmitting ? 'Selling...' : 'Sell Shares'}
        </button>
      </div>
    </form>
  {:else}
    <p class="py-4 text-center text-muted">Lot not found</p>
  {/if}
</Modal>
```

- [ ] **Step 2: Run type check**

Run: `npm run check`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/lib/components/investments/SellModal.svelte
git commit --no-gpg-sign -m "feat(investments): add SellModal component"
```

---

## Task 14: Create Investments Page

**Files:**
- Create: `src/routes/investments/+page.svelte`

- [ ] **Step 1: Create page**

Create `src/routes/investments/+page.svelte`:

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { openModal } from '$lib/stores/uiStore';
  import {
    loadInvestments,
    isLoadingInvestments,
    holdings,
    portfolioSummary,
    recentActivity,
  } from '$lib/stores/investmentStore';
  import PortfolioSummary from '$lib/components/investments/PortfolioSummary.svelte';
  import HoldingsTable from '$lib/components/investments/HoldingsTable.svelte';
  import ActivityList from '$lib/components/investments/ActivityList.svelte';
  import AddLotModal from '$lib/components/investments/AddLotModal.svelte';
  import SellModal from '$lib/components/investments/SellModal.svelte';

  let selectedLotId = '';

  onMount(() => {
    loadInvestments();
  });

  function handleAddPurchase() {
    openModal('add-lot');
  }

  function handleSellFromLot(lotId: string) {
    selectedLotId = lotId;
    openModal('sell-lot');
  }
</script>

<div class="space-y-6">
  <h1 class="page-title">Investments</h1>

  {#if $isLoadingInvestments}
    <div class="flex items-center justify-center py-12">
      <div class="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
    </div>
  {:else}
    <PortfolioSummary summary={$portfolioSummary} />

    <HoldingsTable
      holdings={$holdings}
      onAddPurchase={handleAddPurchase}
      onSellFromLot={handleSellFromLot}
    />

    <ActivityList activities={$recentActivity} />
  {/if}
</div>

<AddLotModal />
<SellModal lotId={selectedLotId} />
```

- [ ] **Step 2: Run type check**

Run: `npm run check`
Expected: PASS

- [ ] **Step 3: Run dev server and test**

Run: `npm run dev`
Test:
1. Navigate to /investments
2. Click "Add Purchase" and add a stock
3. Verify it appears in holdings
4. Expand holdings to see lots
5. Click "Sell" on a lot and complete sale
6. Verify activity shows both buy and sell

- [ ] **Step 4: Commit**

```bash
git add src/routes/investments/+page.svelte
git commit --no-gpg-sign -m "feat(investments): add investments page with full functionality"
```

---

## Task 15: Integration Testing

**Files:** None (manual testing)

- [ ] **Step 1: Test full flow**

Run: `npm run dev`

Test scenarios:
1. Add 3 different stocks with multiple lots each
2. Verify portfolio summary shows correct totals
3. Verify holdings are grouped by symbol
4. Sell partial shares from one lot
5. Verify activity list shows all transactions
6. Export data and verify investments included
7. Reset and import - verify investments restored

- [ ] **Step 2: Run all tests**

Run: `npm run test:run`
Expected: All tests PASS

- [ ] **Step 3: Run type check**

Run: `npm run check`
Expected: PASS

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit --no-gpg-sign -m "feat(investments): complete investment tracking feature"
```

---

## Summary

15 tasks total:
- Tasks 1-2: Types and database
- Tasks 3-6: Store with CRUD and derived stores
- Task 7: Export/import
- Task 8: Navigation
- Tasks 9-13: UI components
- Task 14: Page
- Task 15: Integration testing
