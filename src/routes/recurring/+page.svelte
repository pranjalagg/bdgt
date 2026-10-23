<!-- src/routes/recurring/+page.svelte -->
<script lang="ts">
  import { recurringTransactions, addRecurring, updateRecurring, deleteRecurring, toggleRecurring } from '$lib/stores/recurringStore';
  import { buckets } from '$lib/stores/budgetStore';
  import { formatCurrency, parseCurrency, isValidCurrency, isExpression, evaluateExpression, dollarsToCents, currencySymbol, symbolPadding } from '$lib/utils/currency';
  import { parseLocalDate } from '$lib/utils/dates';
  import Modal from '$lib/components/shared/Modal.svelte';
  import SectionTabs from '$lib/components/shared/SectionTabs.svelte';
  import { openModal, closeModal } from '$lib/stores/uiStore';
  import type { RecurringTransaction } from '$lib/types';

  let editingId: string | null = null;
  $: editing = editingId ? $recurringTransactions.find((r) => r.id === editingId) : undefined;
  let amount = '';
  let bucketId = '';
  let frequency: RecurringTransaction['frequency'] = 'monthly';
  let nextDueDate = formatLocalDate(new Date());
  let note = '';
  let amountTouched = false;

  function formatLocalDate(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  $: amountError = amountTouched && amount && !isValidCurrency(amount)
    ? 'Please enter a valid amount (e.g. 12.50, -5, 10 + 5.25, or 12.50 * 3)'
    : '';

  $: canSubmit = !!amount && !!bucketId && !amountError && isValidCurrency(amount);

  $: showPreview = isExpression(amount) && isValidCurrency(amount);
  $: previewValue = showPreview ? evaluateExpression(amount) : null;

  function handleAmountInput() {
    amountTouched = true;
  }

  function resetForm() {
    editingId = null;
    amount = '';
    bucketId = '';
    frequency = 'monthly';
    nextDueDate = formatLocalDate(new Date());
    note = '';
    amountTouched = false;
  }

  function handleAdd() {
    resetForm();
    openModal('recurring-form');
  }

  function handleEdit(rec: RecurringTransaction) {
    editingId = rec.id;
    amount = (rec.amount / 100).toFixed(2);
    bucketId = rec.bucketId;
    frequency = rec.frequency;
    nextDueDate = formatLocalDate(new Date(rec.nextDueDate));
    note = rec.note || '';
    openModal('recurring-form');
  }

  async function handleSubmit() {
    amountTouched = true;
    if (!canSubmit) return;

    const data = {
      amount: parseCurrency(amount),
      bucketId,
      frequency,
      nextDueDate: parseLocalDate(nextDueDate),
      note: note || undefined,
      isActive: true,
    };

    if (editingId) {
      await updateRecurring(editingId, data);
    } else {
      await addRecurring(data);
    }
    closeModal();
    resetForm();
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this recurring transaction?')) return;
    await deleteRecurring(id);
    closeModal();
    resetForm();
  }

  async function handleToggle(id: string) {
    await toggleRecurring(id);
    closeModal();
    resetForm();
  }

  const FREQUENCY: Record<RecurringTransaction['frequency'], string> = {
    weekly: 'Weekly',
    biweekly: 'Every 2 weeks',
    monthly: 'Monthly',
  };

  function dueLabel(d: Date) {
    const sameYear = d.getFullYear() === new Date().getFullYear();
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) });
  }

  const initial = (name: string | undefined) => (name ? Array.from(name)[0].toUpperCase() : '?');

  $: sortedRecurring = [...$recurringTransactions].sort(
    (a, b) => new Date(a.nextDueDate).getTime() - new Date(b.nextDueDate).getTime()
  );
</script>

