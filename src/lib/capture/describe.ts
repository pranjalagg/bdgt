import type { CurrencyCode } from '$lib/currency/currencies';
import { formatMoney } from '$lib/utils/currency';
import type { KeptItem } from './native';
import { parseItem, SKIP_TEXT } from './parse';
import { displayMerchant } from './payee';
import { HINT_TEXT } from './queue';

// What the app makes of a kept notification, in words: "Payment: ₹250.00 ·
// Swiggy" or "Skipped: money coming in". Shown in the capture log and the
// development console helpers.
export function describeItem(item: KeptItem, base: CurrencyCode): string {
  const r = parseItem(item, base);
  if (!r.ok) return `Skipped: ${SKIP_TEXT[r.reason]}`;
  const p = r.payment;
  const extra = [p.accountHint && `card or account ••${p.accountHint}`, p.hint && HINT_TEXT[p.hint].toLowerCase()].filter(Boolean);
  return `Payment: ${formatMoney(p.amount, p.currency)} · ${displayMerchant(p)}${extra.length ? ` (${extra.join('; ')})` : ''}`;
}
