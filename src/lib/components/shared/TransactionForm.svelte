<script lang="ts">
  import { buckets } from '$lib/stores/budgetStore';
  import { baseCurrency } from '$lib/stores/currencyStore';
  import { currencyInfo, type CurrencyCode } from '$lib/currency/currencies';
  import { parseRate } from '$lib/currency/conversion';
  import { parseCurrency, isValidCurrency, isExpression, evaluateExpression, dollarsToCents, formatMoney, centsToDollars, symbolPadding } from '$lib/utils/currency';
  import { getLocalDateKey, parseLocalDate } from '$lib/utils/dates';
  import ForeignCurrencyField from './ForeignCurrencyField.svelte';
  import type { TransactionValues } from './transactionValues';

  // The amount, currency, bucket, date and note of one transaction: editing
  // one in Activity, or approving a captured payment in Review. Amounts take
  // sums such as "10 + 5.25" and are checked as they are typed.

  export let id: string;
  export let initial: { amount: number; currency: CurrencyCode; rate?: number; bucketId: string; date: Date; note?: string };
  // A system bucket (Unsorted) is offered only when the transaction is already in it.
  export let keepBucketId: string | undefined = undefined;
  export let submitLabel: string;
  export let busyLabel: string;
  export let onSubmit: (values: TransactionValues) => Promise<void>;

  let currency: CurrencyCode = initial.currency;
  let rate = initial.rate ? String(initial.rate) : '';
  let baseCents = 0;
  let rateValid = true;
  let amount = centsToDollars(initial.amount).toString();
  let bucketId = initial.bucketId;
  let note = initial.note ?? '';
  let date = getLocalDateKey(new Date(initial.date));
  let isSubmitting = false;
  let amountTouched = false;

  $: amountError = amountTouched && amount && !isValidCurrency(amount)
    ? 'Please enter a valid amount (e.g. 12.50, -5, 10 + 5.25, or 12.50 * 3)'
    : '';

  $: canSubmit = !!amount && !!bucketId && !!date && !amountError && isValidCurrency(amount) && rateValid;

  $: showPreview = isExpression(amount) && isValidCurrency(amount);
  $: previewValue = showPreview ? evaluateExpression(amount) : null;
  $: typedMinor = isValidCurrency(amount) ? parseCurrency(amount) : 0;

  async function handleSubmit() {
    amountTouched = true;
    if (!canSubmit) return;
    isSubmitting = true;
    try {
      const foreign = currency === $baseCurrency ? undefined : { amount: typedMinor, currency, rate: parseRate(rate)!, base: $baseCurrency };
      await onSubmit({ typedMinor, baseCents, foreign, bucketId, date: parseLocalDate(date), note: note || undefined });
    } finally {
      isSubmitting = false;
    }
  }
</script>

<form on:submit|preventDefault={handleSubmit} class="space-y-3">
  <div>
    <label for="{id}-amount" class="label">Amount</label>
    <div class="relative mt-1">
      <span class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400">{currencyInfo(currency).symbol}</span>
      <input
        id="{id}-amount"
        type="text"
        inputmode="decimal"
        bind:value={amount}
        on:input={() => (amountTouched = true)}
        placeholder="0.00"
        style:padding-left={symbolPadding(1.75, currencyInfo(currency).symbol)}
        class="input-base pl-7 {amountError ? '!border-danger focus:!border-danger focus:!ring-danger' : ''}"
        required
      />
    </div>
    {#if amountError}
      <p class="mt-1 text-sm text-danger">{amountError}</p>
    {:else if showPreview && previewValue !== null}
      <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">= <span class="amt">{formatMoney(dollarsToCents(previewValue), currency)}</span></p>
    {/if}
    <ForeignCurrencyField {id} bind:currency bind:rate foreignMinor={typedMinor} bind:baseCents bind:rateValid />
  </div>

  <div>
    <label for="{id}-bucket" class="label">Envelope</label>
    <select id="{id}-bucket" bind:value={bucketId} class="mt-1 select-base" required>
      <option value="">Select a bucket</option>
      {#each $buckets.filter((b) => !b.isSystem || b.id === keepBucketId) as bucket}
        <option value={bucket.id}>{bucket.name}</option>
      {/each}
    </select>
  </div>

  <div>
    <label for="{id}-date" class="label">Date</label>
    <input id="{id}-date" type="date" bind:value={date} class="mt-1 input-base" required />
  </div>

  <div>
    <label for="{id}-note" class="label">Note (optional)</label>
    <input id="{id}-note" type="text" bind:value={note} placeholder="Add a note..." class="mt-1 input-base" />
  </div>

  <slot />

  <button type="submit" disabled={isSubmitting || !canSubmit} class="w-full btn-primary">
    {isSubmitting ? busyLabel : submitLabel}
  </button>
</form>
