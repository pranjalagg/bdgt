<script lang="ts">
  import Modal from '$lib/components/shared/Modal.svelte';
  import { buckets } from '$lib/stores/budgetStore';
  import { addGoal } from '$lib/stores/goalsStore';
  import { closeModal } from '$lib/stores/uiStore';
  import { parseCurrency, isValidCurrency, evaluateExpression, currencySymbol, symbolPadding } from '$lib/utils/currency';

  // A new savings goal: a name, the envelope it fills, a target and either
  // a date or a monthly amount.

  let goalName = '';
  let goalBucketId = '';
  let goalTargetAmount = '';
  let goalStartingBalance = '';
  let goalMode: 'deadline' | 'monthly' = 'deadline';
  let goalTargetDate = '';
  let goalMonthlyContribution = '';
  let goalAmountTouched = false;
  let goalContribTouched = false;

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
</script>

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
        {#each $buckets.filter((b) => !b.isSystem) as bucket}
          <option value={bucket.id}>{bucket.name}</option>
        {/each}
      </select>
    </div>
    <div>
      <label for="goal-target" class="label">Target Amount</label>
      <div class="relative mt-1.5">
        <span class="absolute left-3 top-1/2 -translate-y-1/2 text-label-2">{currencySymbol()}</span>
        <input
          id="goal-target"
          type="text"
          inputmode="decimal"
          bind:value={goalTargetAmount}
          on:input={() => goalAmountTouched = true}
          style:padding-left={symbolPadding(1.75)}
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
        <span class="absolute left-3 top-1/2 -translate-y-1/2 text-label-2">{currencySymbol()}</span>
        <input
          id="goal-start"
          type="text"
          inputmode="decimal"
          bind:value={goalStartingBalance}
          style:padding-left={symbolPadding(1.75)}
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
          <span class="text-sm text-label">Set deadline</span>
        </label>
        <label class="flex items-center gap-2 cursor-pointer">
          <input type="radio" bind:group={goalMode} value="monthly" class="accent-primary" />
          <span class="text-sm text-label">Set monthly contribution</span>
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
          <span class="absolute left-3 top-1/2 -translate-y-1/2 text-label-2">{currencySymbol()}</span>
          <input
            id="goal-monthly"
            type="text"
            inputmode="decimal"
            bind:value={goalMonthlyContribution}
            on:input={() => goalContribTouched = true}
            style:padding-left={symbolPadding(1.75)}
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
