<script lang="ts">
  import MonthPicker from '$lib/components/shared/MonthPicker.svelte';
  import BucketCard from '$lib/components/shared/BucketCard.svelte';
  import QuickEntry from '$lib/components/shared/QuickEntry.svelte';
  import Modal from '$lib/components/shared/Modal.svelte';
  import { bucketStatuses, currentMonthIncome, unallocated } from '$lib/stores/budgetStore';
  import { openModal, closeModal } from '$lib/stores/uiStore';
  import { formatCurrency } from '$lib/utils/currency';

  let selectedBucketId: string | undefined;

  function handleBucketClick(bucketId: string) {
    selectedBucketId = bucketId;
    openModal('quick-entry');
  }

  function handleEntryComplete() {
    closeModal();
    selectedBucketId = undefined;
  }
</script>

<div class="space-y-6">
  <div class="flex items-center justify-between">
    <h1 class="text-2xl font-bold text-gray-800">Dashboard</h1>
    <MonthPicker />
  </div>

  <!-- Summary Cards -->
  <div class="grid gap-4 sm:grid-cols-3">
    <div class="rounded-lg bg-white p-4 shadow">
      <p class="text-sm text-gray-500">Income</p>
      <p class="text-xl font-bold text-gray-800">{formatCurrency($currentMonthIncome)}</p>
    </div>
    <div class="rounded-lg bg-white p-4 shadow">
      <p class="text-sm text-gray-500">Allocated</p>
      <p class="text-xl font-bold text-gray-800">
        {formatCurrency($currentMonthIncome - $unallocated)}
      </p>
    </div>
    <div class="rounded-lg bg-white p-4 shadow">
      <p class="text-sm text-gray-500">Unallocated</p>
      <p class="text-xl font-bold" class:text-danger={$unallocated < 0} class:text-warning={$unallocated > 0} class:text-success={$unallocated === 0}>
        {formatCurrency($unallocated)}
      </p>
    </div>
  </div>

  {#if $unallocated !== 0}
    <div class="rounded-lg border-l-4 p-4" class:border-warning={$unallocated > 0} class:bg-amber-50={$unallocated > 0} class:border-danger={$unallocated < 0} class:bg-red-50={$unallocated < 0}>
      <p class="text-sm">
        {#if $unallocated > 0}
          You have {formatCurrency($unallocated)} unallocated. Assign it to buckets!
        {:else}
          You're {formatCurrency(Math.abs($unallocated))} over budget.
        {/if}
      </p>
    </div>
  {/if}

  <!-- Quick Add Button -->
  <button
    class="w-full rounded-lg border-2 border-dashed border-gray-300 py-3 text-gray-500 transition hover:border-primary hover:text-primary"
    on:click={() => openModal('quick-entry')}
  >
    + Add Transaction
  </button>

  <!-- Bucket Grid -->
  <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
    {#each $bucketStatuses as status}
      <BucketCard {status} onClick={() => handleBucketClick(status.bucket.id)} />
    {/each}
  </div>
</div>

<Modal id="quick-entry" title="Add Transaction">
  <QuickEntry preselectedBucketId={selectedBucketId} onComplete={handleEntryComplete} />
</Modal>
