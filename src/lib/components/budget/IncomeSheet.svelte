<script lang="ts">
  import Modal from '$lib/components/shared/Modal.svelte';
  import { segmentedPill } from '$lib/actions/segmentedPill';
  import { currentMonthIncomes, addIncome, updateIncome, deleteIncome } from '$lib/stores/budgetStore';
  import { currentMonthKey } from '$lib/stores/uiStore';
  import { formatCurrency, parseCurrency, isValidCurrency, isExpression, evaluateExpression, dollarsToCents, currencySymbol, symbolPadding } from '$lib/utils/currency';
  import { parseMonthKey } from '$lib/utils/dates';
  import type { Income, IncomeType } from '$lib/types';

  // This month's income: add, edit and delete, fixed or variable. Opened
  // from Budget's summary card.

  let incomeAmount = '';
  let incomeNote = '';
  let incomeType: IncomeType = 'fixed';
  let incomeTouched = false;
  let editingIncomeId: string | null = null;

  $: incomeError = incomeTouched && incomeAmount && !isValidCurrency(incomeAmount)
    ? 'Please enter a valid amount (e.g. 5000, 2500 + 500)'
    : '';
  $: incomeCanSubmit = !!incomeAmount && !incomeError && isValidCurrency(incomeAmount);
  $: incomePreview = isExpression(incomeAmount) && isValidCurrency(incomeAmount) ? evaluateExpression(incomeAmount) : null;

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

<Modal id="income" title="Income">
  <form on:submit|preventDefault={handleSubmitIncome} class="space-y-4">
    <div>
      <span id="income-type-label" class="label mb-1.5 block">Type</span>
      <div class="segmented md:!flex md:!w-full" role="group" aria-labelledby="income-type-label" use:segmentedPill>
        <button type="button" class="segment" aria-pressed={incomeType === 'fixed'} on:click={() => (incomeType = 'fixed')}>Fixed</button>
        <button type="button" class="segment" aria-pressed={incomeType === 'one-time'} on:click={() => (incomeType = 'one-time')}>Variable</button>
      </div>
    </div>
    <div>
      <label for="income-amount" class="label">Amount</label>
      <div class="relative mt-1.5">
        <span class="absolute left-3 top-1/2 -translate-y-1/2 text-label-2">{currencySymbol()}</span>
        <input
          id="income-amount"
          type="text"
          inputmode="decimal"
          bind:value={incomeAmount}
          on:input={() => incomeTouched = true}
          style:padding-left={symbolPadding(1.75)}
          class="input-base pl-7 {incomeError ? '!border-danger focus:!border-danger focus:!ring-danger/20' : ''}"
          placeholder="0.00"
        />
      </div>
      {#if incomeError}
        <p class="mt-1 text-sm text-danger">{incomeError}</p>
      {:else if incomePreview !== null}
        <p class="mt-1 text-sm text-label-2">= <span class="amt">{formatCurrency(dollarsToCents(incomePreview))}</span></p>
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
    <div class="mt-6">
      <h3 class="settings-label">This month's income</h3>
      <div class="space-y-2">
        {#each $currentMonthIncomes as income}
          <div class="flex items-center justify-between gap-3 rounded-[14px] bg-raised py-2 pl-4 pr-1.5">
            <div>
              <div class="flex items-center gap-2">
                <p class="money amt text-[15px] font-semibold text-label">{formatCurrency(income.amount)}</p>
                <span class="rounded-full bg-surface px-1.5 py-px text-[10.5px] font-semibold uppercase tracking-wide text-label dark:bg-white/10">
                  {income.type === 'fixed' ? 'Fixed' : 'Variable'}
                </span>
              </div>
              {#if income.note}<p class="text-[13px] text-label-2">{income.note}</p>{/if}
            </div>
            <div class="flex flex-none items-center">
              <button
                class="btn-icon"
                on:click={() => handleEditIncome(income)}
                aria-label="Edit income"
              >
                <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
              </button>
              <button
                class="btn-icon hover:!bg-danger/10 hover:!text-danger"
                on:click={() => confirm(`Delete this ${formatCurrency(income.amount)} income?`) && deleteIncome(income.id)}
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
