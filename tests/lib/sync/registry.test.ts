import { describe, it, expect } from 'vitest';
import { COLLECTIONS, SYNC_TABLES, collectionByTable, isSyncedTable, toRow, fromRow, rowsMatch } from '$lib/sync/registry';

const def = (table: string) => collectionByTable(table)!;

describe('registry', () => {
  it('lists the eleven synced collections in dependency order', () => {
    expect(COLLECTIONS.map((c) => c.table)).toEqual([
      'settings', 'buckets', 'allocations', 'monthNotes', 'recurringTransactions', 'transactions',
      'incomes', 'savingsGoals', 'investmentLots', 'investmentSells', 'investmentPrices',
    ]);
  });

  it('names the Postgres tables in snake_case', () => {
    expect(COLLECTIONS.map((c) => c.remote)).toEqual([
      'settings', 'buckets', 'allocations', 'month_notes', 'recurring_transactions', 'transactions',
      'incomes', 'savings_goals', 'investment_lots', 'investment_sells', 'investment_prices',
    ]);
  });

  it('knows which tables sync and which are bookkeeping', () => {
    expect(isSyncedTable('transactions')).toBe(true);
    expect(isSyncedTable('syncOutbox')).toBe(false);
    expect(isSyncedTable('nope')).toBe(false);
    expect(SYNC_TABLES).toEqual(['syncOutbox', 'syncVersions', 'syncState']);
  });
});

describe('toRow / fromRow round trips', () => {
  const day = new Date(2026, 9, 20); // local midnight
  const cases: [string, Record<string, unknown>][] = [
    ['settings', { key: 'baseCurrency', value: 'INR' }],
    ['settings', { key: 'currencyConfirmed', value: true }],
    ['buckets', { id: 'b1', name: 'Rent', color: '#6366f1', order: 0, isDefault: true, allocationType: 'fixed', fixedAmount: 200000, percentageAmount: 0, isSavings: false, isEveryday: false, createdAt: new Date('2026-10-01T12:00:00.000Z') }],
    ['buckets', { id: 'unsorted', name: 'Unsorted', color: '#b0bec5', order: 11, isDefault: false, allocationType: 'fixed', fixedAmount: 0, percentageAmount: 0, isSavings: false, isEveryday: false, createdAt: new Date('2026-10-02T00:00:00.000Z'), isSystem: true }],
    ['allocations', { id: '2026-10:b1', month: '2026-10', bucketId: 'b1', amount: 50000 }],
    ['monthNotes', { id: 'n1', month: '2026-10', text: 'India Tix', effect: 'down', createdAt: 1790000000000 }],
    ['recurringTransactions', { id: 'r1', amount: 1500, bucketId: 'b1', frequency: 'monthly', dayOfMonth: 8, nextDueDate: day, note: 'Gym', isActive: true }],
    ['transactions', { id: 't1', amount: 5935, bucketId: 'b1', date: day, note: 'Flight', recurringId: 'r1', createdAt: 1790000000123 }],
    ['transactions', { id: 't2', amount: 5935, bucketId: 'b1', date: day, foreign: { amount: 500000, currency: 'INR', rate: 84.25, base: 'USD' } }],
    ['incomes', { id: 'i1', amount: 700000, date: day, note: 'Pay', isRecurring: true, type: 'fixed' }],
    ['savingsGoals', { id: 'g1', name: 'Trip', bucketId: 'b1', targetAmount: 300000, targetDate: day, monthlyContribution: 25000, createdAt: new Date('2026-09-01T00:00:00.000Z'), startingBalance: 1000 }],
    ['investmentLots', { id: 'l1', symbol: 'VTI', shares: 2.5, pricePerShare: 25000, purchaseDate: day, note: 'first', soldShares: 0.5 }],
    ['investmentSells', { id: 's1', lotId: 'l1', shares: 0.5, pricePerShare: 26000, sellDate: day }],
    ['investmentPrices', { symbol: 'VTI', pricePerShare: 26500, updatedAt: new Date('2026-10-05T00:00:00.000Z') }],
  ];

  it.each(cases)('%s record survives a round trip', (table, record) => {
    const d = def(table);
    expect(fromRow(d, toRow(d, record))).toEqual(record);
  });

  it('survives a JSON round trip too, as it will over the network', () => {
    for (const [table, record] of cases) {
      const d = def(table);
      const wire = JSON.parse(JSON.stringify(toRow(d, record)));
      expect(fromRow(d, wire), table).toEqual(record);
    }
  });
});

