<script lang="ts">
  import { buckets, updateTransaction } from '$lib/stores/budgetStore';
  import { closeModal } from '$lib/stores/uiStore';
  import { parseCurrency, isValidCurrency, isExpression, evaluateExpression, centsToDollars } from '$lib/utils/currency';
  import type { Transaction } from '$lib/types';

  export let transaction: Transaction;
  export let onComplete: (() => void) | undefined = undefined;

  let amount = centsToDollars(transaction.amount).toString();
  let bucketId = transaction.bucketId;
  let note = transaction.note || '';
  let date = new Date(transaction.date).toISOString().split('T')[0];
  let isSubmitting = false;
  let amountTouched = false;

  $: amountError = amountTouched && amount && !isValidCurrency(amount)
    ? 'Please enter a valid positive amount (e.g. 12.50 or 10 + 5.25)'
    : '';

  $: canSubmit = !!amount && !!bucketId && !!date && !amountError && isValidCurrency(amount);

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
      await updateTransaction(transaction.id, {
        amount: parseCurrency(amount),
        bucketId,
        date: new Date(date + 'T12:00:00'),
        note: note || undefined,
      });
      closeModal();
      onComplete?.();
    } finally {
      isSubmitting = false;
    }
  }
</script>

<form on:submit|preventDefault={handleSubmit} class="space-y-3">
  <div>
    <label for="edit-amount" class="block text-sm font-medium text-gray-700 dark:text-gray-200">Amount</label>
    <div class="relative mt-1">
      <span class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400">$</span>
      <input
        id="edit-amount"
        type="text"
        inputmode="decimal"
        bind:value={amount}
        on:input={handleAmountInput}
        placeholder="0.00"
        class="w-full rounded-lg border bg-white py-2 pl-7 pr-3 focus:outline-none focus:ring-1 dark:bg-gray-800 dark:text-gray-100 {amountError ? 'border-danger focus:border-danger focus:ring-danger' : 'border-gray-300 focus:border-primary focus:ring-primary dark:border-border-dark'}"
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
    <label for="edit-bucket" class="block text-sm font-medium text-gray-700 dark:text-gray-200">Bucket</label>
    <select
      id="edit-bucket"
      bind:value={bucketId}
      class="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary dark:border-border-dark dark:bg-gray-800 dark:text-gray-100"
      required
    >
      <option value="">Select a bucket</option>
      {#each $buckets as bucket}
        <option value={bucket.id}>{bucket.name}</option>
      {/each}
    </select>
  </div>

  <div>
    <label for="edit-date" class="block text-sm font-medium text-gray-700 dark:text-gray-200">Date</label>
    <input
      id="edit-date"
      type="date"
      bind:value={date}
      class="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary dark:border-border-dark dark:bg-gray-800 dark:text-gray-100"
      required
    />
  </div>

  <div>
    <label for="edit-note" class="block text-sm font-medium text-gray-700 dark:text-gray-200">Note (optional)</label>
    <input
      id="edit-note"
      type="text"
      bind:value={note}
      placeholder="Add a note..."
      class="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary dark:border-border-dark dark:bg-gray-800 dark:text-gray-100"
    />
  </div>

  <button
    type="submit"
    disabled={isSubmitting || !canSubmit}
    class="w-full rounded-lg bg-primary px-4 py-2 font-medium text-white transition hover:bg-blue-600 disabled:opacity-50"
  >
    {isSubmitting ? 'Saving...' : 'Save Changes'}
  </button>
</form>
