# Zero-Based Budget App — Design Specification

## Overview

A personal finance web application implementing zero-based budgeting, where every dollar of income is allocated to spending buckets. The app tracks income, allocations, transactions, and provides analytics to help manage finances.

**Key Principle:** Income - Allocations = 0 (every dollar has a job)

## Technical Stack

- **Framework:** SvelteKit (static adapter for GitHub Pages)
- **Storage:** IndexedDB via Dexie.js (browser-only, single device)
- **Styling:** Tailwind CSS
- **Charts:** Chart.js
- **Deployment:** GitHub Pages (static site)

## Data Model

### Income

```typescript
interface Income {
  id: string;           // UUID
  amount: number;       // Stored in cents
  date: Date;
  note?: string;
  isRecurring: boolean;
}
```

### Bucket

```typescript
interface Bucket {
  id: string;           // UUID
  name: string;
  color: string;        // Hex color for charts
  order: number;        // Display order
  isDefault: boolean;
}
```

Note: Bucket allocations are stored per-month in `MonthSnapshot.allocations`, not in the Bucket entity itself. This preserves allocation history for analytics.

### Transaction

```typescript
interface Transaction {
  id: string;           // UUID
  amount: number;       // Stored in cents
  bucketId: string;
  date: Date;
  note?: string;
  recurringId?: string; // Links to RecurringTransaction if auto-created
}
```

### RecurringTransaction

```typescript
interface RecurringTransaction {
  id: string;           // UUID
  amount: number;       // Stored in cents
  bucketId: string;
  frequency: 'weekly' | 'biweekly' | 'monthly';
  dayOfMonth?: number;  // For monthly frequency
  nextDueDate: Date;
  note?: string;
  isActive: boolean;
}
```

### MonthSnapshot

```typescript
interface MonthSnapshot {
  month: string;        // YYYY-MM format
  incomeTotal: number;  // Total income for month (cents)
  allocations: Record<string, number>;  // bucketId -> allocated amount
  spent: Record<string, number>;        // bucketId -> spent amount
  rollovers: Record<string, number>;    // bucketId -> rollover from previous month
}
```

## Core Budget Logic

### Zero-Based Calculation

```
Unallocated = Total Income - Sum(all bucket allocations)
```

- Goal: Unallocated should equal zero
- Dashboard shows warning if unallocated ≠ 0

### Bucket Math

```
Remaining = Allocated + Rollover - Spent
```

- Positive remaining: green indicator
- Near zero (< 10% of allocated): yellow indicator
- Negative (overspent): red indicator, shows negative value

### Rollover Logic

On month transition:
```
New Month Rollover = Previous Month Remaining
```

- Automatically calculated when entering a new month
- Stored in MonthSnapshot for historical reference
- User can manually adjust rollover if needed

### Recurring Transaction Processing

- On app load: check all active recurring items
- If `nextDueDate <= today` and not already processed:
  - Create transaction in appropriate bucket
  - Update `nextDueDate` based on frequency
- Show "upcoming" indicator for items due within 7 days

### Data Integrity

- All monetary values stored as integers (cents) to avoid floating-point errors
- Displayed as formatted currency (e.g., $123.45)
- Deleting a bucket prompts: reassign transactions or delete them
- Historical months are read-only

## UI Structure

### Pages

1. **Dashboard (Home)**
   - Month overview: income, allocated, unallocated
   - Bucket cards grid: name, allocated, spent, remaining
   - Quick-add transaction button
   - Mini donut chart: spending by category

2. **Buckets**
   - List all buckets with add/edit/delete/reorder
   - Set allocation for current month
   - View rollover from previous month

3. **Transactions**
   - Filterable list (by bucket, date range)
   - Quick entry form: amount, bucket, optional note
   - Edit/delete existing transactions

4. **Recurring**
   - List recurring items with next due date
   - Add/edit/pause/delete
   - Visual indicator for due/upcoming

5. **Analytics**
   - Monthly spending trends (bar chart)
   - Category comparison across months
   - Income vs spending over time (line chart)
   - Bucket-level drilldown

6. **Settings**
   - Export/import JSON backup
   - Reset data (with confirmation)
   - Manage default buckets

### Navigation

- Mobile (< 640px): Bottom navigation bar
- Desktop (≥ 640px): Left sidebar

## Component Architecture

### Layout Components

