import { writable } from 'svelte/store';
import { browser } from '$app/environment';
import { db } from '$lib/db';
import { DEFAULT_CURRENCY, type CurrencyCode } from '$lib/currency/currencies';
import { detectCurrency } from '$lib/currency/detect';
import { resolveStartupSettings, rowsToSettings, settingsToRows } from '$lib/currency/settings';
import { setActiveCurrency } from '$lib/utils/currency';

export const baseCurrency = writable<CurrencyCode>(DEFAULT_CURRENCY);
export const currencyConfirmed = writable<boolean>(true);

baseCurrency.subscribe(setActiveCurrency);

function detectOnDevice(): CurrencyCode {
  if (!browser) return DEFAULT_CURRENCY;
  let timeZone: string | undefined;
  try {
    timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    timeZone = undefined;
  }
  return detectCurrency(timeZone, navigator.language);
}

// Reads the saved currency, or guesses one from the device when nothing
// is saved yet. A guess is not saved until the user confirms it.
export async function loadCurrency(): Promise<void> {
  const stored = rowsToSettings(await db.settings.toArray());
  const settings = resolveStartupSettings(stored, detectOnDevice());
  baseCurrency.set(settings.baseCurrency);
  currencyConfirmed.set(settings.currencyConfirmed);
}

// Saves the choice. This only relabels: stored amounts are not touched.
export async function confirmCurrency(code: CurrencyCode): Promise<void> {
  await db.settings.bulkPut(settingsToRows({ baseCurrency: code, currencyConfirmed: true }));
  baseCurrency.set(code);
  currencyConfirmed.set(true);
}
