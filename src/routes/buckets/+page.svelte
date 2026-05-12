<script lang="ts">
  import { buckets, bucketStatuses, addBucket, updateBucket, deleteBucket, setAllocation, updateBucketAllocation, totalPercentage, computedAllocations } from '$lib/stores/budgetStore';
  import { formatCurrency, parseCurrency } from '$lib/utils/currency';
  import MonthPicker from '$lib/components/shared/MonthPicker.svelte';
  import Modal from '$lib/components/shared/Modal.svelte';
  import { openModal, closeModal } from '$lib/stores/uiStore';
  import type { AllocationType } from '$lib/types';

  let editingBucket: { id: string; name: string; color: string; allocationType: AllocationType; fixedAmount: number; percentageAmount: number } | null = null;
  let newBucketName = '';
  let newBucketColor = '#6366f1';
  let newAllocationType: AllocationType = 'fixed';
  let newFixedAmount = 0;
  let newPercentageAmount = 0;

  function handleAddBucket() {
    editingBucket = null;
    newBucketName = '';
    newBucketColor = '#6366f1';
    newAllocationType = 'fixed';
    newFixedAmount = 0;
    newPercentageAmount = 0;
    openModal('bucket-form');
  }

  function handleEditBucket(bucket: { id: string; name: string; color: string; allocationType: AllocationType; fixedAmount: number; percentageAmount: number }) {
    editingBucket = bucket;
    newBucketName = bucket.name;
    newBucketColor = bucket.color;
    newAllocationType = bucket.allocationType;
    newFixedAmount = bucket.fixedAmount;
    newPercentageAmount = bucket.percentageAmount;
    openModal('bucket-form');
  }

  async function handleSubmit() {
    if (!newBucketName.trim()) return;

    if (editingBucket) {
      await updateBucket(editingBucket.id, {
        name: newBucketName,
        color: newBucketColor,
      });
      await updateBucketAllocation(editingBucket.id, newAllocationType, newFixedAmount, newPercentageAmount);
    } else {
      await addBucket({
        name: newBucketName,
        color: newBucketColor,
        order: $buckets.length,
        isDefault: false,
        allocationType: newAllocationType,
        fixedAmount: newFixedAmount,
        percentageAmount: newPercentageAmount,
      });
    }
    closeModal();
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this bucket? Transactions will need to be reassigned.')) return;
    await deleteBucket(id);
  }

  async function handleAllocationChange(bucketId: string, value: string) {
    const cents = parseCurrency(value);
    await setAllocation(bucketId, cents);
  }

  function formatAllocationDisplay(bucket: { allocationType: AllocationType; fixedAmount: number; percentageAmount: number }, computedAmount: number): string {
    switch (bucket.allocationType) {
      case 'fixed':
        return formatCurrency(bucket.fixedAmount);
      case 'percentage':
        return `${bucket.percentageAmount}% (${formatCurrency(computedAmount)})`;
      case 'hybrid':
        return `${formatCurrency(bucket.fixedAmount)} + ${bucket.percentageAmount}% (${formatCurrency(computedAmount)})`;
      default:
        return formatCurrency(bucket.fixedAmount);
    }
  }
</script>

