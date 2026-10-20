import type { CurrencyCode } from './currencies';

// Frankfurter v2 (ECB and other central-bank rates). v1 is deprecated and has
// no AED. Verified 2026-10-19: CORS is open and the answer is
// [{ date, base, quote, rate }] with rate = quote units per 1 base.
export const RATES_URL = 'https://api.frankfurter.dev/v2/rates';

export class RateFetchError extends Error {}

// Called only when the user presses "Fetch rate". The request carries nothing
// but the two currency codes.
export async function fetchRate(
  base: CurrencyCode,
  quote: CurrencyCode,
  fetchImpl: typeof fetch = fetch
): Promise<number> {
  let response: Response;
  try {
    response = await fetchImpl(`${RATES_URL}?base=${base}&quotes=${quote}`);
  } catch {
    throw new RateFetchError('Network request failed');
  }
  if (!response.ok) throw new RateFetchError(`Rates service answered ${response.status}`);

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new RateFetchError('Rates service sent an unreadable answer');
  }

  const first = Array.isArray(body) ? (body[0] as Record<string, unknown> | undefined) : undefined;
  const rate = first?.rate;
  if (first?.base !== base || first?.quote !== quote || typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0) {
    throw new RateFetchError('Rates service sent an unexpected answer');
  }
  return rate;
}
