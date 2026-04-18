<script lang="ts">
  import MonthPicker from '$lib/components/shared/MonthPicker.svelte';
  import BucketCard from '$lib/components/shared/BucketCard.svelte';
  import QuickEntry from '$lib/components/shared/QuickEntry.svelte';
  import Modal from '$lib/components/shared/Modal.svelte';
  import { bucketStatuses, currentMonthIncome, currentMonthIncomes, unallocated, addIncome, deleteIncome } from '$lib/stores/budgetStore';
  import { openModal, closeModal } from '$lib/stores/uiStore';
  import { formatCurrency, parseCurrency } from '$lib/utils/currency';

  let selectedBucketId: string | undefined;
  let incomeAmount = '';
  let incomeNote = '';

  function handleBucketClick(bucketId: string) {
    selectedBucketId = bucketId;
    openModal('quick-entry');
  }

  function handleEntryComplete() {
    closeModal();
    selectedBucketId = undefined;
  }

  async function handleAddIncome() {
    if (!incomeAmount) return;
    await addIncome({
      amount: parseCurrency(incomeAmount),
      date: new Date(),
      note: incomeNote || undefined,
      isRecurring: false,
    });
    incomeAmount = '';
    incomeNote = '';
    closeModal();
  }
</script>

<div class="space-y-6">
  <div class="flex items-center justify-between">
    <h1 class="text-2xl font-bold text-gray-800">Dashboard</h1>
    <MonthPicker />
  </div>

  <!-- Summary Cards -->
  <div class="grid gap-4 sm:grid-cols-3">
    <button class="rounded-lg bg-white p-4 shadow cursor-pointer hover:shadow-md text-left" on:click={() => openModal('income')}>
      <p class="text-sm text-gray-500">Income</p>
      <p class="text-xl font-bold text-gray-800">{formatCurrency($currentMonthIncome)}</p>
    </button>
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

<Modal id="income" title="Manage Income">
  <form on:submit|preventDefault={handleAddIncome} class="space-y-4">
    <div>
      <label class="block text-sm font-medium text-gray-700">Amount</label>
      <input
        type="text"
        bind:value={incomeAmount}
        class="mt-1 w-full rounded-lg border px-3 py-2"
        placeholder="0.00"
      />
    </div>
    <div>
      <label class="block text-sm font-medium text-gray-700">Note (optional)</label>
      <input
        type="text"
        bind:value={incomeNote}
        class="mt-1 w-full rounded-lg border px-3 py-2"
      />
    </div>
    <button
      type="submit"
      class="w-full rounded-lg bg-primary px-4 py-2 text-white hover:bg-blue-600"
    >
      Add Income
    </button>
  </form>

  {#if $currentMonthIncomes.length > 0}
    <div class="mt-4 border-t pt-4">
      <h3 class="mb-2 font-medium text-gray-700">This Month's Income</h3>
      {#each $currentMonthIncomes as income}
        <div class="flex items-center justify-between py-2">
          <div>
            <p class="font-medium">{formatCurrency(income.amount)}</p>
            {#if income.note}<p class="text-sm text-gray-500">{income.note}</p>{/if}
          </div>
          <button
            class="text-danger hover:underline"
            on:click={() => deleteIncome(income.id)}
          >
            Delete
          </button>
        </div>
      {/each}
    </div>
  {/if}
</Modal>
