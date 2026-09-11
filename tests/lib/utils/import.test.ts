import { describe, it, expect } from 'vitest';
import { parseImport } from '$lib/utils/export';

function validPayload() {
  return {
    version: 1,
    exportedAt: '2026-09-01T00:00:00.000Z',
    data: {
      buckets: [],
      transactions: [
        { id: 't1', amount: 500, bucketId: 'b1', date: '2026-08-15T12:00:00.000Z' },
      ],
      recurringTransactions: [],
      incomes: [],
      monthSnapshots: [],
      savingsGoals: [],
      investmentLots: [],
      investmentSells: [],
    },
  };
}

describe('parseImport', () => {
  it('accepts a well-formed payload', () => {
    const result = parseImport(JSON.stringify(validPayload()));
    expect(result.data.transactions).toHaveLength(1);
  });

  it('rejects invalid JSON', () => {
    expect(() => parseImport('{ not json')).toThrow();
  });

  it('rejects an unsupported version', () => {
    const bad = { ...validPayload(), version: 99 };
    expect(() => parseImport(JSON.stringify(bad))).toThrow(/version/i);
  });

  it('rejects a payload missing the data object', () => {
    expect(() => parseImport(JSON.stringify({ version: 1 }))).toThrow(/data/i);
  });

  it('rejects a payload where a collection is not an array', () => {
    const bad = validPayload();
    // @ts-expect-error deliberate corruption
    bad.data.transactions = { nope: true };
    expect(() => parseImport(JSON.stringify(bad))).toThrow(/transactions/i);
  });

  it('revives ISO date strings into Date objects', () => {
    const result = parseImport(JSON.stringify(validPayload()));
    expect(result.data.transactions[0].date).toBeInstanceOf(Date);
    expect(result.data.transactions[0].date.getTime()).toBe(
      new Date('2026-08-15T12:00:00.000Z').getTime()
    );
  });

  it('rejects a recurring transaction with an unknown frequency', () => {
    const payload = validPayload();
    payload.data.recurringTransactions = [
      // @ts-expect-error deliberate corruption
      { id: 'r1', amount: 500, bucketId: 'b1', frequency: 'yearly', nextDueDate: '2026-01-01T00:00:00.000Z', isActive: true },
    ];
    expect(() => parseImport(JSON.stringify(payload))).toThrow(/frequency/i);
  });

  it('accepts every valid recurring frequency', () => {
    const payload = validPayload();
    payload.data.recurringTransactions = ['weekly', 'biweekly', 'monthly'].map((frequency, i) => ({
      id: `r${i}`, amount: 500, bucketId: 'b1', frequency,
      nextDueDate: '2026-01-01T00:00:00.000Z', isActive: true,
    })) as typeof payload.data.recurringTransactions;
    const result = parseImport(JSON.stringify(payload));
    expect(result.data.recurringTransactions).toHaveLength(3);
  });

  it('defaults missing income type to fixed', () => {
    const payload = validPayload();
    payload.data.incomes = [
      // @ts-expect-error legacy row without type
      { id: 'i1', amount: 1000, date: '2026-08-01T00:00:00.000Z', isRecurring: false },
    ];
    const result = parseImport(JSON.stringify(payload));
    expect(result.data.incomes[0].type).toBe('fixed');
  });
});
