<script lang="ts">
  import { buckets, bucketStatuses, addBucket, updateBucket, deleteBucket, setAllocation, updateBucketAllocation, totalPercentage, computedAllocations } from '$lib/stores/budgetStore';
  import { formatCurrency, evaluateExpression } from '$lib/utils/currency';
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

  async function handleAllocationChange(bucketId: string, value: string, inputEl: HTMLInputElement) {
    const parsed = evaluateExpression(value);
    if (parsed === null || !isFinite(parsed) || parsed < 0) {
      inputEl.classList.add('!border-danger');
      return;
    }
    inputEl.classList.remove('!border-danger');
    const cents = Math.round(parsed * 100);
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
    <h1 class="page-title">Buckets</h1>
    <div class="flex items-center gap-3">
      <MonthPicker />
      <button class="btn-primary" on:click={handleAddBucket}>
        + Add Bucket
      </button>
    </div>
  </div>

  {#if $totalPercentage > 100}
    <div class="flex items-center gap-3 rounded-xl border border-danger/30 bg-danger/5 p-4 text-sm text-danger">
      <svg class="h-5 w-5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      Total percentage allocation is {$totalPercentage}% (exceeds 100%)
    </div>
  {/if}

  <div class="space-y-2">
    {#each $bucketStatuses as status}
      <div class="card flex items-center gap-4 p-4 transition-colors hover:border-gray-300 dark:hover:border-gray-600">
        <span
          class="h-4 w-4 rounded-full ring-2 ring-white dark:ring-surface-dark"
          style="background-color: {status.bucket.color}"
        ></span>
        <div class="flex-1 min-w-0">
          <h3 class="font-semibold text-gray-800 dark:text-gray-100">{status.bucket.name}</h3>
          <p class="text-sm text-muted">
            {formatAllocationDisplay(status.bucket, $computedAllocations[status.bucket.id])}
          </p>
          {#if status.rollover !== 0}
            <p class="text-xs text-muted">Rollover: {formatCurrency(status.rollover)}</p>
          {/if}
        </div>
        {#if status.bucket.allocationType === 'fixed'}
          <div class="flex items-center gap-2">
            <span class="text-muted">$</span>
            <input
              type="text"
              value={(status.allocated / 100).toFixed(2)}
              on:change={(e) => handleAllocationChange(status.bucket.id, e.currentTarget.value, e.currentTarget)}
              class="w-24 rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-right text-sm transition-shadow focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 dark:border-border-dark dark:bg-gray-800/50 dark:text-gray-100"
              placeholder="0.00"
            />
          </div>
        {:else}
          <div class="text-right tabular-nums text-muted">
            {formatCurrency(status.allocated)}
          </div>
        {/if}
        <div class="flex gap-1">
          <button
            class="btn-icon !p-1.5"
            on:click={() => handleEditBucket(status.bucket)}
            aria-label="Edit bucket"
          >
            <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
          </button>
          {#if !status.bucket.isDefault}
            <button
              class="btn-icon !p-1.5 hover:!bg-red-50 hover:!text-danger dark:hover:!bg-red-900/30"
              on:click={() => handleDelete(status.bucket.id)}
              aria-label="Delete bucket"
            >
              <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
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
      <label for="name" class="label">Name</label>
      <input id="name" type="text" bind:value={newBucketName} class="mt-1.5 input-base" required />
    </div>
    <div>
      <label for="color" class="label">Color</label>
      <input id="color" type="color" bind:value={newBucketColor} class="mt-1.5 h-10 w-full cursor-pointer rounded-lg border border-gray-300 dark:border-border-dark" />
    </div>

    <div>
      <label class="label mb-2">Allocation Type</label>
      <div class="flex gap-4">
        <label class="flex items-center gap-2 cursor-pointer">
          <input type="radio" bind:group={newAllocationType} value="fixed" class="accent-primary" />
          <span class="text-sm text-gray-700 dark:text-gray-200">Fixed</span>
        </label>
        <label class="flex items-center gap-2 cursor-pointer">
          <input type="radio" bind:group={newAllocationType} value="percentage" class="accent-primary" />
          <span class="text-sm text-gray-700 dark:text-gray-200">Percentage</span>
        </label>
        <label class="flex items-center gap-2 cursor-pointer">
          <input type="radio" bind:group={newAllocationType} value="hybrid" class="accent-primary" />
          <span class="text-sm text-gray-700 dark:text-gray-200">Hybrid</span>
        </label>
      </div>
    </div>

    {#if newAllocationType === 'fixed' || newAllocationType === 'hybrid'}
      <div>
        <label for="fixedAmount" class="label">Fixed Amount ($)</label>
        <input
          id="fixedAmount"
          type="number"
          step="0.01"
          min="0"
          value={(newFixedAmount / 100).toFixed(2)}
          on:change={(e) => newFixedAmount = Math.round(parseFloat(e.currentTarget.value || '0') * 100)}
          class="mt-1.5 input-base"
        />
      </div>
    {/if}

    {#if newAllocationType === 'percentage' || newAllocationType === 'hybrid'}
      <div>
        <label for="percentageAmount" class="label">Percentage (%)</label>
        <input
          id="percentageAmount"
          type="number"
          step="0.1"
          min="0"
          max="100"
          bind:value={newPercentageAmount}
          class="mt-1.5 input-base"
        />
      </div>
    {/if}

    <button type="submit" class="w-full btn-primary">
      {editingBucket ? 'Update' : 'Add'} Bucket
    </button>
  </form>
</Modal>
