export function centsToDollars(cents: number): number {
  return cents / 100;
}

export function dollarsToCents(dollars: number): number {
  return Math.round(dollars * 100);
}

export function formatCurrency(cents: number): string {
  const dollars = centsToDollars(Math.abs(cents));
  const formatted = dollars.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
  });
  return cents < 0 ? `-${formatted}` : formatted;
}

export function parseCurrency(value: string): number {
  const cleaned = value.replace(/[$,]/g, '').trim();
  if (!cleaned) return 0;
  return dollarsToCents(parseFloat(cleaned));
}

export function isValidCurrency(value: string): boolean {
  const cleaned = value.replace(/[$,]/g, '').trim();
  if (!cleaned) return false;
  const num = parseFloat(cleaned);
  return !isNaN(num) && isFinite(num) && num > 0 && /^\d+(\.\d{0,2})?$/.test(cleaned);
}
