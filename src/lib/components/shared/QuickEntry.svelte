<script lang="ts">
  import { buckets, addTransaction } from '$lib/stores/budgetStore';
  import { parseCurrency } from '$lib/utils/currency';

  export let preselectedBucketId: string | undefined = undefined;
  export let onComplete: (() => void) | undefined = undefined;

  let amount = '';
  let bucketId = preselectedBucketId || '';
  let note = '';
  let isSubmitting = false;

  $: if (preselectedBucketId) bucketId = preselectedBucketId;

  async function handleSubmit() {
    if (!amount || !bucketId) return;

    isSubmitting = true;
    try {
      await addTransaction({
        amount: parseCurrency(amount),
        bucketId,
        date: new Date(),
        note: note || undefined,
      });
      amount = '';
      note = '';
      if (!preselectedBucketId) bucketId = '';
      onComplete?.();
    } finally {
      isSubmitting = false;
    }
  }
</script>

<form on:submit|preventDefault={handleSubmit} class="space-y-3">
  <div>
    <label for="amount" class="block text-sm font-medium text-gray-700 dark:text-gray-200">Amount</label>
    <div class="relative mt-1">
      <span class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400">$</span>
      <input
        id="amount"
        type="text"
        inputmode="decimal"
        bind:value={amount}
        placeholder="0.00"
        class="w-full rounded-lg border border-gray-300 bg-white py-2 pl-7 pr-3 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary dark:border-border-dark dark:bg-gray-800 dark:text-gray-100"
        required
      />
    </div>
  </div>

  <div>
    <label for="bucket" class="block text-sm font-medium text-gray-700 dark:text-gray-200">Bucket</label>
    <select
      id="bucket"
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
    <label for="note" class="block text-sm font-medium text-gray-700 dark:text-gray-200">Note (optional)</label>
    <input
      id="note"
      type="text"
      bind:value={note}
      placeholder="Add a note..."
      class="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary dark:border-border-dark dark:bg-gray-800 dark:text-gray-100"
    />
  </div>

  <button
    type="submit"
    disabled={isSubmitting || !amount || !bucketId}
    class="w-full rounded-lg bg-primary px-4 py-2 font-medium text-white transition hover:bg-blue-600 disabled:opacity-50"
  >
    {isSubmitting ? 'Adding...' : 'Add Transaction'}
  </button>
</form>
