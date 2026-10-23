<script lang="ts">
  import { buckets, bucketStatuses, addBucket, updateBucket, deleteBucket, setAllocation, updateBucketAllocation, totalPercentage, computedAllocations } from '$lib/stores/budgetStore';
  import { loadRecurring } from '$lib/stores/recurringStore';
  import { loadGoals } from '$lib/stores/goalsStore';
  import { formatCurrency, evaluateExpression, currencySymbol } from '$lib/utils/currency';
  import MonthPicker from '$lib/components/shared/MonthPicker.svelte';
  import Modal from '$lib/components/shared/Modal.svelte';
  import SectionTabs from '$lib/components/shared/SectionTabs.svelte';
  import { openModal, closeModal } from '$lib/stores/uiStore';
  import type { AllocationType } from '$lib/types';

  type BucketFormData = { id: string; name: string; color: string; allocationType: AllocationType; fixedAmount: number; percentageAmount: number; isSavings: boolean; isEveryday: boolean; isDefault?: boolean };

  let editingBucket: BucketFormData | null = null;
  let newBucketName = '';
  let newBucketColor = '#6366f1';
  let newAllocationType: AllocationType = 'fixed';
  let newFixedAmount = 0;
  let newPercentageAmount = 0;
  let newIsSavings = false;
  let newIsEveryday = true;
  let formError = '';

  function handleAddBucket() {
    editingBucket = null;
    newBucketName = '';
    newBucketColor = '#6366f1';
    newAllocationType = 'fixed';
    newFixedAmount = 0;
    newPercentageAmount = 0;
    newIsSavings = false;
    newIsEveryday = true;
    formError = '';
    openModal('bucket-form');
  }

  function handleEditBucket(bucket: BucketFormData) {
    editingBucket = bucket;
    newBucketName = bucket.name;
    newBucketColor = bucket.color;
    newAllocationType = bucket.allocationType;
    newFixedAmount = bucket.fixedAmount;
    newPercentageAmount = bucket.percentageAmount;
    newIsSavings = bucket.isSavings ?? false;
    newIsEveryday = bucket.isEveryday ?? true;
    formError = '';
    openModal('bucket-form');
  }

  async function handleSubmit() {
    if (!newBucketName.trim()) return;
    formError = '';

    try {
      if (editingBucket) {
        await updateBucket(editingBucket.id, {
          name: newBucketName,
          color: newBucketColor,
          isSavings: newIsSavings,
          isEveryday: newIsEveryday,
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
          isSavings: newIsSavings,
          isEveryday: newIsEveryday,
          createdAt: new Date(),
        });
      }
      closeModal();
    } catch (e) {
      formError = e instanceof Error ? e.message : 'Failed to save bucket';
    }
  }

  async function handleDelete(id: string) {
    const status = $bucketStatuses.find((s) => s.bucket.id === id);
    if (!confirm(
      `Delete "${status?.bucket.name ?? 'this bucket'}"? Its transactions are kept and moved to "Unsorted" so you can re-file them. Its recurring items and linked savings goals are deleted. This cannot be undone.`
    )) return;
    await deleteBucket(id);
    await loadRecurring();
    await loadGoals();
    closeModal();
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

  // For a fixed bucket this must describe the *viewed month's* assignment,
  // not the bucket's standing default — assigning from the dashboard writes
  // a per-month override, and showing the default here contradicted the
  // input sitting right next to it.
  function formatAllocationDisplay(
    bucket: { allocationType: AllocationType; fixedAmount: number; percentageAmount: number },
    computedAmount: number,
    assignedThisMonth: number
  ): string {
    switch (bucket.allocationType) {
      case 'percentage':
        return `${bucket.percentageAmount}% of income · ${formatCurrency(computedAmount)}`;
      case 'hybrid':
        return `${formatCurrency(bucket.fixedAmount)} + ${bucket.percentageAmount}% · ${formatCurrency(computedAmount)}`;
      case 'fixed':
      default:
        return assignedThisMonth === bucket.fixedAmount
          ? `Assigned this month`
          : `Assigned this month · standing amount ${formatCurrency(bucket.fixedAmount)}`;
    }
  }
</script>

<div class="space-y-6">
  <SectionTabs tabs={[{ href: '/buckets', label: 'Buckets' }, { href: '/recurring', label: 'Recurring' }, { href: '/settings', label: 'Settings' }]} />

  <div class="space-y-3">
    <div class="flex items-center justify-between gap-3">
      <h1 class="page-title">Buckets</h1>
      <button class="btn-secondary !pl-4" on:click={handleAddBucket}>
        <svg class="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
        Add bucket
      </button>
    </div>
    <MonthPicker />
  </div>

  {#if $totalPercentage > 100}
    <div class="flex items-center gap-3 rounded-xl border border-danger/30 bg-danger/5 p-4 text-sm text-danger dark:text-danger-light">
      <svg class="h-5 w-5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      Total percentage allocation is {$totalPercentage}% (exceeds 100%)
    </div>
  {/if}

  <!-- One grouped list, as a settings screen draws it. Delete lives in the
       bucket's sheet. -->
  <div class="card overflow-hidden">
    {#each $bucketStatuses.filter((s) => !s.bucket.isSystem) as status, i (status.bucket.id)}
      <div class="relative flex items-center gap-3 py-3 pl-4 pr-2">
        {#if i > 0}
          <span class="pointer-events-none absolute left-11 right-0 top-0 h-px bg-border dark:bg-border-dark" aria-hidden="true"></span>
        {/if}
        <span class="h-3 w-3 flex-none rounded-full" style="background-color: {status.bucket.color}" aria-hidden="true"></span>
        <div class="min-w-0 flex-1">
          <h2 class="truncate text-[15px] font-semibold text-gray-950 dark:text-gray-50">{status.bucket.name}</h2>
          <p class="amt text-[13px] leading-snug text-muted dark:text-muted-dark">
            {formatAllocationDisplay(status.bucket, $computedAllocations[status.bucket.id], status.allocated)}
          </p>
          {#if status.rollover !== 0}
            <p class="text-[13px] leading-snug text-muted dark:text-muted-dark">Rollover <span class="money amt">{formatCurrency(status.rollover)}</span></p>
          {/if}
        </div>
        {#if status.bucket.allocationType === 'fixed'}
          <label class="relative flex-none">
            <span class="sr-only">Assigned to {status.bucket.name} this month</span>
            <span class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted dark:text-muted-dark" aria-hidden="true">{currencySymbol()}</span>
            <input
              type="text"
              value={(status.allocated / 100).toFixed(2)}
              on:change={(e) => handleAllocationChange(status.bucket.id, e.currentTarget.value, e.currentTarget)}
              class="input-base money !w-[7.5rem] !py-2 pl-7 text-right"
              placeholder="0.00"
            />
          </label>
        {:else}
          <span class="money amt flex-none text-[15px] text-gray-700 dark:text-gray-200">
            {formatCurrency(status.allocated)}
          </span>
        {/if}
        <button class="btn-icon flex-none" on:click={() => handleEditBucket(status.bucket)} aria-label="Edit {status.bucket.name}">
          <svg class="h-[18px] w-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
        </button>
      </div>
    {/each}
  </div>
</div>

<Modal id="bucket-form" title={editingBucket ? 'Edit Bucket' : 'Add Bucket'}>
  <form on:submit|preventDefault={handleSubmit} class="space-y-4">
    {#if formError}
      <p class="text-sm text-danger">{formError}</p>
    {/if}
    <div>
      <label for="name" class="label">Name</label>
      <input id="name" type="text" bind:value={newBucketName} class="mt-1.5 input-base" required />
    </div>
    <div>
      <label for="color" class="label">Color</label>
      <input id="color" type="color" bind:value={newBucketColor} class="mt-1.5 h-11 w-full cursor-pointer rounded-[14px] border border-[#8f938f] bg-white px-1.5 dark:border-white/[0.36] dark:bg-white/[0.04]" />
    </div>

    <div>
      <span class="label mb-2 block">Allocation Type</span>
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

    <label class="flex items-start gap-2.5 cursor-pointer">
      <input type="checkbox" bind:checked={newIsSavings} class="mt-0.5 accent-primary" />
      <span class="text-sm text-gray-700 dark:text-gray-200">
        Counts as savings
        <span class="block text-xs text-muted">Money moved here is treated as saved, not spent, in your savings rate.</span>
      </span>
    </label>

    <label class="flex items-start gap-2.5 cursor-pointer">
      <input type="checkbox" bind:checked={newIsEveryday} class="mt-0.5 accent-primary" />
      <span class="text-sm text-gray-700 dark:text-gray-200">
        Everyday spending
        <span class="block text-xs text-muted">Included in "safe to spend today". Turn off for a fixed obligation like rent that's already spoken for.</span>
      </span>
    </label>

    <button type="submit" class="w-full btn-primary">
      {editingBucket ? 'Update' : 'Add'} Bucket
    </button>
    {#if editingBucket && !editingBucket.isDefault}
      <button type="button" class="btn-danger w-full" on:click={() => editingBucket && handleDelete(editingBucket.id)}>Delete bucket</button>
    {/if}
  </form>
</Modal>
