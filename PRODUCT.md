# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary: the author, budgeting personal money day to day and logging expenses quickly on phone or desktop. Secondary: other individuals who find the public GitHub Pages deployment; each uses it alone with their own on-device data. No accounts, no shared or household budgets.

## Product Purpose

A zero-based budgeting app: every unit of income is assigned to a bucket (budget category), expenses are logged against buckets, and the app shows what remains. Success is the user knowing, at a glance and with minimal effort, what is safe to spend and where money is going.

## Positioning

Zero-based buckets with fast capture (amount-first Log flow, Cmd/Ctrl+K, "Safe to spend per day") combined with local-first privacy: no server, no account, all data lives in the user's browser (IndexedDB).

## Operating Context

Used in short bursts: log an expense, check remaining per bucket, review the month. Month-scoped (keys `YYYY-MM`) with rollovers and historical snapshots. Navigation is 4 destinations plus a persistent Log action.

## Capabilities and Constraints

- Static SvelteKit 5 build deployed to GitHub Pages (conditional base path); web only, no backend.
- Data in Dexie/IndexedDB; Svelte stores kept in sync after Dexie writes.
- All money stored as integer cents.
- Buckets: fixed, percentage (of total income), or hybrid allocation.
- Entities: transactions, income (fixed/one-time), month snapshots, recurring transactions, savings goals; routes for analytics, buckets, investments, recurring, settings, transactions.
- Undecided: currency/locale focus and a formal accessibility standard were not specified.

## Product Principles

- Every unit of money has a job; the unallocated amount is always visible.
- Capture beats categorization: logging an expense should take seconds.
- Data stays on the user's device; no feature may require a server or account.
- Show derived answers (safe to spend, remaining) rather than raw ledgers.

## Evidence on Hand

Working app in `src/`; unit tests in `tests/` for currency, dates, calculations. No testimonials, user counts, or brand assets exist; do not fabricate.
