<script lang="ts">
  import { buckets, addTransaction } from '$lib/stores/budgetStore';
  import { currentMonthKey } from '$lib/stores/uiStore';
  import { parseCurrency, isValidCurrency, isExpression, evaluateExpression } from '$lib/utils/currency';
  import { parseMonthKey } from '$lib/utils/dates';

  export let preselectedBucketId: string | undefined = undefined;
  export let onComplete: (() => void) | undefined = undefined;

  let amount = '';
  let bucketId = preselectedBucketId || '';
  let note = '';
  let isSubmitting = false;
  let amountTouched = false;

  $: if (preselectedBucketId) bucketId = preselectedBucketId;

  $: amountError = amountTouched && amount && !isValidCurrency(amount)
    ? 'Please enter a valid amount (e.g. 12.50, -5, or 10 + 5.25)'
    : '';

  $: canSubmit = !!amount && !!bucketId && !amountError && isValidCurrency(amount);

  $: showPreview = isExpression(amount) && isValidCurrency(amount);
  $: previewValue = showPreview ? evaluateExpression(amount) : null;

  function handleAmountInput() {
    amountTouched = true;
  }

  async function handleSubmit() {
    amountTouched = true;
    if (!canSubmit) return;

    isSubmitting = true;
    try {
      await addTransaction({
        amount: parseCurrency(amount),
        bucketId,
        date: parseMonthKey($currentMonthKey),
        note: note || undefined,
      });
      amount = '';
      note = '';
      amountTouched = false;
      if (!preselectedBucketId) bucketId = '';
      onComplete?.();
    } finally {
      isSubmitting = false;
    }
  }
</script>

<form on:submit|preventDefault={handleSubmit} class="space-y-3">
  <div>
    <label for="amount" class="label">Amount</label>
    <div class="relative mt-1">
      <span class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400">$</span>
      <input
        id="amount"
        type="text"
        inputmode="decimal"
        bind:value={amount}
        on:input={handleAmountInput}
        placeholder="0.00"
        class="input-base pl-7 {amountError ? '!border-danger focus:!border-danger focus:!ring-danger' : ''}"
        required
      />
    </div>
    {#if amountError}
      <p class="mt-1 text-sm text-danger">{amountError}</p>
    {:else if showPreview && previewValue !== null}
      <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">= ${previewValue.toFixed(2)}</p>
    {/if}
  </div>

  <div>
    <label for="bucket" class="label">Bucket</label>
    <select
      id="bucket"
      bind:value={bucketId}
      class="mt-1 select-base"
      required
    >
      <option value="">Select a bucket</option>
      {#each $buckets as bucket}
        <option value={bucket.id}>{bucket.name}</option>
      {/each}
    </select>
  </div>

  <div>
    <label for="note" class="label">Note (optional)</label>
    <input
      id="note"
      type="text"
      bind:value={note}
      placeholder="Add a note..."
      class="mt-1 input-base"
    />
  </div>

  <button
    type="submit"
    disabled={isSubmitting || !canSubmit}
    class="w-full btn-primary"
  >
    {isSubmitting ? 'Adding...' : 'Add Transaction'}
  </button>
</form>
