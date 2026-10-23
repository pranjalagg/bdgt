import { CURRENCIES, DEFAULT_CURRENCY, currencyInfo, type CurrencyCode } from '$lib/currency/currencies';

let activeCurrency: CurrencyCode = DEFAULT_CURRENCY;

// Set once at startup (and on change) by currencyStore. Kept as module
// state so formatCurrency keeps its one-argument signature; the root
// layout rebuilds the app on change so nothing renders a stale symbol.
export function setActiveCurrency(code: CurrencyCode): void {
  activeCurrency = code;
}

export function getActiveCurrency(): CurrencyCode {
  return activeCurrency;
}

export function currencySymbol(): string {
  return currencyInfo(activeCurrency).symbol;
}

// A multi-character symbol (AED) overflows the one-character prefix the
// inputs are padded for. `baseRem` is the input's normal left padding.
export function symbolPadding(baseRem: number, symbol: string = currencySymbol()): string | undefined {
  const extra = symbol.length - 1;
  return extra > 0 ? `${(baseRem + extra * 0.8).toFixed(2).replace(/\.?0+$/, '')}rem` : undefined;
}

export function centsToDollars(cents: number): number {
  return cents / 100;
}

export function dollarsToCents(dollars: number): number {
  return Math.round(dollars * 100);
}

export function formatMoney(cents: number, code: CurrencyCode): string {
  const info = currencyInfo(code);
  const formatted = centsToDollars(Math.abs(cents)).toLocaleString(info.locale, {
    style: 'currency',
    currency: info.code,
  });
  return cents < 0 ? `-${formatted}` : formatted;
}

// "$1,280.29" as ["$1,280", ".29"], for hero figures that set the cents
// smaller. Every supported locale writes a decimal point.
export function splitFraction(formatted: string): [string, string] {
  const i = formatted.lastIndexOf('.');
  return i === -1 ? [formatted, ''] : [formatted.slice(0, i), formatted.slice(i)];
}

export function formatCurrency(cents: number): string {
  return formatMoney(cents, activeCurrency);
}

// Every supported symbol, whatever the active
// currency: someone with a USD habit typing "$" into an INR budget still
// gets the number they meant.
const SYMBOLS = [...new Set(CURRENCIES.map((c) => c.symbol))];
const STRIP_PATTERN = new RegExp(
  `[${SYMBOLS.filter((s) => s.length === 1).map((s) => s.replace(/[\\\]^$-]/g, '\\$&')).join('')}]|${SYMBOLS.filter((s) => s.length > 1).join('|')}`,
  'gi'
);

function stripSymbols(value: string): string {
  return value.replace(STRIP_PATTERN, '');
}

// A comma is accepted only as a thousands separator, Western (1,234,567) or
// lakh (12,34,567). Anything else, like the decimal comma in "12,50", is
// rejected: dropping it would silently read 12,50 as 1250.
const GROUPED_NUMBER = /^(?:\d{1,3}(?:,\d{3})+|\d{1,2}(?:,\d{2})*,\d{3})(?:\.\d*)?$/;

export function stripGrouping(token: string): string | null {
  if (!token.includes(',')) return token;
  return GROUPED_NUMBER.test(token) ? token.replace(/,/g, '') : null;
}

export function parseCurrency(value: string): number {
  const cleaned = stripSymbols(value).trim();
  if (!cleaned) return 0;
  const result = evaluateExpression(value);
  if (result === null) return NaN;
  return dollarsToCents(result);
}

const TOKEN_PATTERN = /^(?:\d+\.?\d{0,2}|\.\d{1,2})$/;

function isValidToken(token: string): boolean {
  return TOKEN_PATTERN.test(token);
}

export function evaluateExpression(value: string): number | null {
  let cleaned = stripSymbols(value).trim();
  if (!cleaned) return null;

  let negateFirst = false;
  if (cleaned.startsWith('-')) {
    negateFirst = true;
    cleaned = cleaned.substring(1).trim();
    if (!cleaned) return null;
  }

  const parts = cleaned.split(/\s*([\+\-\*\/])\s*/);
  for (let i = 0; i < parts.length; i += 2) {
    const grouped = stripGrouping(parts[i]);
    if (grouped === null) return null;
    parts[i] = grouped;
  }
  if (!isValidToken(parts[0])) return null;

  // Pass 1: * and / bind tighter than + and -, so resolve them first,
  // left to right, folding into a running list of addable terms.
  const terms = [parseFloat(parts[0])];
  const addSubOps: string[] = [];

  for (let i = 1; i < parts.length; i += 2) {
    const op = parts[i];
    const operand = parts[i + 1];
    if (!operand || !isValidToken(operand)) return null;
    const num = parseFloat(operand);

    if (op === '*' || op === '/') {
      if (op === '/' && num === 0) return null;
      const last = terms.length - 1;
      terms[last] = op === '*' ? terms[last] * num : terms[last] / num;
    } else if (op === '+' || op === '-') {
      addSubOps.push(op);
      terms.push(num);
    } else {
      return null;
    }
  }

  // Pass 2: combine the resolved terms with + and -.
  let result = negateFirst ? -terms[0] : terms[0];
  for (let i = 0; i < addSubOps.length; i++) {
    result = addSubOps[i] === '+' ? result + terms[i + 1] : result - terms[i + 1];
  }

  result = Math.round(result * 100) / 100;
  return isFinite(result) ? result : null;
}

export function isExpression(value: string): boolean {
  const cleaned = stripSymbols(value).trim();
  return /[\d\.]\s*[\+\-\*\/]\s*[\d\.]/.test(cleaned);
}

export function isValidCurrency(value: string): boolean {
  const result = evaluateExpression(value);
  return result !== null && result !== 0;
}
