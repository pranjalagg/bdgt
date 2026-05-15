export function getMonthKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

export function parseMonthKey(monthKey: string): Date {
  const [year, month] = monthKey.split('-').map(Number);
  return new Date(year, month - 1, 1);
}

export function getCurrentMonthKey(): string {
  return getMonthKey(new Date());
}

export function getPreviousMonthKey(monthKey: string): string {
  const date = parseMonthKey(monthKey);
  date.setMonth(date.getMonth() - 1);
  return getMonthKey(date);
}

export function getNextMonthKey(monthKey: string): string {
  const date = parseMonthKey(monthKey);
  date.setMonth(date.getMonth() + 1);
  return getMonthKey(date);
}

export function getMonthRange(monthKey: string): { start: Date; end: Date } {
  const start = parseMonthKey(monthKey);
  const end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
  return { start, end };
}

export function isCurrentMonth(monthKey: string): boolean {
  return monthKey === getCurrentMonthKey();
}

export function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatMonthYear(monthKey: string): string {
  const date = parseMonthKey(monthKey);
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

export function getLast6Months(currentMonth?: string): string[] {
  let month = currentMonth || getMonthKey(new Date());
  const months: string[] = [];
  for (let i = 0; i < 6; i++) {
    months.unshift(month);
    month = getPreviousMonthKey(month);
  }
  return months;
}

export function getDaysInMonth(monthKey: string): number {
  const date = parseMonthKey(monthKey);
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

export function getDayOfMonth(date: Date): number {
  return date.getDate();
}
