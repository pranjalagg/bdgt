import { getMonthKey } from '$lib/utils/dates';

// Home's figure talks about "today" only in the current month; a past month
// shows what was left at its end.
export function heroMode(monthKey: string, now: Date): 'today' | 'past' | 'future' {
  const current = getMonthKey(now);
  return monthKey === current ? 'today' : monthKey < current ? 'past' : 'future';
}

// How far everyday spending is under (positive) or over (negative) the
// plan by a given day: the month's everyday plan spread evenly.
export function planDiff(cumulative: number, planTotal: number, day: number, daysInMonth: number): number {
  return Math.round((planTotal * day) / daysInMonth) - cumulative;
}