<div class="space-y-6">
  <SectionTabs tabs={[{ href: '/buckets', label: 'Buckets' }, { href: '/recurring', label: 'Recurring' }, { href: '/settings', label: 'Settings' }]} />

  <div class="flex items-center justify-between gap-3">
    <h1 class="page-title">Recurring</h1>
    <button class="btn-secondary !pl-4" on:click={handleAdd}>
      <svg class="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
      Add
    </button>
  </div>

  {#if sortedRecurring.length === 0}
    <div class="card px-5 py-12 text-center text-sm text-muted dark:text-muted-dark">No recurring transactions</div>
  {:else}
    <!-- Tap an item to edit, pause or delete it. -->
    <div class="card overflow-hidden">
      {#each sortedRecurring as rec, i (rec.id)}
        {@const bucket = $buckets.find((b) => b.id === rec.bucketId)}
        <button
          type="button"
          data-row
          on:click={() => handleEdit(rec)}
          class="relative flex w-full items-center gap-3 px-4 py-3 text-left transition-colors
                 hover:bg-black/[0.02] active:bg-black/[0.05] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary
                 dark:hover:bg-white/[0.03] dark:active:bg-white/[0.06]"
        >
          {#if i > 0}
            <span class="pointer-events-none absolute left-[4.25rem] right-0 top-0 h-px bg-border dark:bg-border-dark" aria-hidden="true"></span>
          {/if}
          <span class="relative flex h-10 w-10 flex-none items-center justify-center overflow-hidden rounded-full" aria-hidden="true">
            <span class="absolute inset-0 opacity-25 dark:opacity-35" style="background:{bucket?.color ?? '#cbd4c9'}"></span>
            <span class="relative text-[15px] font-semibold text-gray-900 dark:text-white">{initial(rec.note || bucket?.name)}</span>
          </span>
          <span class="min-w-0 flex-1">
            <span class="flex min-w-0 items-center gap-1.5 text-[15px] font-medium leading-snug text-gray-950 dark:text-gray-50">
              <span class="truncate">{rec.note || bucket?.name || 'Recurring'}</span>
              {#if !rec.isActive}
                <span class="flex-none rounded-full bg-raised px-1.5 py-px text-[10.5px] font-semibold uppercase tracking-wide text-gray-700 dark:bg-raised-dark dark:text-gray-200">Paused</span>
              {/if}
            </span>
            <span class="block truncate text-[13px] text-muted dark:text-muted-dark">{bucket?.name || 'Unknown'} · {FREQUENCY[rec.frequency] ?? rec.frequency}</span>
          </span>
          <span class="flex-none text-right">
            <span class="money amt block text-[15px] font-semibold text-gray-950 dark:text-gray-50">{formatCurrency(rec.amount)}</span>
            <span class="block text-[12px] text-muted dark:text-muted-dark">{rec.isActive ? 'Due' : 'Was due'} {dueLabel(new Date(rec.nextDueDate))}</span>
          </span>
        </button>
      {/each}
    </div>
  {/if}
</div>

<Modal id="recurring-form" title={editingId ? 'Edit Recurring' : 'Add Recurring'}>
  <form on:submit|preventDefault={handleSubmit} class="space-y-4">
    <div>
      <label for="rec-amount" class="label">Amount</label>
      <div class="relative mt-1.5">
        <span class="absolute left-3 top-1/2 -translate-y-1/2 text-muted">{currencySymbol()}</span>
        <input
          id="rec-amount"
          type="text"
          inputmode="decimal"
          bind:value={amount}
          on:input={handleAmountInput}
          placeholder="0.00"
          style:padding-left={symbolPadding(1.75)}
          class="input-base pl-7 {amountError ? '!border-danger !focus:border-danger !focus:ring-danger/20' : ''}"
          required
        />
      </div>
      {#if amountError}
        <p class="mt-1 text-sm text-danger">{amountError}</p>
      {:else if showPreview && previewValue !== null}
        <p class="mt-1 text-sm text-muted">= <span class="amt">{formatCurrency(dollarsToCents(previewValue))}</span></p>
      {/if}
    </div>
    <div>
      <label for="rec-bucket" class="label">Bucket</label>
      <select id="rec-bucket" bind:value={bucketId} class="mt-1.5 select-base" required>
        <option value="">Select bucket</option>
        {#each $buckets.filter((b) => !b.isSystem) as bucket}
          <option value={bucket.id}>{bucket.name}</option>
        {/each}
      </select>
    </div>
    <div>
      <label for="rec-frequency" class="label">Frequency</label>
      <select id="rec-frequency" bind:value={frequency} class="mt-1.5 select-base">
        <option value="weekly">Weekly</option>
        <option value="biweekly">Bi-weekly</option>
        <option value="monthly">Monthly</option>
      </select>
    </div>
    <div>
      <label for="rec-date" class="label">Next Due Date</label>
      <input id="rec-date" type="date" bind:value={nextDueDate} class="mt-1.5 input-base" required />
    </div>
    <div>
      <label for="rec-note" class="label">Note (optional)</label>
      <input id="rec-note" type="text" bind:value={note} class="mt-1.5 input-base" />
    </div>
    <button
      type="submit"
      disabled={!canSubmit}
      class="w-full btn-primary"
    >
      {editingId ? 'Update' : 'Add'} Recurring
    </button>
    {#if editing}
      <div class="grid grid-cols-2 gap-2">
        <button type="button" class="btn-secondary" on:click={() => editing && handleToggle(editing.id)}>{editing.isActive ? 'Pause' : 'Resume'}</button>
        <button type="button" class="btn-danger" on:click={() => editing && handleDelete(editing.id)}>Delete</button>
      </div>
    {/if}
  </form>
</Modal>
