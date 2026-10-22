import type { CurrencyCode } from '$lib/currency/currencies';
import type { CaptureHint, CaptureSource } from '$lib/types';
import type { KeptItem } from './native';

// Reads a payment out of a kept notification. These are pattern sets per kind
// of source (Google Wallet, UPI apps, bank SMS), built from the shapes banks
// and payment apps are known to use; exact parsers per bank and app follow
// real samples from the capture log. Anything unclear still becomes a
// capture with the amount and a guessed payee: every capture waits for review.

export interface ParsedPayment {
  source: CaptureSource;
  sourceLabel: string; // "Google Wallet", "HDFC Bank SMS"
  amount: number; // minor units of `currency`
  currency: CurrencyCode;
  merchant: string | null; // as written, null when no payee could be read
  upiId?: string;
  accountHint?: string; // last digits of the card or account
  reference?: string; // UPI reference, for dedupe
  hint?: CaptureHint;
}

export type SkipReason = 'credit' | 'failed' | 'upcoming' | 'request' | 'promotion' | 'not-a-payment' | 'not-a-bank' | 'no-amount' | 'unknown-app';

export type ParseResult = { ok: true; payment: ParsedPayment } | { ok: false; reason: SkipReason };

export const SKIP_TEXT: Record<SkipReason, string> = {
  credit: 'money coming in',
  failed: 'failed or declined',
  upcoming: 'a due date or an upcoming debit',
  request: 'a payment request',
  promotion: 'an offer',
  'not-a-payment': 'not a payment',
  'not-a-bank': 'not from a bank',
  'no-amount': 'no amount found',
  'unknown-app': 'not a supported app',
};

const APPS: Record<string, { source: CaptureSource; label: string }> = {
  'com.google.android.apps.walletnfcrel': { source: 'wallet', label: 'Google Wallet' },
  'com.google.android.apps.nbu.paisa.user': { source: 'upi-app', label: 'Google Pay' },
  'com.phonepe.app': { source: 'upi-app', label: 'PhonePe' },
  'net.one97.paytm': { source: 'upi-app', label: 'Paytm' },
};

// The six-letter core of Indian bank sender IDs (VM-HDFCBK, AX-SBIUPI-S).
const BANK_SENDERS: Record<string, string> = {
  HDFCBK: 'HDFC Bank', HDFCBN: 'HDFC Bank', ICICIB: 'ICICI Bank', ICICIT: 'ICICI Bank', SBIUPI: 'SBI', SBIINB: 'SBI',
  SBIPSG: 'SBI', CBSSBI: 'SBI', ATMSBI: 'SBI', AXISBK: 'Axis Bank', AXISMR: 'Axis Bank', KOTAKB: 'Kotak Bank',
  KOTAKM: 'Kotak Bank', PNBSMS: 'PNB', BOIIND: 'Bank of India', BOBTXN: 'Bank of Baroda', BOBSMS: 'Bank of Baroda',
  CANBNK: 'Canara Bank', UNIONB: 'Union Bank', IDFCFB: 'IDFC First Bank', INDUSB: 'IndusInd Bank', YESBNK: 'Yes Bank',
  FEDBNK: 'Federal Bank', AUBANK: 'AU Bank', SCBANK: 'Standard Chartered', HSBCIN: 'HSBC', CITIBK: 'Citi',
  AMEXIN: 'Amex', PAYTMB: 'Paytm Payments Bank', JIOPBS: 'Jio Payments Bank', AIRBNK: 'Airtel Payments Bank',
};

const PHONE_NUMBER = /^\+?[\d\s()-]{7,}$/;
const BANK_NAME = /\b(?:bank|card|cards|credit|upi|sbi|hdfc|icici|axis|kotak|amex|chase|citi|discover|capital one|wells fargo)\b/i;

// Same rule as the phone's KeepRules: banks, never people.
export function isBusinessSender(sender: string | undefined): boolean {
  const s = (sender ?? '').trim();
  if (!s || PHONE_NUMBER.test(s)) return false;
  if (BANK_NAME.test(s)) return true;
  return s === s.toUpperCase() && /[A-Z0-9]/.test(s);
}