describe('toRow', () => {
  it('uses the key property as id, even when it is called key or symbol', () => {
    expect(toRow(def('settings'), { key: 'baseCurrency', value: 'USD' }).id).toBe('baseCurrency');
    expect(toRow(def('investmentPrices'), { symbol: 'VTI', pricePerShare: 1, updatedAt: new Date(0) }).id).toBe('VTI');
  });

  it('maps renamed columns and cents/bool/int types straight through', () => {
    const row = toRow(def('buckets'), { id: 'b1', name: 'X', color: '#000', order: 3, isDefault: false, allocationType: 'percentage', fixedAmount: 0, percentageAmount: 12.5, isSavings: true, isEveryday: false, createdAt: new Date('2026-01-01T00:00:00.000Z') });
    expect(row).toMatchObject({ id: 'b1', sort_order: 3, allocation_type: 'percentage', percentage: 12.5, is_savings: true, fixed_amount_cents: 0, created_at: '2026-01-01T00:00:00.000Z' });
  });

  it('writes a date as the local calendar day, never the UTC day', () => {
    const lateEvening = new Date(2026, 11, 31, 23, 59);
    expect(toRow(def('transactions'), { id: 't', amount: 1, bucketId: 'b', date: lateEvening }).date).toBe('2026-12-31');
  });

  it('flattens foreign into four columns, and leaves them null without it', () => {
    const withForeign = toRow(def('transactions'), { id: 't', amount: 1, bucketId: 'b', date: new Date(2026, 0, 1), foreign: { amount: 10, currency: 'EUR', rate: 0.9, base: 'USD' } });
    expect(withForeign).toMatchObject({ foreign_amount_minor: 10, foreign_currency: 'EUR', foreign_rate: 0.9, foreign_base: 'USD' });
    const without = toRow(def('transactions'), { id: 't', amount: 1, bucketId: 'b', date: new Date(2026, 0, 1) });
    expect(without).toMatchObject({ foreign_amount_minor: null, foreign_currency: null, foreign_rate: null, foreign_base: null });
  });

  it('sends optional fields as null', () => {
    const row = toRow(def('transactions'), { id: 't', amount: 1, bucketId: 'b', date: new Date(2026, 0, 1) });
    expect(row).toMatchObject({ note: null, recurring_id: null, created_at: null });
  });

  it('puts fields it does not know into extra, and nothing else', () => {
    const row = toRow(def('transactions'), { id: 't', amount: 1, bucketId: 'b', date: new Date(2026, 0, 1), futureField: { a: 1 }, other: 'x' });
    expect(row.extra).toEqual({ futureField: { a: 1 }, other: 'x' });
    expect(toRow(def('transactions'), { id: 't', amount: 1, bucketId: 'b', date: new Date(2026, 0, 1) }).extra).toEqual({});
  });

  it('turns an invalid date into null instead of throwing', () => {
    expect(toRow(def('transactions'), { id: 't', amount: 1, bucketId: 'b', date: new Date('nope') }).date).toBeNull();
  });
});

