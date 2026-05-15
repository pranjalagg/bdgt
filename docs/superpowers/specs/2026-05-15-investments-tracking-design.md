# Investment Tracking Feature Design

**Date:** 2026-05-15  
**Status:** Approved

## Overview

Add standalone investments tab to track stock holdings with individual lot tracking. Manual data entry only (no API integration). Cost basis tracking now, live prices deferred to future iteration.

## Requirements

- Manual entry of stock purchases (lots)
- Individual lot tracking for tax accuracy
- Sell shares from specific lots
- Portfolio summary at a glance
- Holdings list grouped by symbol
- Recent buy/sell activity
- Standalone tab, no budget integration
- Export/import with existing app data

## Data Model

### InvestmentLot

```typescript
interface InvestmentLot {
  id: string;
  symbol: string;           // e.g., "AAPL"
  shares: number;           // decimal allowed (0.5 shares)
  pricePerShare: number;    // cents
  purchaseDate: Date;
  note?: string;
  soldShares: number;       // tracks partial sells, 0 initially
}
```

### InvestmentSell

```typescript
interface InvestmentSell {
  id: string;
  lotId: string;            // references the lot being sold
  shares: number;           // shares sold from this lot
  pricePerShare: number;    // sell price in cents
  sellDate: Date;
  note?: string;
}
```

### Derived Values (computed, not stored)

- `remainingShares` = `shares - soldShares`
- `costBasis` = `shares * pricePerShare`
- `totalInvested` = sum of all lots' cost basis
- Holdings grouped by symbol with average cost basis

## Store Design

New file: `src/lib/stores/investmentStore.ts`

### Writable Stores (synced with Dexie)

- `lots: Writable<InvestmentLot[]>`
- `sells: Writable<InvestmentSell[]>`

### Derived Stores

- `holdings` — grouped by symbol: `{ symbol, totalShares, avgCostBasis, lots[] }`
- `portfolioSummary` — `{ totalInvested, holdingsCount, topHoldings }`
- `recentActivity` — last 10 buys/sells sorted by date

### CRUD Functions

- `addLot(lot)`
- `updateLot(id, updates)`
- `deleteLot(id)` — only if no sells against it
- `sellFromLot(lotId, shares, price, date)`

Pattern: Write to Dexie first, then update Svelte store (same as budgetStore.ts).

## Database Schema

Update `src/lib/db/index.ts` with new version:

```typescript
db.version(X).stores({
  // ... existing tables
  investmentLots: '++id, symbol, purchaseDate',
  investmentSells: '++id, lotId, sellDate'
});
```

## UI Design

### Route

New route: `src/routes/investments/+page.svelte`

### Navigation

Add "Investments" to Nav.svelte between Analytics and Settings. Icon: trending-up.

### Page Layout

```
┌─────────────────────────────────────┐
│ Portfolio Summary                   │
│ Total Invested: $X,XXX | 5 Holdings │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│ Holdings                            │
│ ┌─────┬────────┬──────┬──────────┐ │
│ │ SYM │ Shares │ Avg  │ Cost     │ │
│ │AAPL │ 10.5   │ $150 │ $1,575   │ │
│ │GOOGL│ 2.0    │ $140 │ $280     │ │
│ └─────┴────────┴──────┴──────────┘ │
│ [+ Add Purchase]                    │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│ Recent Activity                     │
│ • May 10 - Bought 5 AAPL @ $150     │
│ • May 5 - Sold 2 MSFT @ $420        │
└─────────────────────────────────────┘
```

### Components

| Component | Purpose |
|-----------|---------|
| `PortfolioSummary.svelte` | Summary card with total invested, holdings count |
| `HoldingsTable.svelte` | Table with expandable rows to show individual lots |
| `ActivityList.svelte` | Recent buy/sell transactions |
| `AddLotModal.svelte` | Form for new stock purchase |
| `SellModal.svelte` | Form to sell shares from specific lot |

## Export/Import

Update `ExportData` type in `src/lib/types.ts`:

```typescript
export type ExportData = {
  // ... existing fields
  data: {
    // ... existing tables
    investmentLots: InvestmentLot[];
    investmentSells: InvestmentSell[];
  };
};
```

Settings page export/import includes investment data automatically.

## Out of Scope (Future)

- Live price fetching (Alpha Vantage / Yahoo Finance)
- Gain/loss calculations with current market prices
- Performance charts over time
- Dividend tracking
- CSV import from Robinhood
- Budget integration (linking to buckets)

## Technical Notes

- All monetary values in cents (consistent with existing app)
- Shares can be decimal (fractional shares supported)
- Symbol stored as uppercase string
- Same Dexie + Svelte store pattern as existing features
