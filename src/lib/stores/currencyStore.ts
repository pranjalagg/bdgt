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

// The confirm modal opens once per load of the saved settings. Escape
// leaves currencyConfirmed false but must not reopen it in a loop; a fresh
// load (an import or reset that keeps the same code) must ask again.
let prompted = false;

export function takeCurrencyPrompt(confirmed: boolean): boolean {
  if (confirmed || prompted) return false;
  prompted = true;
  return true;
}

export function resetCurrencyPrompt(): void {
  prompted = false;
}

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
// is saved yet. A guess is saved as unconfirmed, so it stays put (a later
// load from another time zone must not relabel amounts already entered)
// while the confirm modal still asks until the user answers.
export async function loadCurrency(): Promise<void> {
  const stored = rowsToSettings(await db.settings.toArray());
  const settings = resolveStartupSettings(stored, detectOnDevice());
  if (!stored) await db.settings.bulkPut(settingsToRows(settings));
  resetCurrencyPrompt();
  baseCurrency.set(settings.baseCurrency);
  currencyConfirmed.set(settings.currencyConfirmed);
}

// Saves the choice. This only relabels: stored amounts are not touched.
export async function confirmCurrency(code: CurrencyCode): Promise<void> {
  await db.settings.bulkPut(settingsToRows({ baseCurrency: code, currencyConfirmed: true }));
  baseCurrency.set(code);
  currencyConfirmed.set(true);
}