<div class="space-y-6">
  <div class="flex items-center justify-between">
    <h1 class="text-2xl font-bold text-gray-800 dark:text-gray-100">Buckets</h1>
    <div class="flex items-center gap-3">
      <MonthPicker />
      <button
        class="rounded-lg bg-primary px-4 py-2 text-white hover:bg-blue-600"
        on:click={handleAddBucket}
      >
        + Add Bucket
      </button>
    </div>
  </div>

  {#if $totalPercentage > 100}
    <div class="rounded-lg bg-danger/10 border border-danger p-3 text-danger">
      Warning: Total percentage allocation is {$totalPercentage}% (exceeds 100%)
    </div>
  {/if}

  <div class="space-y-3">
    {#each $bucketStatuses as status}
      <div class="flex items-center gap-4 rounded-lg bg-white p-4 shadow dark:bg-surface-dark">
        <span
          class="h-4 w-4 rounded-full"
          style="background-color: {status.bucket.color}"
        />
        <div class="flex-1">
          <h3 class="font-medium text-gray-800 dark:text-gray-100">{status.bucket.name}</h3>
          <p class="text-sm text-gray-500 dark:text-gray-400">
            {formatAllocationDisplay(status.bucket, $computedAllocations[status.bucket.id])}
          </p>
          {#if status.rollover !== 0}
            <p class="text-xs text-gray-400 dark:text-gray-500">Rollover: {formatCurrency(status.rollover)}</p>
          {/if}
        </div>
        {#if status.bucket.allocationType === 'fixed'}
          <div class="flex items-center gap-2">
            <span class="text-gray-500 dark:text-gray-400">$</span>
            <input
              type="text"
              value={(status.allocated / 100).toFixed(2)}
              on:change={(e) => handleAllocationChange(status.bucket.id, e.currentTarget.value)}
              class="w-24 rounded border border-gray-300 bg-white px-2 py-1 text-right dark:border-border-dark dark:bg-gray-800 dark:text-gray-100"
              placeholder="0.00"
            />
          </div>
        {:else}
          <div class="text-right text-gray-600 dark:text-gray-300">
            {formatCurrency(status.allocated)}
          </div>
        {/if}
        <div class="flex gap-1">
          <button
            class="rounded p-2 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
            on:click={() => handleEditBucket(status.bucket)}
          >
            Edit
          </button>
          {#if !status.bucket.isDefault}
            <button
              class="rounded p-2 text-danger hover:bg-red-50 dark:hover:bg-red-900/30"
              on:click={() => handleDelete(status.bucket.id)}
            >
              Delete
            </button>
          {/if}
        </div>
      </div>
    {/each}
  </div>
</div>

<Modal id="bucket-form" title={editingBucket ? 'Edit Bucket' : 'Add Bucket'}>
  <form on:submit|preventDefault={handleSubmit} class="space-y-4">
    <div>
      <label for="name" class="block text-sm font-medium text-gray-700 dark:text-gray-200">Name</label>
      <input id="name" type="text" bind:value={newBucketName} class="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 dark:border-border-dark dark:bg-gray-800 dark:text-gray-100" required />
    </div>
    <div>
      <label for="color" class="block text-sm font-medium text-gray-700 dark:text-gray-200">Color</label>
      <input id="color" type="color" bind:value={newBucketColor} class="mt-1 h-10 w-full rounded-lg border border-gray-300 dark:border-border-dark" />
    </div>

    <div>
      <label class="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">Allocation Type</label>
      <div class="flex gap-4">
        <label class="flex items-center gap-2">
          <input type="radio" bind:group={newAllocationType} value="fixed" class="text-primary" />
          <span class="text-gray-700 dark:text-gray-200">Fixed</span>
        </label>
        <label class="flex items-center gap-2">
          <input type="radio" bind:group={newAllocationType} value="percentage" class="text-primary" />
          <span class="text-gray-700 dark:text-gray-200">Percentage</span>
        </label>
        <label class="flex items-center gap-2">
          <input type="radio" bind:group={newAllocationType} value="hybrid" class="text-primary" />
          <span class="text-gray-700 dark:text-gray-200">Hybrid</span>
        </label>
      </div>
    </div>

    {#if newAllocationType === 'fixed' || newAllocationType === 'hybrid'}
      <div>
        <label for="fixedAmount" class="block text-sm font-medium text-gray-700 dark:text-gray-200">Fixed Amount ($)</label>
        <input
          id="fixedAmount"
          type="number"
          step="0.01"
          min="0"
          value={(newFixedAmount / 100).toFixed(2)}
          on:change={(e) => newFixedAmount = Math.round(parseFloat(e.currentTarget.value || '0') * 100)}
          class="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 dark:border-border-dark dark:bg-gray-800 dark:text-gray-100"
        />
      </div>
    {/if}

    {#if newAllocationType === 'percentage' || newAllocationType === 'hybrid'}
      <div>
        <label for="percentageAmount" class="block text-sm font-medium text-gray-700 dark:text-gray-200">Percentage (%)</label>
        <input
          id="percentageAmount"
          type="number"
          step="0.1"
          min="0"
          max="100"
          bind:value={newPercentageAmount}
          class="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 dark:border-border-dark dark:bg-gray-800 dark:text-gray-100"
        />
      </div>
    {/if}

    <button type="submit" class="w-full rounded-lg bg-primary px-4 py-2 text-white hover:bg-blue-600">
      {editingBucket ? 'Update' : 'Add'} Bucket
    </button>
  </form>
</Modal>