const INDIAN_SENDER_ID = /^(?:[A-Z]{2}-)?[A-Z0-9]{6}(?:-[A-Z])?$/;

export function bankLabel(sender: string | undefined): string {
  const s = (sender ?? '').trim();
  const core = /^(?:[A-Z]{2}-)?([A-Z0-9]{6})(?:-[A-Z])?$/.exec(s)?.[1];
  if (core && BANK_SENDERS[core]) return `${BANK_SENDERS[core]} SMS`;
  if (BANK_NAME.test(s) && /[a-z]/.test(s)) return `${s} SMS`; // a verified name such as "HDFC Bank"
  return 'Bank SMS';
}

// Amounts. A currency sign or code next to a number, a number followed by a
// code, or SBI's unmarked "debited by 250.0".
const NUMBER = '([0-9][0-9,]*(?:\\.[0-9]{1,2})?)';
const AMOUNT = new RegExp(
  `(?:(₹|€|£|\\$)|\\b(us\\$|ca\\$|c\\$|a\\$|s\\$|rs\\.?|inr|usd|cad|aud|sgd|eur|gbp|aed))\\s*${NUMBER}` +
    `|${NUMBER}\\s*(inr|usd|eur|gbp|aed|rupees?)\\b` +
    `|\\b(?:debited|credited)\\s+(?:by|for|with)\\s+${NUMBER}`,
  'gi'
);
const BALANCE_BEFORE = /\b(?:bal|balance|lmt|limit)\b[\s:.\-a-z]*$/i;

const DOLLARS: CurrencyCode[] = ['USD', 'CAD', 'AUD', 'SGD'];

function currencyFor(marker: string | undefined, base: CurrencyCode, unmarked: CurrencyCode): CurrencyCode {
  const m = (marker ?? '').toLowerCase();
  if (m === '₹' || m.startsWith('rs') || m === 'inr' || m.startsWith('rupee')) return 'INR';
  if (m === '€' || m === 'eur') return 'EUR';
  if (m === '£' || m === 'gbp') return 'GBP';
  if (m === 'aed') return 'AED';
  if (m === 'us$' || m === 'usd') return 'USD';
  if (m === 'ca$' || m === 'c$' || m === 'cad') return 'CAD';
  if (m === 'a$' || m === 'aud') return 'AUD';
  if (m === 's$' || m === 'sgd') return 'SGD';
  if (m === '$') return DOLLARS.includes(base) ? base : 'USD';
  return unmarked;
}

// The first amount that is not a balance or a credit limit. `unmarked` is
// the currency of an amount written without one (SBI's "debited by 250.0").
export function findAmount(text: string, base: CurrencyCode, unmarked: CurrencyCode = base): { amount: number; currency: CurrencyCode } | null {
  for (const m of text.matchAll(AMOUNT)) {
    if (BALANCE_BEFORE.test(text.slice(Math.max(0, m.index - 30), m.index))) continue;
    const digits = (m[3] ?? m[4] ?? m[6])!.replace(/,/g, '');
    const amount = Math.round(Number(digits) * 100);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    return { amount, currency: currencyFor(m[1] ?? m[2] ?? m[5], base, unmarked) };
  }
  return null;
}

