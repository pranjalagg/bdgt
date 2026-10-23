import { getMonthKey, getPreviousMonthKey, getDaysInMonth, parseMonthKey } from '$lib/utils/dates';

// The numbers behind Insights' trend charts and Home's pace chart. Money is
// in cents; months are YYYY-MM keys, oldest first.

type Tx = { bucketId: string; amount: number; date: Date };

export function monthsEnding(monthKey: string, count = 6): string[] {
  const out = [monthKey];
  while (out.length < count) out.unshift(getPreviousMonthKey(out[0]));
  return out;
}

// Spending is everything except money set aside, as everywhere in the app.
export function spendingByMonth(txs: Tx[], savingsIds: Set<string>, months: string[]): number[] {
  const byMonth = new Map(months.map((m) => [m, 0]));
  for (const t of txs) {
    const m = getMonthKey(new Date(t.date));
    if (byMonth.has(m) && !savingsIds.has(t.bucketId)) byMonth.set(m, (byMonth.get(m) ?? 0) + t.amount);
  }
  return months.map((m) => byMonth.get(m) ?? 0);
}

export function incomeByMonth(incomes: { amount: number; date: Date }[], months: string[]): number[] {
  const byMonth = new Map(months.map((m) => [m, 0]));
  for (const i of incomes) {
    const m = getMonthKey(new Date(i.date));
    if (byMonth.has(m)) byMonth.set(m, (byMonth.get(m) ?? 0) + i.amount);
  }
  return months.map((m) => byMonth.get(m) ?? 0);
}

// The share of income not spent; none for a month without income.
export function ratesByMonth(income: number[], spent: number[]): (number | null)[] {
  return income.map((inc, i) => (inc > 0 ? (inc - spent[i]) / inc : null));
}

// The average over months that are over (the current one is still filling).
export function averageOfComplete(values: number[], months: string[], now: Date): number | null {
  const current = getMonthKey(now);
  const done = values.filter((_, i) => months[i] < current);
  return done.length ? Math.round(done.reduce((s, v) => s + v, 0) / done.length) : null;
}

// Big and small spending as the app has always split it: an envelope is big
// when its month's total reaches the threshold.
export function bigSmall<T extends { id: string; cents: number }>(spent: T[], thresholdCents: number) {
  const positive = spent.filter((s) => s.cents > 0).sort((a, b) => b.cents - a.cents);
  const big = positive.filter((s) => s.cents >= thresholdCents);
  const small = positive.filter((s) => s.cents < thresholdCents);
  const sum = (a: T[]) => a.reduce((s, x) => s + x.cents, 0);
  return { big, small, bigTotal: sum(big), smallTotal: sum(small) };
}

// Spending in the given envelopes added up day by day, for days 1..uptoDay.
export function cumulativeByDay(txs: Tx[], ids: Set<string>, monthKey: string, uptoDay: number): number[] {
  const daily = new Array<number>(uptoDay).fill(0);
  for (const t of txs) {
    const d = new Date(t.date);
    if (getMonthKey(d) !== monthKey || !ids.has(t.bucketId)) continue;
    const day = d.getDate();
    if (day <= uptoDay) daily[day - 1] += t.amount;
  }
  let sum = 0;
  return daily.map((v) => (sum += v));
}

// The seven days the Week view shows: ending today in the current month,
// or on the month's last day for any other month.
export function weekWindow(monthKey: string, today: Date): Date[] {
  const first = parseMonthKey(monthKey);
  const end = getMonthKey(today) === monthKey ? today.getDate() : getDaysInMonth(monthKey);
  return Array.from({ length: 7 }, (_, i) => new Date(first.getFullYear(), first.getMonth(), end - 6 + i));
}
