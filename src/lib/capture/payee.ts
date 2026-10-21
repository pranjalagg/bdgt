import { sha256Hex } from '$lib/utils/hash';
import type { MerchantKind } from '$lib/types';
import { maskDigits } from './logExport';
import type { ParsedPayment } from './parse';

// Who was paid: a stable key for learning rules, a name to show, and a guess
// at the kind of merchant for a first suggestion.

const PROCESSOR_PREFIX = /^(?:sq|tst|sp|pp|paypal|gpay|ggl|google)\s*\*\s*/;

// "SQ *BLUE BOTTLE #12" and "Blue Bottle" are the same payee.
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(PROCESSOR_PREFIX, '')
    .replace(/#\s*\d+/g, ' ')
    .replace(/\b\d{3,}\b/g, ' ')
    .replace(/[^a-z0-9&]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

// SHA-256 of the UPI ID, or of the normalised name. Synced in place of the
// identifier itself: UPI IDs often contain phone numbers.
export async function payeeKey(p: Pick<ParsedPayment, 'upiId' | 'merchant'>): Promise<string | undefined> {
  if (p.upiId) return sha256Hex(`upi:${p.upiId.toLowerCase()}`);
  const name = p.merchant ? normalizeName(p.merchant) : '';
  return name ? sha256Hex(`name:${name}`) : undefined;
}

export function displayMerchant(p: Pick<ParsedPayment, 'upiId' | 'merchant'>): string {
  return maskDigits(p.merchant ?? p.upiId ?? 'Unknown payee');
}

// Specific before general: Swiggy Instamart is groceries, Uber Eats is food.
const KINDS: [MerchantKind, RegExp][] = [
  ['grocery', /\b(?:instamart|blinkit|zepto|big ?basket|jiomart|d-?mart|nature'?s basket|whole ?foods|trader joe|safeway|kroger|costco|aldi|sprouts|wegmans)/i],
  ['dining', /\b(?:uber ?eats|swiggy|zomato|eatsure|starbucks|domino|mcdonald|kfc|burger king|subway|pizza hut|chipotle|doordash|grubhub|dunkin|chaayos|blue tokai|third wave)/i],
  ['transport', /\b(?:uber|ola|rapido|lyft|namma yatri|blusmart|irctc|fastag)\b/i],
  ['subscriptions', /\b(?:netflix|spotify|youtube ?premium|jio ?hotstar|hotstar|disney|prime video|icloud|google one|openai|chatgpt)/i],
  ['entertainment', /\b(?:bookmyshow|pvr|inox|cinepolis|ticketmaster|fandango|steam|playstation)/i],
  ['utilities', /\b(?:airtel|jio|vodafone|bescom|tata power|adani electricity|mahanagar gas|comcast|xfinity|pg&e|verizon|t-mobile|at&t)/i],
];

export function merchantKind(p: Pick<ParsedPayment, 'upiId' | 'merchant'>): MerchantKind | undefined {
  const text = `${p.merchant ?? ''} ${p.upiId ?? ''}`;
  return KINDS.find(([, pattern]) => pattern.test(text))?.[0];
}
