import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  monthsEnding,
  spendingByMonth,
  incomeByMonth,
  ratesByMonth,
  averageOfComplete,
  bigSmall,
  cumulativeByDay,
  weekWindow,
  dailySpending,
} from '$lib/insights/trends';

// The sample month the UI checks use (scripts/ui-check/sample-backup.json).
const sample = JSON.parse(readFileSync('scripts/ui-check/sample-backup.json', 'utf8')).data;
const txs = sample.transactions.map((t: { bucketId: string; amount: number; date: string }) => ({ ...t, date: new Date(t.date) }));
const incomes = sample.incomes.map((i: { date: string }) => ({ ...i, date: new Date(i.date) }));
const savingsIds = new Set<string>(sample.buckets.filter((b: { isSavings: boolean }) => b.isSavings).map((b: { id: string }) => b.id));
const everydayIds = new Set<string>(sample.buckets.filter((b: { isEveryday: boolean; isSavings: boolean }) => b.isEveryday && !b.isSavings).map((b: { id: string }) => b.id));

describe('trend math', () => {
  it('lists six months ending at the given one, oldest first', () => {
    expect(monthsEnding('2026-10')).toEqual(['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10']);
  });

  it('sums spending per month, leaving out money set aside', () => {
    expect(spendingByMonth(txs, savingsIds, ['2026-09', '2026-10'])).toEqual([283572, 272665]);
    expect(spendingByMonth([], savingsIds, ['2026-10'])).toEqual([0]);
  });

  it('sums income per month', () => {
    expect(incomeByMonth(incomes, ['2026-08', '2026-09', '2026-10'])).toEqual([0, 570000, 520000]);
  });

  it('has no savings rate for a month without income', () => {
    expect(ratesByMonth([520000, 0], [272665, 100])).toEqual([expect.closeTo(0.4756, 4), null]);
  });

  it('averages only months that are over', () => {
    expect(averageOfComplete([10, 20, 99], ['2026-08', '2026-09', '2026-10'], new Date(2026, 9, 23))).toBe(15);
    expect(averageOfComplete([99], ['2026-10'], new Date(2026, 9, 23))).toBeNull();
  });

  it('leaves months with nothing logged out of the average', () => {
    const m = ['2026-06', '2026-07', '2026-08', '2026-09', '2026-10'];
    expect(averageOfComplete([0, 0, 600, 400, 99], m, new Date(2026, 9, 23))).toBe(500);
    expect(averageOfComplete([0, 0, 0, 0, 99], m, new Date(2026, 9, 23))).toBeNull();
  });

  it('splits envelopes into big and small by their month total', () => {
    const oct = new Map<string, number>();
    for (const t of txs) if (t.date.getMonth() === 9 && !savingsIds.has(t.bucketId)) oct.set(t.bucketId, (oct.get(t.bucketId) ?? 0) + t.amount);
    const bs = bigSmall([...oct].map(([id, cents]) => ({ id, cents })), 50000);
    expect([bs.bigTotal, bs.smallTotal]).toEqual([180000, 92665]);
    expect(bs.big.map((b) => b.id)).toEqual(['rent']);
  });

  it('adds up everyday spending day by day', () => {
    const days = cumulativeByDay(txs, everydayIds, '2026-10', 23);
    expect(days).toHaveLength(23);
    expect(days[0]).toBe(0);
    expect(days[22]).toBe(77997);
  });

  it('a past month’s week is its last seven days', () => {
    expect(weekWindow('2026-09', new Date(2026, 9, 23)).map((d) => d.getDate())).toEqual([24, 25, 26, 27, 28, 29, 30]);
    expect(weekWindow('2026-10', new Date(2026, 9, 23)).map((d) => d.getDate())).toEqual([17, 18, 19, 20, 21, 22, 23]);
  });
});

describe('dailySpending', () => {
  const tx = (bucketId: string, amount: number, y: number, m: number, d: number) => ({ bucketId, amount, date: new Date(y, m, d, 13) });
  it('adds up each day, leaving out savings and days outside the list', () => {
    const days = [new Date(2026, 8, 30), new Date(2026, 9, 1), new Date(2026, 9, 2)];
    const txs = [tx('food', 500, 2026, 8, 30), tx('food', 250, 2026, 9, 1), tx('save', 9000, 2026, 9, 1), tx('food', 100, 2026, 9, 1), tx('food', 7, 2026, 9, 5)];
    expect(dailySpending(txs, new Set(['save']), days)).toEqual([500, 350, 0]);
  });
});
