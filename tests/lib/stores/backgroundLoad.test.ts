import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { db } from '$lib/db';
import { loadData, isLoading } from '$lib/stores/budgetStore';
import { loadCurrency, takeCurrencyPrompt, baseCurrency } from '$lib/stores/currencyStore';
import { resetRealDb } from '../../helpers/realDb';
import { stubLocalStorage } from '../../helpers/localStorage';

beforeEach(async () => {
  await resetRealDb();
  stubLocalStorage();
});

describe('loadData', () => {
  it('shows the loading screen for a normal load', async () => {
    const seen: boolean[] = [];
    isLoading.set(false);
    const stop = isLoading.subscribe((v) => seen.push(v));
    await loadData();
    stop();
    expect(seen).toContain(true);
    expect(get(isLoading)).toBe(false);
  });

  it('does not, for a background reload, so the page is not torn down under the person', async () => {
    isLoading.set(false);
    const seen: boolean[] = [];
    const stop = isLoading.subscribe((v) => seen.push(v));
    await loadData({ background: true });
    stop();
    expect(seen).not.toContain(true);
  });
});

describe('loadCurrency', () => {
  it('asks again after a normal load, but not after a quiet one', async () => {
    await loadCurrency(); // nothing saved: an unconfirmed guess
    expect(takeCurrencyPrompt(false)).toBe(true);
    expect(takeCurrencyPrompt(false)).toBe(false); // already asked this load
    await loadCurrency({ keepPrompt: true });
    expect(takeCurrencyPrompt(false)).toBe(false); // a background reload must not reopen the dialog
    await loadCurrency();
    expect(takeCurrencyPrompt(false)).toBe(true);
  });

  it('still picks up a currency that changed in the database', async () => {
    await loadCurrency();
    await db.settings.bulkPut([{ key: 'baseCurrency', value: 'INR' }, { key: 'currencyConfirmed', value: true }]);
    await loadCurrency({ keepPrompt: true });
    expect(get(baseCurrency)).toBe('INR');
  });
});
