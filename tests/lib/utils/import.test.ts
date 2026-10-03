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
  it('revives bucket createdAt into a Date so rollover math cannot throw', () => {
    const payload = validPayload();
    // @ts-expect-error minimal bucket
    payload.data.buckets = [{ id: 'b1', name: 'Rent', createdAt: '2026-10-01T12:00:00.000Z' }];
    const result = parseImport(JSON.stringify(payload));
    expect(result.data.buckets[0].createdAt).toBeInstanceOf(Date);
  });

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

describe('parseImport: older and richer backups', () => {
  it('treats default savings buckets as savings when the backup predates isSavings', () => {
    const payload = validPayload();
    // @ts-expect-error pre-isSavings buckets
    payload.data.buckets = [{ id: 'b1', name: 'Rent' }, { id: 'b2', name: 'Investments' }, { id: 'b3', name: 'Emergency Fund' }];
    const [rent, invest, emerg] = parseImport(JSON.stringify(payload)).data.buckets;
    expect([rent.isSavings, invest.isSavings, emerg.isSavings]).toEqual([false, true, true]);
    expect([rent.isEveryday, invest.isEveryday, emerg.isEveryday]).toEqual([true, false, false]);
  });

  it('keeps committed obligations out of safe-to-spend when the backup predates isEveryday', () => {
    const payload = validPayload();
    // pre-isEveryday buckets
    (payload.data as { buckets: unknown[] }).buckets = [
      { id: 'b1', name: 'Rent/Mortgage' }, { id: 'b2', name: 'Utilities' },
      { id: 'b3', name: 'Subscriptions' }, { id: 'b4', name: 'Grocery' },
    ];
    const flags = parseImport(JSON.stringify(payload)).data.buckets.map((b) => b.isEveryday);
    expect(flags).toEqual([false, false, false, true]);
  });

  it('rejects bucket ids that would alias Object.prototype', () => {
    const payload = validPayload();
    // @ts-expect-error minimal bucket
    payload.data.buckets = [{ id: '__proto__', name: 'x' }];
    expect(() => parseImport(JSON.stringify(payload))).toThrow(/unusable id/);
  });

  it('preserves bucket colors and flags exactly', () => {
    const payload = validPayload();
    // @ts-expect-error minimal bucket
    payload.data.buckets = [{ id: 'b1', name: 'Rent', color: '#6366f1', isSavings: true, isEveryday: false, createdAt: '2026-04-01T00:00:00.000Z' }];
    const [b] = parseImport(JSON.stringify(payload)).data.buckets;
    expect(b.color).toBe('#6366f1');
    expect(b.isSavings).toBe(true);
    expect(b.isEveryday).toBe(false);
  });

  it('backfills bucket fields that older backups lack', () => {
    const payload = validPayload();
    // @ts-expect-error pre-migration bucket: no createdAt/isSavings/isEveryday
    payload.data.buckets = [{ id: 'b1', name: 'Rent' }, { id: 'b2', name: 'Savings', isSavings: true }];
    const [rent, savings] = parseImport(JSON.stringify(payload)).data.buckets;
    expect(rent.createdAt).toEqual(new Date(0));
    expect(rent.isSavings).toBe(false);
    expect(rent.isEveryday).toBe(true);
    expect(savings.isEveryday).toBe(false);
  });

  it('keeps month notes and drops malformed ones', () => {
    const payload = validPayload();
    // @ts-expect-error minimal snapshot
    payload.data.monthSnapshots = [{
      month: '2026-09', incomeTotal: 0, allocations: {}, spent: {}, rollovers: {},
      notes: [
        { id: 'n1', text: 'Family visit', effect: 'down', createdAt: 5 },
        { id: 'n2', text: '   ', effect: 'up', createdAt: 6 },
        { text: 'no id', effect: 'up' },
        { id: 'n3', text: 'Bonus', effect: 'sideways', createdAt: 7 },
      ],
    }];
    const [snap] = parseImport(JSON.stringify(payload)).data.monthSnapshots;
    expect(snap.notes?.map((n) => [n.id, n.effect])).toEqual([['n1', 'down'], ['n3', 'none']]);
  });

  it('revives every date field in every collection', () => {
    const iso = '2026-09-01T12:00:00.000Z';
    const payload = validPayload();
    Object.assign(payload.data, {
      buckets: [{ id: 'b1', createdAt: iso }],
      recurringTransactions: [{ id: 'r1', frequency: 'monthly', nextDueDate: iso }],
      incomes: [{ id: 'i1', date: iso }],
      savingsGoals: [{ id: 'g1', createdAt: iso, targetDate: iso }],
      investmentLots: [{ id: 'l1', purchaseDate: iso }],
      investmentSells: [{ id: 's1', sellDate: iso }],
      investmentPrices: [{ symbol: 'X', updatedAt: iso }],
    });
    const { data } = parseImport(JSON.stringify(payload)) as unknown as { data: Record<string, Record<string, unknown>[]> };
    const dates: [string, string][] = [
      ['buckets', 'createdAt'], ['transactions', 'date'], ['recurringTransactions', 'nextDueDate'],
      ['incomes', 'date'], ['savingsGoals', 'createdAt'], ['savingsGoals', 'targetDate'],
      ['investmentLots', 'purchaseDate'], ['investmentSells', 'sellDate'], ['investmentPrices', 'updatedAt'],
    ];
    for (const [table, field] of dates) {
      expect(data[table][0][field], `${table}.${field}`).toBeInstanceOf(Date);
    }
  });
});
