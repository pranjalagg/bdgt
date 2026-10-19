export type CurrencyCode = 'USD' | 'INR' | 'EUR' | 'GBP' | 'CAD' | 'AUD' | 'SGD' | 'AED';

export interface CurrencyInfo {
  code: CurrencyCode;
  name: string;
  symbol: string;
  // Display locale. It must use "." for decimals and "," for grouping,
  // because parseCurrency reads typed input that way (EUR is en-IE for this reason).
  locale: string;
}

// Two-decimal currencies only: money is stored as amount x 100.
export const CURRENCIES: readonly CurrencyInfo[] = [
  { code: 'USD', name: 'US Dollar', symbol: '$', locale: 'en-US' },
  { code: 'INR', name: 'Indian Rupee', symbol: '₹', locale: 'en-IN' },
  { code: 'EUR', name: 'Euro', symbol: '€', locale: 'en-IE' },
  { code: 'GBP', name: 'British Pound', symbol: '£', locale: 'en-GB' },
  { code: 'CAD', name: 'Canadian Dollar', symbol: '$', locale: 'en-CA' },
  { code: 'AUD', name: 'Australian Dollar', symbol: '$', locale: 'en-AU' },
  { code: 'SGD', name: 'Singapore Dollar', symbol: '$', locale: 'en-SG' },
  { code: 'AED', name: 'UAE Dirham', symbol: 'AED', locale: 'en-AE' },
];

export const DEFAULT_CURRENCY: CurrencyCode = 'USD';

const BY_CODE = new Map(CURRENCIES.map((c) => [c.code as string, c]));

export function isSupportedCurrency(code: unknown): code is CurrencyCode {
  return typeof code === 'string' && BY_CODE.has(code);
}

export function currencyInfo(code: CurrencyCode): CurrencyInfo {
  return BY_CODE.get(code)!;
}
