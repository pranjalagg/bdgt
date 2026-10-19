import { DEFAULT_CURRENCY, type CurrencyCode } from './currencies';

const CANADA_ZONES = new Set([
  'America/Toronto', 'America/Vancouver', 'America/Edmonton', 'America/Winnipeg',
  'America/Halifax', 'America/St_Johns', 'America/Regina', 'America/Montreal',
]);

const EURO_ZONES = new Set([
  'Europe/Berlin', 'Europe/Paris', 'Europe/Madrid', 'Europe/Rome', 'Europe/Amsterdam',
  'Europe/Brussels', 'Europe/Vienna', 'Europe/Dublin', 'Europe/Lisbon', 'Europe/Helsinki',
  'Europe/Athens', 'Europe/Luxembourg',
]);

function fromTimeZone(tz: string | undefined): CurrencyCode | null {
  if (!tz) return null;
  if (tz === 'Asia/Kolkata' || tz === 'Asia/Calcutta') return 'INR';
  if (tz === 'Asia/Singapore') return 'SGD';
  if (tz === 'Asia/Dubai') return 'AED';
  if (tz === 'Europe/London' || tz === 'Europe/Belfast') return 'GBP';
  if (EURO_ZONES.has(tz)) return 'EUR';
  if (tz.startsWith('Australia/')) return 'AUD';
  if (CANADA_ZONES.has(tz)) return 'CAD';
  if (tz.startsWith('America/') || tz.startsWith('US/') || tz === 'Pacific/Honolulu') return 'USD';
  return null;
}

const REGION_CURRENCY: Record<string, CurrencyCode> = {
  US: 'USD', IN: 'INR', GB: 'GBP', CA: 'CAD', AU: 'AUD', SG: 'SGD', AE: 'AED',
  DE: 'EUR', FR: 'EUR', ES: 'EUR', IT: 'EUR', NL: 'EUR', BE: 'EUR', AT: 'EUR',
  IE: 'EUR', PT: 'EUR', FI: 'EUR', GR: 'EUR', LU: 'EUR',
};

function fromLanguage(language: string | undefined): CurrencyCode | null {
  const region = language?.split('-')[1]?.toUpperCase();
  return (region && REGION_CURRENCY[region]) || null;
}

// Where the app is being used, guessed on the device with no network call:
// the time zone is the best signal (it follows the device), the language
// region is weaker (en-US is common everywhere). Only a suggestion; the
// user confirms it.
export function detectCurrency(timeZone: string | undefined, language: string | undefined): CurrencyCode {
  return fromTimeZone(timeZone) ?? fromLanguage(language) ?? DEFAULT_CURRENCY;
}
