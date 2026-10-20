<script lang="ts">
  import { CURRENCIES, type CurrencyCode } from '$lib/currency/currencies';
  import { baseCurrency } from '$lib/stores/currencyStore';
  import { transactions } from '$lib/stores/budgetStore';
  import { rememberedRate, parseRate, convertToBase } from '$lib/currency/conversion';
  import { fetchRate } from '$lib/currency/fetchRate';
  import { formatCurrency } from '$lib/utils/currency';

  // Bound by the parent form: the chosen currency and the rate as typed.
  export let currency: CurrencyCode;
  export let rate = '';
  // The typed amount in minor units of `currency` (the parent parses it).
  export let foreignMinor = 0;
  // Outputs the parent reads: the amount in the base currency, and whether the
  // entry can be saved (a foreign currency needs a valid rate).
  export let baseCents = 0;
  export let rateValid = true;
  export let id = 'currency';

  let lastCurrency = currency;
  let fetching = false;
  let fetchError = '';

  $: isForeign = currency !== $baseCurrency;
  $: parsedRate = isForeign ? parseRate(rate) : null;
  $: baseCents = !isForeign ? foreignMinor : parsedRate !== null ? convertToBase(foreignMinor, parsedRate) : 0;
  $: rateValid = !isForeign || parsedRate !== null;

  // Choosing a currency prefills the last rate used for it, or clears the field.
  $: if (currency !== lastCurrency) {
    lastCurrency = currency;
    fetchError = '';
    rate = currency === $baseCurrency ? '' : String(rememberedRate($transactions, currency, $baseCurrency) ?? '');
  }

  async function fetchLatest() {
    fetching = true;
    fetchError = '';
    const forCurrency = currency;
    const forBase = $baseCurrency;
    try {
      const fetched = await fetchRate(forBase, forCurrency);
      // The answer is for the pair asked; drop it if the user moved on.
      if (forCurrency === currency && forBase === $baseCurrency) rate = String(fetched);
    } catch {
      fetchError = "Couldn't fetch the rate. Enter it manually.";
    } finally {
      fetching = false;
    }
  }
</script>

<div class="mt-2 space-y-2">
  <div class="flex items-center gap-2 text-sm text-muted dark:text-muted-dark">
    <label for="{id}-select">Paid in</label>
    <select id="{id}-select" bind:value={currency} class="select-base !w-auto !py-1 text-sm">
      {#each CURRENCIES as c}
        <option value={c.code}>{c.code}</option>
      {/each}
    </select>
  </div>

  {#if isForeign}
    <div class="rounded-lg border border-border p-3 text-sm dark:border-border-dark">
      <div class="flex flex-wrap items-center gap-2">
        <span class="text-gray-700 dark:text-gray-300">1 {$baseCurrency} =</span>
        <input
          id="{id}-rate"
          type="text"
          inputmode="decimal"
          aria-label="Exchange rate"
          bind:value={rate}
          placeholder="0.00"
          class="input-base !w-28 !py-1 text-sm"
        />
        <span class="text-gray-700 dark:text-gray-300">{currency}</span>
        <button type="button" class="btn-secondary !px-3 !py-1 text-sm" disabled={fetching} on:click={fetchLatest}>
          {fetching ? 'Fetching…' : 'Fetch rate'}
        </button>
      </div>
      {#if fetchError}
        <p class="mt-2 text-danger dark:text-danger-light">{fetchError}</p>
      {:else if !rateValid}
        <p class="mt-2 text-muted dark:text-muted-dark">Enter a rate to convert.</p>
      {:else if foreignMinor !== 0}
        <p class="mt-2 text-muted dark:text-muted-dark">≈ <span class="amt">{formatCurrency(baseCents)}</span></p>
      {/if}
    </div>
  {/if}
</div>
