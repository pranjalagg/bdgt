<script lang="ts">
  import MonthPicker from '$lib/components/shared/MonthPicker.svelte';
  import BucketCard from '$lib/components/shared/BucketCard.svelte';
  import QuickEntry from '$lib/components/shared/QuickEntry.svelte';
  import Modal from '$lib/components/shared/Modal.svelte';
  import GoalCard from '$lib/components/shared/GoalCard.svelte';
  import { bucketStatuses, currentMonthIncome, currentMonthIncomes, unallocated, addIncome, deleteIncome, buckets } from '$lib/stores/budgetStore';
  import { goalStatuses, addGoal } from '$lib/stores/goalsStore';
  import { openModal, closeModal } from '$lib/stores/uiStore';
  import { formatCurrency, parseCurrency } from '$lib/utils/currency';

  let selectedBucketId: string | undefined;
  let incomeAmount = '';
  let incomeNote = '';

  // Goal form state
  let goalName = '';
  let goalBucketId = '';
  let goalTargetAmount = '';
  let goalStartingBalance = '';
  let goalMode: 'deadline' | 'monthly' = 'deadline';
  let goalTargetDate = '';
  let goalMonthlyContribution = '';

  async function handleAddGoal() {
    if (!goalName || !goalBucketId || !goalTargetAmount) return;
    await addGoal({
      name: goalName,
      bucketId: goalBucketId,
      targetAmount: parseCurrency(goalTargetAmount),
      startingBalance: parseCurrency(goalStartingBalance),
      targetDate: goalMode === 'deadline' && goalTargetDate ? new Date(goalTargetDate) : undefined,
      monthlyContribution: goalMode === 'monthly' ? parseCurrency(goalMonthlyContribution) : undefined,
      createdAt: new Date(),
    });
    goalName = ''; goalBucketId = ''; goalTargetAmount = ''; goalStartingBalance = '';
    goalTargetDate = ''; goalMonthlyContribution = '';
    closeModal();
  }

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
    <h1 class="text-2xl font-bold text-gray-800 dark:text-gray-100">Dashboard</h1>
    <MonthPicker />
  </div>

  <!-- Summary Cards -->
  <div class="grid gap-4 sm:grid-cols-3">
    <button class="rounded-lg bg-white p-4 shadow cursor-pointer hover:shadow-md text-left dark:bg-surface-dark" on:click={() => openModal('income')}>
      <p class="text-sm text-gray-500 dark:text-gray-400">Income</p>
      <p class="text-xl font-bold text-gray-800 dark:text-gray-100">{formatCurrency($currentMonthIncome)}</p>
    </button>
    <div class="rounded-lg bg-white p-4 shadow dark:bg-surface-dark">
      <p class="text-sm text-gray-500 dark:text-gray-400">Allocated</p>
      <p class="text-xl font-bold text-gray-800 dark:text-gray-100">
        {formatCurrency($currentMonthIncome - $unallocated)}
      </p>
    </div>
    <div class="rounded-lg bg-white p-4 shadow dark:bg-surface-dark">
      <p class="text-sm text-gray-500 dark:text-gray-400">Unallocated</p>
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
    class="w-full rounded-lg border-2 border-dashed border-gray-300 py-3 text-gray-500 transition hover:border-primary hover:text-primary dark:border-border-dark dark:text-gray-400"
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

  <!-- Goals Section -->
  <div class="mt-8">
    <div class="flex items-center justify-between mb-4">
      <h2 class="text-xl font-bold text-gray-800 dark:text-gray-100">Savings Goals</h2>
      {#if $goalStatuses.length > 0}
        <button
          class="text-sm text-primary hover:underline"
          on:click={() => openModal('add-goal')}
        >
          + Add Goal
        </button>
      {/if}
    </div>

    {#if $goalStatuses.length === 0}
      <button
        class="w-full rounded-lg border-2 border-dashed border-gray-300 py-8 text-gray-500 transition hover:border-primary hover:text-primary dark:border-border-dark dark:text-gray-400"
        on:click={() => openModal('add-goal')}
      >
        Create Your First Savings Goal
      </button>
    {:else}
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {#each $goalStatuses as status}
          <GoalCard {status} />
        {/each}
      </div>
    {/if}
  </div>
</div>

<Modal id="quick-entry" title="Add Transaction">
  <QuickEntry preselectedBucketId={selectedBucketId} onComplete={handleEntryComplete} />
</Modal>

<Modal id="income" title="Manage Income">
  <form on:submit|preventDefault={handleAddIncome} class="space-y-4">
    <div>
      <label class="block text-sm font-medium text-gray-700 dark:text-gray-200">Amount</label>
      <input
        type="text"
        bind:value={incomeAmount}
        class="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 dark:border-border-dark dark:bg-gray-800 dark:text-gray-100"
        placeholder="0.00"
      />
    </div>
    <div>
      <label class="block text-sm font-medium text-gray-700 dark:text-gray-200">Note (optional)</label>
      <input
        type="text"
        bind:value={incomeNote}
        class="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 dark:border-border-dark dark:bg-gray-800 dark:text-gray-100"
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
    <div class="mt-4 border-t border-gray-200 pt-4 dark:border-border-dark">
      <h3 class="mb-2 font-medium text-gray-700 dark:text-gray-200">This Month's Income</h3>
      {#each $currentMonthIncomes as income}
        <div class="flex items-center justify-between py-2">
          <div>
            <p class="font-medium dark:text-gray-100">{formatCurrency(income.amount)}</p>
            {#if income.note}<p class="text-sm text-gray-500 dark:text-gray-400">{income.note}</p>{/if}
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

<Modal id="add-goal" title="Add Savings Goal">
  <form on:submit|preventDefault={handleAddGoal} class="space-y-4">
    <div>
      <label class="block text-sm font-medium text-gray-700 dark:text-gray-200">Goal Name</label>
      <input
        type="text"
        bind:value={goalName}
        class="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 dark:border-border-dark dark:bg-gray-800 dark:text-gray-100"
        placeholder="Emergency Fund"
      />
    </div>
    <div>
      <label class="block text-sm font-medium text-gray-700 dark:text-gray-200">Linked Bucket</label>
      <select
        bind:value={goalBucketId}
        class="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 dark:border-border-dark dark:bg-gray-800 dark:text-gray-100"
      >
        <option value="">Select a bucket</option>
        {#each $buckets as bucket}
          <option value={bucket.id}>{bucket.name}</option>
        {/each}
      </select>
    </div>
    <div>
      <label class="block text-sm font-medium text-gray-700 dark:text-gray-200">Target Amount</label>
      <input
        type="text"
        bind:value={goalTargetAmount}
        class="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 dark:border-border-dark dark:bg-gray-800 dark:text-gray-100"
        placeholder="1000.00"
      />
    </div>
    <div>
      <label class="block text-sm font-medium text-gray-700 dark:text-gray-200">Starting Balance (optional)</label>
      <input
        type="text"
        bind:value={goalStartingBalance}
        class="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 dark:border-border-dark dark:bg-gray-800 dark:text-gray-100"
        placeholder="0.00"
      />
    </div>
    <div>
      <label class="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">Goal Mode</label>
      <div class="flex gap-4">
        <label class="flex items-center gap-2 cursor-pointer">
          <input type="radio" bind:group={goalMode} value="deadline" class="text-primary" />
          <span class="text-sm text-gray-700 dark:text-gray-200">Set deadline</span>
        </label>
        <label class="flex items-center gap-2 cursor-pointer">
          <input type="radio" bind:group={goalMode} value="monthly" class="text-primary" />
          <span class="text-sm text-gray-700 dark:text-gray-200">Set monthly contribution</span>
        </label>
      </div>
    </div>
    {#if goalMode === 'deadline'}
      <div>
        <label class="block text-sm font-medium text-gray-700 dark:text-gray-200">Target Date</label>
        <input
          type="date"
          bind:value={goalTargetDate}
          class="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 dark:border-border-dark dark:bg-gray-800 dark:text-gray-100"
        />
      </div>
    {:else}
      <div>
        <label class="block text-sm font-medium text-gray-700 dark:text-gray-200">Monthly Contribution</label>
        <input
          type="text"
          bind:value={goalMonthlyContribution}
          class="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 dark:border-border-dark dark:bg-gray-800 dark:text-gray-100"
          placeholder="100.00"
        />
      </div>
    {/if}
    <button
      type="submit"
      class="w-full rounded-lg bg-primary px-4 py-2 text-white hover:bg-blue-600"
    >
      Create Goal
    </button>
  </form>
</Modal>