const FAILED = /\b(?:failed|declined|unsuccessful|rejected|could not be (?:processed|completed))\b/i;
const REFUND = /\b(?:refund(?:ed)?|reversed|reversal)\b/i;
const REQUEST = /\bhas requested\b|\brequested\s+(?:₹|rs|inr|money|payment|\$)|\bcollect request\b/i;
const UPCOMING = /\bwill be (?:auto-?)?(?:debited|deducted|charged|paid)\b|\b(?:is|are) due\b|\bdue (?:on|by|date)\b|\b(?:minimum|total) (?:amount )?due\b|\bpayment due\b|\bstatement\b|\breminder\b/i;
// Money leaving the person's account, whatever else the message says
// ("debited from your A/c ...; SWIGGY credited").
const OUT = /\b(?:debited|spent|withdrawn|withdrawal|deducted|purchased?|charged?|made a)\b/i;
// Money arriving: someone paid the person.
const IN = /\b(?:sent|paid|transferred) you\b|\breceived\b|\bdeposited\b|\bcredited (?:to|in) (?:your|a\/?c)\b|\ba\/?c\s*\S*\s*(?:is\s+|has been\s+)?credited\b/i;
const SENT = /\b(?:paid|sent|transferred|payment of)\b/i;
const CREDIT = /\b(?:credited|added to)\b/i;
const PROMO = /\b(?:offer|cashback|win|won|reward|coupon|discount|voucher|scratch card|pre-?approved|eligible)\b/i;

// Spending or not. Neutral words such as "transaction" decide nothing: banks
// use them for money in and out. Wallet notifications state a purchase
// without a verb, so for Wallet anything not ruled out is a payment.
function classify(text: string, source: CaptureSource): SkipReason | null {
  if (FAILED.test(text)) return 'failed';
  if (REFUND.test(text)) return 'credit';
  if (REQUEST.test(text)) return 'request';
  if (UPCOMING.test(text)) return 'upcoming';
  if (OUT.test(text)) return null;
  if (IN.test(text)) return 'credit';
  if (SENT.test(text)) return null;
  if (CREDIT.test(text)) return 'credit';
  if (PROMO.test(text)) return 'promotion';
  return source === 'wallet' ? null : 'not-a-payment';
}

