<script lang="ts">
  import MonthPicker from '$lib/components/shared/MonthPicker.svelte';
  import BucketCard from '$lib/components/shared/BucketCard.svelte';
  import QuickEntry from '$lib/components/shared/QuickEntry.svelte';
  import Modal from '$lib/components/shared/Modal.svelte';
  import GoalCard from '$lib/components/shared/GoalCard.svelte';
  import { bucketStatuses, currentMonthIncome, currentMonthFixedIncome, currentMonthIncomes, unallocated, addIncome, updateIncome, deleteIncome, buckets } from '$lib/stores/budgetStore';
  import type { Income, IncomeType } from '$lib/types';
  import { goalStatuses, addGoal } from '$lib/stores/goalsStore';
  import { currentMonthKey, openModal, closeModal } from '$lib/stores/uiStore';
  import { formatCurrency, parseCurrency, isValidCurrency, isExpression, evaluateExpression } from '$lib/utils/currency';
  import { parseMonthKey } from '$lib/utils/dates';

  let selectedBucketId: string | undefined;
  let incomeAmount = '';
  let incomeNote = '';
  let incomeType: IncomeType = 'fixed';
  let incomeTouched = false;
  let editingIncomeId: string | null = null;

  let goalName = '';
  let goalBucketId = '';
  let goalTargetAmount = '';
  let goalStartingBalance = '';
  let goalMode: 'deadline' | 'monthly' = 'deadline';
  let goalTargetDate = '';
  let goalMonthlyContribution = '';
  let goalAmountTouched = false;
  let goalContribTouched = false;

  $: incomeError = incomeTouched && incomeAmount && !isValidCurrency(incomeAmount)
    ? 'Please enter a valid amount (e.g. 5000, 2500 + 500)'
    : '';
  $: incomeCanSubmit = !!incomeAmount && !incomeError && isValidCurrency(incomeAmount);
  $: incomePreview = isExpression(incomeAmount) && isValidCurrency(incomeAmount) ? evaluateExpression(incomeAmount) : null;

  $: goalTargetError = goalAmountTouched && goalTargetAmount && !isValidCurrency(goalTargetAmount)
    ? 'Please enter a valid amount'
    : '';
  $: goalBalanceError = goalStartingBalance && evaluateExpression(goalStartingBalance) === null
    ? 'Please enter a valid amount'
    : '';
  $: goalContribError = goalContribTouched && goalMonthlyContribution && !isValidCurrency(goalMonthlyContribution)
    ? 'Please enter a valid amount'
    : '';
  $: goalCanSubmit = !!goalName && !!goalBucketId && !!goalTargetAmount
    && !goalTargetError && isValidCurrency(goalTargetAmount)
    && !goalBalanceError
    && (goalMode !== 'monthly' || (!!goalMonthlyContribution && !goalContribError && isValidCurrency(goalMonthlyContribution)));

  async function handleAddGoal() {
    goalAmountTouched = true;
    goalContribTouched = true;
    if (!goalCanSubmit) return;
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
    goalAmountTouched = false; goalContribTouched = false;
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

  function resetIncomeForm() {
    incomeAmount = '';
    incomeNote = '';
    incomeType = 'fixed';
    incomeTouched = false;
    editingIncomeId = null;
  }

  function handleEditIncome(income: Income) {
    editingIncomeId = income.id;
    incomeAmount = (income.amount / 100).toFixed(2);
    incomeNote = income.note || '';
    incomeType = income.type || 'fixed';
    incomeTouched = false;
  }

  async function handleSubmitIncome() {
    incomeTouched = true;
    if (!incomeCanSubmit) return;
    if (editingIncomeId) {
      await updateIncome(editingIncomeId, {
        amount: parseCurrency(incomeAmount),
        note: incomeNote || undefined,
        type: incomeType,
      });
    } else {
      await addIncome({
        amount: parseCurrency(incomeAmount),
        date: parseMonthKey($currentMonthKey),
        note: incomeNote || undefined,
        isRecurring: false,
        type: incomeType,
      });
    }
    resetIncomeForm();
  }
</script>

<div class="space-y-6">
  <div class="flex items-center justify-between">
    <h1 class="page-title">Dashboard</h1>
    <MonthPicker />
  </div>

  <!-- Summary Cards -->
  <div class="grid gap-4 sm:grid-cols-3">
    <button class="card cursor-pointer p-5 text-left transition-all hover:border-primary/30 hover:shadow-sm" on:click={() => openModal('income')}>
      <div class="mb-1 flex items-center gap-2">
        <span class="flex h-6 w-6 items-center justify-center rounded-md bg-success/10 text-success">
          <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>
        </span>
        <p class="metric-label">Income</p>
      </div>
      <p class="metric-value">{formatCurrency($currentMonthIncome)}</p>
    </button>
    <div class="card p-5">
      <div class="mb-1 flex items-center gap-2">
        <span class="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 text-primary">
          <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
        </span>
        <p class="metric-label">Allocated</p>
      </div>
      <p class="metric-value">
        {formatCurrency($currentMonthIncome - $unallocated)}
      </p>
    </div>
    <div class="card p-5">
      <div class="mb-1 flex items-center gap-2">
        <span class="flex h-6 w-6 items-center justify-center rounded-md {$unallocated < 0 ? 'bg-danger/10 text-danger' : $unallocated > 0 ? 'bg-warning/10 text-warning' : 'bg-success/10 text-success'}">
          <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16"/></svg>
        </span>
        <p class="metric-label">Unallocated</p>
      </div>
      <p class="metric-value" class:text-danger={$unallocated < 0} class:text-warning={$unallocated > 0} class:text-success={$unallocated === 0}>
        {formatCurrency($unallocated)}
      </p>
    </div>
  </div>

  {#if $unallocated !== 0}
    <div class="flex items-center gap-3 rounded-xl border-l-4 p-4 {$unallocated > 0 ? 'border-warning bg-amber-50/50 dark:bg-amber-900/10' : 'border-danger bg-red-50/50 dark:bg-red-900/10'}">
      <p class="text-sm text-gray-700 dark:text-gray-200">
        {#if $unallocated > 0}
          You have <span class="font-semibold">{formatCurrency($unallocated)}</span> unallocated. Assign it to buckets!
        {:else}
          You're <span class="font-semibold">{formatCurrency(Math.abs($unallocated))}</span> over budget.
        {/if}
      </p>
    </div>
  {/if}

  <!-- Quick Add Button -->
  <button
    class="w-full rounded-xl border-2 border-dashed border-gray-200 py-3.5 text-sm font-medium text-muted transition-colors hover:border-primary hover:text-primary dark:border-border-dark dark:text-gray-400"
    on:click={() => openModal('quick-entry')}
  >
    + Add Transaction
  </button>

  <!-- Bucket Grid -->
  <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
    {#each $bucketStatuses as status}
      <BucketCard {status} fixedIncome={$currentMonthFixedIncome} onClick={() => handleBucketClick(status.bucket.id)} />
    {/each}
  </div>

  <!-- Goals Section -->
  <div class="mt-8">
    <div class="mb-4 flex items-center justify-between">
      <h2 class="section-title">Savings Goals</h2>
      {#if $goalStatuses.length > 0}
        <button
          class="text-sm font-medium text-primary hover:text-primary-hover transition-colors"
          on:click={() => openModal('add-goal')}
        >
          + Add Goal
        </button>
      {/if}
    </div>

    {#if $goalStatuses.length === 0}
      <button
        class="w-full rounded-xl border-2 border-dashed border-gray-200 py-10 text-sm font-medium text-muted transition-colors hover:border-primary hover:text-primary dark:border-border-dark dark:text-gray-400"
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
  <form on:submit|preventDefault={handleSubmitIncome} class="space-y-4">
    <div>
      <label class="label mb-1.5">Type</label>
      <div class="flex rounded-lg border border-gray-200 dark:border-border-dark p-0.5">
        <button
          type="button"
          class="flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors {incomeType === 'fixed' ? 'bg-primary text-white' : 'text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200'}"
          on:click={() => incomeType = 'fixed'}
        >Fixed</button>
        <button
          type="button"
          class="flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors {incomeType === 'one-time' ? 'bg-primary text-white' : 'text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200'}"
          on:click={() => incomeType = 'one-time'}
        >One-time</button>
      </div>
    </div>
    <div>
      <label class="label">Amount</label>
      <div class="relative mt-1.5">
        <span class="absolute left-3 top-1/2 -translate-y-1/2 text-muted">$</span>
        <input
          type="text"
          inputmode="decimal"
          bind:value={incomeAmount}
          on:input={() => incomeTouched = true}
          class="input-base pl-7 {incomeError ? '!border-danger focus:!border-danger focus:!ring-danger/20' : ''}"
          placeholder="0.00"
        />
      </div>
      {#if incomeError}
        <p class="mt-1 text-sm text-danger">{incomeError}</p>
      {:else if incomePreview !== null}
        <p class="mt-1 text-sm text-muted">= ${incomePreview.toFixed(2)}</p>
      {/if}
    </div>
    <div>
      <label class="label">Note (optional)</label>
      <input
        type="text"
        bind:value={incomeNote}
        class="mt-1.5 input-base"
      />
    </div>
    <div class="flex gap-2">
      {#if editingIncomeId}
        <button type="button" class="btn-secondary flex-1" on:click={resetIncomeForm}>Cancel</button>
      {/if}
      <button type="submit" disabled={!incomeCanSubmit} class="btn-primary flex-1">
        {editingIncomeId ? 'Save Changes' : 'Add Income'}
      </button>
    </div>
  </form>

  {#if $currentMonthIncomes.length > 0}
    <div class="mt-5 border-t border-gray-200 pt-5 dark:border-border-dark">
      <h3 class="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-200">This Month's Income</h3>
      <div class="space-y-2">
        {#each $currentMonthIncomes as income}
          <div class="flex items-center justify-between rounded-lg border border-gray-100 p-3 dark:border-border-dark">
            <div>
              <div class="flex items-center gap-2">
                <p class="font-semibold tabular-nums dark:text-gray-100">{formatCurrency(income.amount)}</p>
                <span class="rounded-full px-2 py-0.5 text-[10px] font-medium {income.type === 'fixed' ? 'bg-primary/10 text-primary' : 'bg-warning/10 text-warning'}">
                  {income.type === 'fixed' ? 'Fixed' : 'One-time'}
                </span>
              </div>
              {#if income.note}<p class="text-sm text-muted">{income.note}</p>{/if}
            </div>
            <div class="flex items-center gap-2">
              <button
                class="btn-icon !p-1.5"
                on:click={() => handleEditIncome(income)}
                aria-label="Edit income"
              >
                <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
              </button>
              <button
                class="btn-icon !p-1.5 hover:!bg-red-50 hover:!text-danger dark:hover:!bg-red-900/30"
                on:click={() => deleteIncome(income.id)}
                aria-label="Delete income"
              >
                <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
              </button>
            </div>
          </div>
        {/each}
      </div>
    </div>
  {/if}
</Modal>

<Modal id="add-goal" title="Add Savings Goal">
  <form on:submit|preventDefault={handleAddGoal} class="space-y-4">
    <div>
      <label class="label">Goal Name</label>
      <input
        type="text"
        bind:value={goalName}
        class="mt-1.5 input-base"
        placeholder="Emergency Fund"
      />
    </div>
    <div>
      <label class="label">Linked Bucket</label>
      <select bind:value={goalBucketId} class="mt-1.5 select-base">
        <option value="">Select a bucket</option>
        {#each $buckets as bucket}
          <option value={bucket.id}>{bucket.name}</option>
        {/each}
      </select>
    </div>
    <div>
      <label class="label">Target Amount</label>
      <div class="relative mt-1.5">
        <span class="absolute left-3 top-1/2 -translate-y-1/2 text-muted">$</span>
        <input
          type="text"
          inputmode="decimal"
          bind:value={goalTargetAmount}
          on:input={() => goalAmountTouched = true}
          class="input-base pl-7 {goalTargetError ? '!border-danger focus:!border-danger focus:!ring-danger/20' : ''}"
          placeholder="1000.00"
        />
      </div>
      {#if goalTargetError}
        <p class="mt-1 text-sm text-danger">{goalTargetError}</p>
      {/if}
    </div>
    <div>
      <label class="label">Starting Balance (optional)</label>
      <div class="relative mt-1.5">
        <span class="absolute left-3 top-1/2 -translate-y-1/2 text-muted">$</span>
        <input
          type="text"
          inputmode="decimal"
          bind:value={goalStartingBalance}
          class="input-base pl-7 {goalBalanceError ? '!border-danger focus:!border-danger focus:!ring-danger/20' : ''}"
          placeholder="0.00"
        />
      </div>
      {#if goalBalanceError}
        <p class="mt-1 text-sm text-danger">{goalBalanceError}</p>
      {/if}
    </div>
    <div>
      <label class="label mb-2">Goal Mode</label>
      <div class="flex gap-4">
        <label class="flex items-center gap-2 cursor-pointer">
          <input type="radio" bind:group={goalMode} value="deadline" class="accent-primary" />
          <span class="text-sm text-gray-700 dark:text-gray-200">Set deadline</span>
        </label>
        <label class="flex items-center gap-2 cursor-pointer">
          <input type="radio" bind:group={goalMode} value="monthly" class="accent-primary" />
          <span class="text-sm text-gray-700 dark:text-gray-200">Set monthly contribution</span>
        </label>
      </div>
    </div>
    {#if goalMode === 'deadline'}
      <div>
        <label class="label">Target Date</label>
        <input
          type="date"
          bind:value={goalTargetDate}
          class="mt-1.5 input-base"
        />
      </div>
    {:else}
      <div>
        <label class="label">Monthly Contribution</label>
        <div class="relative mt-1.5">
          <span class="absolute left-3 top-1/2 -translate-y-1/2 text-muted">$</span>
          <input
            type="text"
            inputmode="decimal"
            bind:value={goalMonthlyContribution}
            on:input={() => goalContribTouched = true}
            class="input-base pl-7 {goalContribError ? '!border-danger focus:!border-danger focus:!ring-danger/20' : ''}"
            placeholder="100.00"
          />
        </div>
        {#if goalContribError}
          <p class="mt-1 text-sm text-danger">{goalContribError}</p>
        {/if}
      </div>
    {/if}
    <button type="submit" disabled={!goalCanSubmit} class="w-full btn-primary">
      Create Goal
    </button>
  </form>
</Modal>