describe('fromRow', () => {
  it('restores unknown fields from extra without letting them override mapped ones', () => {
    const record = fromRow(def('transactions'), { id: 't', date: '2026-01-05', amount_cents: 7, bucket_id: 'b', extra: { futureField: 1, amount: 999, id: 'evil' } });
    expect(record).toMatchObject({ id: 't', amount: 7, futureField: 1 });
  });

  it('omits optional fields that are null, and foreign when all four columns are null', () => {
    const record = fromRow(def('transactions'), { id: 't', date: '2026-01-05', amount_cents: 7, bucket_id: 'b', note: null, foreign_amount_minor: null, foreign_currency: null, foreign_rate: null, foreign_base: null, extra: {} });
    expect('note' in record).toBe(false);
    expect('foreign' in record).toBe(false);
  });

  it('reads a date column as local midnight', () => {
    const record = fromRow(def('transactions'), { id: 't', date: '2026-03-08', amount_cents: 1, bucket_id: 'b', extra: {} });
    const d = record.date as Date;
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()]).toEqual([2026, 2, 8, 0]);
  });

  it('accepts a missing or malformed extra', () => {
    expect(fromRow(def('allocations'), { id: 'a', month: '2026-01', bucket_id: 'b', amount_cents: 1 })).toEqual({ id: 'a', month: '2026-01', bucketId: 'b', amount: 1 });
    expect(fromRow(def('allocations'), { id: 'a', month: '2026-01', bucket_id: 'b', amount_cents: 1, extra: 'nope' })).toEqual({ id: 'a', month: '2026-01', bucketId: 'b', amount: 1 });
  });

  it('turns numeric strings from the wire into numbers', () => {
    const record = fromRow(def('investmentLots'), { id: 'l', symbol: 'V', shares: '2.5', price_per_share_cents: '25000', purchase_date: '2026-01-01', sold_shares: '0', extra: {} });
    expect(record).toMatchObject({ shares: 2.5, pricePerShare: 25000, soldShares: 0 });
  });
});

describe('rowsMatch against how Postgres writes values back', () => {
  it('treats the same instant written differently as equal', () => {
    const d = collectionByTable('buckets')!;
    const base = { id: 'b', name: 'X', color: '#000', sort_order: 0, is_default: false, allocation_type: 'fixed', fixed_amount_cents: 0, percentage: 0, is_savings: false, is_everyday: true, is_system: null, extra: {} };
    expect(rowsMatch(d, { ...base, created_at: '2026-01-01T00:00:00.000Z' }, { ...base, created_at: '2026-01-01T00:00:00+00:00' })).toBe(true);
    expect(rowsMatch(d, { ...base, created_at: '2026-01-01T00:00:00.100Z' }, { ...base, created_at: '2026-01-01T00:00:00.1+00:00' })).toBe(true);
    expect(rowsMatch(d, { ...base, created_at: '2026-01-01T00:00:00.000Z' }, { ...base, created_at: '2026-01-01T00:00:01.000Z' })).toBe(false);
  });

  it('treats a number and its string form as equal, and a date with or without a time part', () => {
    const d = collectionByTable('transactions')!;
    const base = { id: 't', bucket_id: 'b', extra: {} };
    expect(rowsMatch(d, { ...base, amount_cents: 5, date: '2026-10-20' }, { ...base, amount_cents: '5', date: '2026-10-20T00:00:00' })).toBe(true);
    expect(rowsMatch(d, { ...base, amount_cents: 5, date: '2026-10-20' }, { ...base, amount_cents: 6, date: '2026-10-20' })).toBe(false);
  });
});

describe('rowsMatch', () => {
  it('ignores sync columns and key order, and sees real differences', () => {
    const d = def('allocations');
    const a = { id: 'a', month: '2026-01', bucket_id: 'b', amount_cents: 1, extra: {}, updated_at: 'x', synced_at: 'y', deleted_at: null, user_id: 'u' };
    const b = { extra: {}, amount_cents: 1, bucket_id: 'b', month: '2026-01', id: 'a' };
    expect(rowsMatch(d, a, b)).toBe(true);
    expect(rowsMatch(d, a, { ...b, amount_cents: 2 })).toBe(false);
    expect(rowsMatch(d, a, { ...b, extra: { z: 1 } })).toBe(false);
  });
});
