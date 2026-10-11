import { getMonthKey, getPreviousMonthKey } from '$lib/utils/dates';

export const WINDOW_MONTHS = 12;

// The last `count` complete months before `now`'s month, oldest first. The
// current month is partial, so it never counts.
export function completeMonths(now: Date, count: number = WINDOW_MONTHS): string[] {
  const months: string[] = [];
  let month = getPreviousMonthKey(getMonthKey(now));
  for (let i = 0; i < count; i++) {
    months.unshift(month);
    month = getPreviousMonthKey(month);
  }
  return months;
}

// bucketId -> month -> cents. Refunds stay negative; a net-negative month is
// real information, not something to clamp.
export function monthlyTotals(
  transactions: { bucketId: string; amount: number; date: Date | string }[]
): Map<string, Map<string, number>> {
  const totals = new Map<string, Map<string, number>>();
  for (const t of transactions) {
    const month = getMonthKey(new Date(t.date));
    let perMonth = totals.get(t.bucketId);
    if (!perMonth) totals.set(t.bucketId, (perMonth = new Map()));
    perMonth.set(month, (perMonth.get(month) ?? 0) + t.amount);
  }
  return totals;
}