// Payees. Bank-specific shapes first; otherwise the earliest plausible
// "to X", "at X" or "transaction with X" (footers such as "SMS BLOCK to
// 9215676766" come last and are not names anyway).
const UPI_ID = /\b([a-z0-9][a-z0-9._-]{1,63}@[a-z][a-z0-9]{1,63})\b(?!\.[a-z])/i;
const STOP = '(?=\\s+(?:on|ref|refno|upi|via|from|using|for|avl|at|not|info|thru)\\b|[.,;:\\n(]|\\s{2,}|$)';
const SPECIFIC: RegExp[] = [
  /UPI\/P2[AM]\/\d+\/([^/\n]+?)(?:\/|\s{2,}|\n|$)/i, // Axis: UPI/P2M/123456789012/SWIGGY
  /\btrf to\s+(.+?)\s+ref(?:no)?\b/i, // SBI: trf to SWIGGY Refno
  /;\s*([A-Za-z][A-Za-z0-9 .&'-]{1,40}?)\s+credited\b/, // ICICI: ; SWIGGY credited
];
const GENERIC: RegExp[] = [
  new RegExp(`\\bto\\s+(?:vpa\\s+|a\\/c\\s+of\\s+)?(.+?)${STOP}`, 'gi'),
  new RegExp(`\\bat\\s+(.+?)(?=\\s+(?:on|avl|ref|via|using)\\b|[.,;\\n]|\\s{2,}|$)`, 'gi'),
  new RegExp(`\\btransaction with\\s+(.+?)${STOP}`, 'gi'),
];
const NOT_A_PAYEE = /^(?:a\/?c|acct|account|your|you|self|card|the|bank|upi|beneficiary|block|call|sms)\b|^\d{1,2}[:.]\d{2}/i;

function cleanPayee(raw: string): string | null {
  const name = raw.replace(/\s+/g, ' ').replace(/\b(?:successfully|successful|via upi)\b.*$/i, '').replace(/[\s.,;:-]+$/, '').trim();
  if (name.length < 2 || name.length > 40 || NOT_A_PAYEE.test(name)) return null;
  const digits = name.replace(/\D/g, '').length;
  if (!/[a-z]/i.test(name) || digits > 6) return null; // an account or phone number, not a payee
  return name;
}

function findPayee(text: string): string | null {
  for (const pattern of SPECIFIC) {
    const m = pattern.exec(text);
    const name = m && cleanPayee(m[1]);
    if (name) return name;
  }
  let best: { index: number; name: string } | null = null;
  for (const pattern of GENERIC) {
    for (const m of text.matchAll(pattern)) {
      const name = cleanPayee(m[1]);
      if (name && (!best || m.index < best.index)) best = { index: m.index, name };
      if (name) break;
    }
  }
  return best?.name ?? null;
}

const ACCOUNT = /\b(?:a\/?c|acct|account|card)\b(?:\s*(?:no\.?|number|ending(?:\s+(?:in|with))?))?\s*[:.]?\s*[xX*•]*\s?(\d{3,4})\b/i;
const MASKED = /[xX*•]{2,}\s?(\d{3,4})\b/;
const REFERENCE = /\b(?:upi\s*ref(?:erence)?|ref(?:erence)?|refno|rrn|utr|upi)(?:\s*(?:no|number|id))?\s*[:.#-]?\s*(\d{9,18})\b/i;
const P2M_REFERENCE = /UPI\/P2[AM]\/(\d{9,18})\//i;

function findHint(text: string, payee: string): CaptureHint | undefined {
  if (/credit card (?:bill|payment|dues)|\bcard bill\b|\bcc (?:bill|payment)\b|towards (?:your )?(?:\w+ )?(?:credit )?card/i.test(text) || /\bcred\b|cred\.club/i.test(payee)) {
    return 'card-bill';
  }
  if (/\bupi lite\b/i.test(text) && /top.?up|added|load|add money/i.test(text)) return 'upi-lite-topup';
  if (/\batm\b|cash withdrawal|withdrawn at|cash wdl/i.test(text)) return 'atm';
  if (/self transfer|\bto self\b|own (?:a\/?c|account)|between your accounts/i.test(text)) return 'transfer';
  return undefined;
}

const GENERIC_TITLE = /^(?:google wallet|google pay|gpay|g pay|wallet|phonepe|paytm|payment(?: successful| received| sent)?|purchase|transaction|money sent)$/i;

export function parseItem(item: KeptItem, base: CurrencyCode): ParseResult {
  let source: CaptureSource;
  let sourceLabel: string;
  if (item.kind === 'sms') {
    if (!isBusinessSender(item.sender ?? item.title)) return { ok: false, reason: 'not-a-bank' };
    source = 'sms';
    sourceLabel = bankLabel(item.sender ?? item.title);
  } else {
    const app = APPS[item.packageName];
    if (!app) return { ok: false, reason: 'unknown-app' };
    ({ source, label: sourceLabel } = app);
  }

  // SMS: the message is the text. Apps: the title often carries the merchant
  // or the amount ("Paid ₹250 to Swiggy").
  const title = item.kind === 'sms' ? '' : (item.title ?? '').trim();
  const text = [title, item.text].filter(Boolean).join('\n');

  const skip = classify(text, source);
  if (skip) return { ok: false, reason: skip };
  // An Indian bank sender ID (VM-SBIUPI) means rupees when no currency is written.
  const indian = item.kind === 'sms' && INDIAN_SENDER_ID.test((item.sender ?? item.title ?? '').trim());
  const found = findAmount(text, base, indian ? 'INR' : base);
  if (!found) return { ok: false, reason: 'no-amount' };

  const upiId = UPI_ID.exec(text)?.[1]?.toLowerCase();
  let merchant = findPayee(text);
  if (source === 'wallet' && title && !GENERIC_TITLE.test(title) && !findAmount(title, base)) merchant = title;
  // "to rahul.s@okhdfcbank" stops at the dot: the UPI ID says it better.
  if (merchant && upiId && upiId.startsWith(merchant.toLowerCase())) merchant = null;

  return {
    ok: true,
    payment: {
      source,
      sourceLabel,
      amount: found.amount,
      currency: found.currency,
      merchant,
      upiId,
      accountHint: (ACCOUNT.exec(text) ?? MASKED.exec(text))?.[1],
      reference: (P2M_REFERENCE.exec(text) ?? REFERENCE.exec(text))?.[1],
      hint: findHint(text, `${merchant ?? ''} ${upiId ?? ''}`),
    },
  };
}
