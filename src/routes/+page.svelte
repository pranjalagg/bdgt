<script lang="ts">
  import MonthPicker from '$lib/components/shared/MonthPicker.svelte';
  import EnvelopeLine from '$lib/components/shared/EnvelopeLine.svelte';
  import EnvelopeRow from '$lib/components/shared/EnvelopeRow.svelte';
  import AssignPanel from '$lib/components/shared/AssignPanel.svelte';
  import Modal from '$lib/components/shared/Modal.svelte';
  import GoalCard from '$lib/components/shared/GoalCard.svelte';
  import { savingsRateTrend, bucketStatuses, currentMonthIncome, currentMonthFixedIncome, currentMonthIncomes, unallocated, addIncome, updateIncome, deleteIncome, buckets, savingsRate, safeToSpendPerDay } from '$lib/stores/budgetStore';
  import type { Income, IncomeType } from '$lib/types';
  import { goalStatuses, addGoal } from '$lib/stores/goalsStore';
  import { currentMonthKey, openModal, closeModal, openLog } from '$lib/stores/uiStore';
  import { formatCurrency, parseCurrency, isValidCurrency, isExpression, evaluateExpression } from '$lib/utils/currency';
  import { parseMonthKey, getDaysInMonth, formatMonthYear } from '$lib/utils/dates';
  import { savingsRateDelta } from '$lib/utils/calculations';

  $: daysLeftInMonth = getDaysInMonth($currentMonthKey) - new Date().getDate() + 1;

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

  // Trend is the last 6 months ending at the viewed month, so the one
  // before the last entry is the previous month.
  $: prevSavingsRate = $savingsRateTrend.length >= 2 ? $savingsRateTrend[$savingsRateTrend.length - 2] : null;
  $: prevMonthName = prevSavingsRate ? formatMonthYear(prevSavingsRate.month).split(' ')[0] : '';
  $: prevMonthShort = prevMonthName.slice(0, 3);
  $: savingsDelta = prevSavingsRate ? savingsRateDelta($savingsRate, prevSavingsRate.rate) : null;

  $: savingsRateColor = $savingsRate === null ? 'text-muted dark:text-muted-dark'
    : $savingsRate >= 20 ? 'text-success dark:text-success-light'
    : $savingsRate >= 10 ? 'text-warning'
    : 'text-danger dark:text-danger-light';

  // Money moved into a savings bucket isn't spending — same rule the
  // savings rate and the Analytics page already use.
  $: totalSpent = $bucketStatuses.reduce(
    (sum, s) => (s.bucket.isSavings ? sum : sum + Math.max(s.spent, 0)),
    0
  );

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
  <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
    <h1 class="page-title">Dashboard</h1>
    <MonthPicker />
  </div>

  {#if $safeToSpendPerDay !== null}
    <!-- The number this app exists to answer: what's actually free to
         spend today, once fixed obligations and savings are set aside. -->
    <div class="card p-5">
      <p class="eyebrow">Safe to spend</p>
      <p class="mt-1 flex items-baseline gap-1.5">
        <span
          class="money text-[34px] font-medium leading-none tracking-tight
                 {$safeToSpendPerDay < 0 ? 'text-danger dark:text-danger-light' : 'text-gray-900 dark:text-gray-50'}"
        >
          {formatCurrency($safeToSpendPerDay)}
        </span>
        <span class="text-sm text-muted dark:text-muted-dark">/day</span>
      </p>
      <p class="mt-1 text-[12.5px] text-muted dark:text-muted-dark">
        across everyday envelopes, {daysLeftInMonth} day{daysLeftInMonth === 1 ? '' : 's'} left
      </p>
    </div>
  {/if}

  <!-- The thesis: one line, the whole month. -->
  <EnvelopeLine
    statuses={$bucketStatuses}
    income={$currentMonthIncome}
    unallocated={$unallocated}
    onAssign={() => openModal('assign')}
  />

  {#if $currentMonthIncome === 0}
    <!-- First run reads as an invitation, not eleven negative balances. -->
    <div class="card flex flex-col items-start gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
      <p class="text-sm text-gray-700 dark:text-gray-200">
        Add this month's income and every bucket has something to hold.
      </p>
      <button class="btn-primary flex-none" on:click={() => openModal('income')}>Add income</button>
    </div>
  {/if}

  <!-- Supporting figures, subordinate to the line above. -->
  <div class="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border dark:border-border-dark dark:bg-border-dark sm:grid-cols-3">
    <button
      class="flex flex-col items-start bg-white p-4 text-left transition-colors hover:bg-background focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary dark:bg-surface-dark dark:hover:bg-white/[0.03]"
      on:click={() => openModal('income')}
    >
      <p class="metric-label">Income</p>
      <p class="metric-value mt-1 text-xl">{formatCurrency($currentMonthIncome)}</p>
      {#if $currentMonthFixedIncome > 0 && $currentMonthFixedIncome !== $currentMonthIncome}
        <p class="mt-1 text-[11.5px] text-muted dark:text-muted-dark">
          <span class="money">{formatCurrency($currentMonthFixedIncome)}</span> fixed ·
          <span class="money">{formatCurrency($currentMonthIncome - $currentMonthFixedIncome)}</span> variable
        </p>
      {/if}
    </button>
    <div class="bg-white p-4 dark:bg-surface-dark">
      <p class="metric-label">Spent</p>
      <p class="metric-value mt-1 text-xl">{formatCurrency(totalSpent)}</p>
      <p class="mt-1 text-[11.5px] text-muted dark:text-muted-dark">excludes money set aside</p>
    </div>
    <div class="col-span-2 flex bg-white dark:bg-surface-dark sm:col-span-1">
      <div class="min-w-0 flex-1 p-4">
        <p class="metric-label">Savings rate</p>
        <p class="metric-value mt-1 text-xl {savingsRateColor}">
          {$savingsRate !== null ? `${$savingsRate}%` : '—'}
        </p>
        <p class="mt-1 text-[11.5px] text-muted dark:text-muted-dark">
          {$savingsRate !== null ? 'of income kept' : 'add income to see this'}
        </p>
      </div>
      {#if savingsDelta !== null}
        <!-- Its own cell, same three-row rhythm: the comparison is a
             separate figure, not a modifier of the caption beside it. -->
        <div
          class="flex-none border-l border-border p-4 dark:border-border-dark"
          aria-label={savingsDelta === 0
            ? `Unchanged from ${prevMonthName}`
            : `${savingsDelta > 0 ? 'Up' : 'Down'} ${Math.abs(savingsDelta)} points from ${prevMonthName}`}
        >
          <p class="metric-label">vs {prevMonthShort}</p>
          <p
            class="metric-value mt-1 flex items-center gap-1 text-xl
                   {savingsDelta > 0 ? 'text-success dark:text-success-light' : savingsDelta < 0 ? 'text-danger dark:text-danger-light' : 'text-muted dark:text-muted-dark'}"
          >
            {#if savingsDelta !== 0}
              <svg class="h-3.5 w-3.5 {savingsDelta < 0 ? 'rotate-180' : ''}" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M6 10V2M2.5 5.5 6 2l3.5 3.5" />
              </svg>
            {/if}
            {Math.abs(savingsDelta).toFixed(1)}
          </p>
          <p class="mt-1 text-[11.5px] text-muted dark:text-muted-dark">points</p>
        </div>
      {/if}
    </div>
  </div>

  <!-- Envelopes -->
  <div>
    <div class="mb-2.5 flex items-center justify-between">
      <h2 class="eyebrow">Envelopes</h2>
      <button
        class="text-[13px] font-medium text-primary hover:underline"
        on:click={() => openLog()}
      >
        Add transaction
      </button>
    </div>
    <div class="grid gap-1.5 lg:grid-cols-2">
      {#each $bucketStatuses as status (status.bucket.id)}
        <EnvelopeRow {status} onClick={() => openLog(status.bucket.id)} />
      {/each}
    </div>
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

<Modal id="assign" title="Assign your income">
  <AssignPanel />
</Modal>

<Modal id="income" title="Manage Income">
  <form on:submit|preventDefault={handleSubmitIncome} class="space-y-4">
    <div>
      <span class="label mb-1.5 block">Type</span>
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
        >Variable</button>
      </div>
    </div>
    <div>
      <label for="income-amount" class="label">Amount</label>
      <div class="relative mt-1.5">
        <span class="absolute left-3 top-1/2 -translate-y-1/2 text-muted">$</span>
        <input
          id="income-amount"
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
      <label for="income-note" class="label">Note (optional)</label>
      <input
        id="income-note"
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
      <label for="goal-name" class="label">Goal Name</label>
      <input
        id="goal-name"
        type="text"
        bind:value={goalName}
        class="mt-1.5 input-base"
        placeholder="Emergency Fund"
      />
    </div>
    <div>
      <label for="goal-bucket" class="label">Linked Bucket</label>
      <select id="goal-bucket" bind:value={goalBucketId} class="mt-1.5 select-base">
        <option value="">Select a bucket</option>
        {#each $buckets as bucket}
          <option value={bucket.id}>{bucket.name}</option>
        {/each}
      </select>
    </div>
    <div>
      <label for="goal-target" class="label">Target Amount</label>
      <div class="relative mt-1.5">
        <span class="absolute left-3 top-1/2 -translate-y-1/2 text-muted">$</span>
        <input
          id="goal-target"
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
      <label for="goal-start" class="label">Starting Balance (optional)</label>
      <div class="relative mt-1.5">
        <span class="absolute left-3 top-1/2 -translate-y-1/2 text-muted">$</span>
        <input
          id="goal-start"
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
      <span class="label mb-2 block">Goal Mode</span>
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
        <label for="goal-date" class="label">Target Date</label>
        <input
          id="goal-date"
          type="date"
          bind:value={goalTargetDate}
          class="mt-1.5 input-base"
        />
      </div>
    {:else}
      <div>
        <label for="goal-monthly" class="label">Monthly Contribution</label>
        <div class="relative mt-1.5">
          <span class="absolute left-3 top-1/2 -translate-y-1/2 text-muted">$</span>
          <input
            id="goal-monthly"
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