- `App.svelte` — Root with routing and global state
- `Layout.svelte` — Nav + main content, responsive
- `Nav.svelte` — Navigation with active states

### Shared Components

- `BucketCard.svelte` — Bucket status display
- `TransactionRow.svelte` — Single transaction with actions
- `QuickEntry.svelte` — Minimal transaction form
- `Modal.svelte` — Reusable modal
- `MonthPicker.svelte` — Navigate between months
- `ProgressBar.svelte` — Visual budget progress

### Chart Components

- `DonutChart.svelte` — Category breakdown
- `BarChart.svelte` — Monthly trends
- `LineChart.svelte` — Income vs spending

### State Management

Svelte stores:
- `budgetStore.ts` — Income, buckets, transactions, current month
- `recurringStore.ts` — Recurring logic and due-date calculations
- `analyticsStore.ts` — Derived data for charts

### File Structure

```
src/
├── lib/
│   ├── components/
│   │   ├── layout/
│   │   ├── shared/
│   │   └── charts/
│   ├── stores/
│   ├── db/              # Dexie.js setup
│   └── utils/           # Date helpers, formatting, calculations
├── routes/              # SvelteKit pages
├── app.css              # Tailwind + custom styles
└── app.html
```

## Default Buckets

Created on first launch:

| Bucket | Color | Purpose |
|--------|-------|---------|
| Rent/Mortgage | #6366f1 | Housing |
| Utilities | #8b5cf6 | Electric, water, gas, internet |
| Grocery | #10b981 | Food at home |
| Transportation | #f59e0b | Gas, transit, car maintenance |
| Dining Out | #ef4444 | Restaurants, takeout |
| Entertainment | #ec4899 | Movies, games, hobbies |
| Subscriptions | #06b6d4 | Streaming, memberships |
| Savings | #22c55e | General savings |
| Investments | #3b82f6 | Stocks, retirement |
| Emergency Fund | #f97316 | Safety net |
| Misc | #6b7280 | Everything else |

## Edge Cases

1. **First-time user** — Onboarding flow: set income, view default buckets, encourage allocation
2. **No income set** — Prompt to add income before allocating
3. **Overspending** — Allowed; bucket shows negative in red
4. **Unbalanced budget** — Warning: "You have $X unallocated" or "You're $X over budget"
5. **Empty month** — Show clean slate with rollovers from previous month
6. **Browser storage cleared** — Data lost; prompt to import backup
7. **Recurring on deleted bucket** — Pause recurring item, notify user
8. **Delete bucket with transactions** — Modal: move to another bucket or delete transactions

## Visual Design

### Design Principles

- Clean, minimal interface with generous whitespace
- Muted color palette, accent colors for buckets and status
- Typography-focused hierarchy
- Cards with subtle shadows, rounded corners
- Single accent color for primary actions

### Color System

```
Background:  #fafafa (light gray)
Surface:     #ffffff (cards)
Text:        #1f2937 (primary), #6b7280 (secondary)
Accent:      #3b82f6 (blue) — primary actions
Success:     #22c55e (green)
Warning:     #f59e0b (amber)
Danger:      #ef4444 (red)
```

### Responsive Breakpoints

- **Mobile (< 640px):** Bottom nav, single column, full-width cards
- **Tablet (640-1024px):** Sidebar nav, 2-column bucket grid
- **Desktop (> 1024px):** Fixed sidebar, 3-4 column grid, side-by-side charts

### Interactions

- Quick entry: slide-up modal (mobile), inline form (desktop)
- Bucket cards: tap/click for details and add transaction
- Swipe to delete on mobile transaction list
- Subtle animations: fade for modals, slide for navigation

### Accessibility

- Semantic HTML (headings, labels, buttons)
- Keyboard navigable
- WCAG AA color contrast
- Visible focus indicators

## Backup & Restore

### Export (JSON)

```json
{
  "version": 1,
  "exportedAt": "2026-04-17T12:00:00Z",
  "data": {
    "buckets": [...],
    "transactions": [...],
    "recurringTransactions": [...],
    "incomes": [...],
    "monthSnapshots": [...]
  }
}
```

### Import

- Validate JSON structure and version
- Confirm before overwriting existing data
- Handle version migrations if schema changes

## Budget Period

- **Period:** Calendar month (1st to last day)
- **Transactions:** Belong to month based on transaction date
- **Historical months:** View-only, no edits
- **Current month:** Full editing capabilities
