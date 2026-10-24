<script lang="ts">
  import Modal from '$lib/components/shared/Modal.svelte';
  import { buckets } from '$lib/stores/budgetStore';
  import { addRecurring, updateRecurring, deleteRecurring, toggleRecurring } from '$lib/stores/recurringStore';
  import { activeModal, closeModal } from '$lib/stores/uiStore';
  import { formatCurrency, isValidCurrency, isExpression, evaluateExpression, dollarsToCents, currencySymbol, symbolPadding } from '$lib/utils/currency';
  import { haptic } from '$lib/ui/haptics';
  import { recurringFormData } from '$lib/budget/recurringForm';
  import type { RecurringTransaction } from '$lib/types';

  // A bill or subscription that is logged for you when it falls due.
  // Existing ones also pause, resume and delete from here.

  export let item: RecurringTransaction | null = null;
  export let defaultBucketId = '';

  const localDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  let amount = '';
  let bucketId = '';
  let frequency: RecurringTransaction['frequency'] = 'monthly';
  let nextDueDate = localDate(new Date());
  let note = '';
  let amountTouched = false;
  let wasOpen = false;

  $: onOpenChange($activeModal === 'recurring-form');
  function onOpenChange(open: boolean) {
    if (open && !wasOpen) seed();
    wasOpen = open;
  }
  function seed() {
    amount = item ? (item.amount / 100).toFixed(2) : '';
    bucketId = item?.bucketId ?? defaultBucketId;
    frequency = item?.frequency ?? 'monthly';
    nextDueDate = localDate(item ? new Date(item.nextDueDate) : new Date());
    note = item?.note ?? '';
    amountTouched = false;
  }

  $: amountError = amountTouched && amount && !isValidCurrency(amount) ? 'Please enter a valid amount (e.g. 12.50, -5, 10 + 5.25, or 12.50 * 3)' : '';
  $: canSubmit = !!amount && !!bucketId && !amountError && isValidCurrency(amount);
  $: previewValue = isExpression(amount) && isValidCurrency(amount) ? evaluateExpression(amount) : null;

  async function submit() {
    amountTouched = true;
    if (!canSubmit) return;
    const data = recurringFormData({ amount, bucketId, frequency, nextDueDate, note }, item ?? undefined);
    if (item) await updateRecurring(item.id, data);
    else await addRecurring(data);
    haptic('success');
    closeModal('recurring-form');
  }

  async function toggle() {
    if (!item) return;
    await toggleRecurring(item.id);
    haptic('light');
    closeModal('recurring-form');
  }

  async function remove() {
    if (!item || !confirm('Delete this recurring transaction?')) return;
    await deleteRecurring(item.id);
    closeModal('recurring-form');
  }
</script>

<Modal id="recurring-form" title={item ? 'Edit recurring' : 'New recurring'}>
  <form on:submit|preventDefault={submit} class="space-y-4 pt-1">
    <div>
      <label for="rec-amount" class="label">Amount</label>
      <div class="relative mt-1.5">
        <span class="absolute left-3 top-1/2 -translate-y-1/2 text-label-2">{currencySymbol()}</span>
        <input
          id="rec-amount"
          type="text"
          inputmode="decimal"
          bind:value={amount}
          on:input={() => (amountTouched = true)}
          placeholder="0.00"
          style:padding-left={symbolPadding(1.75)}
          class="input-base pl-7 {amountError ? '!border-danger' : ''}"
          required
        />
      </div>
      {#if amountError}
        <p class="mt-1 text-sm text-danger">{amountError}</p>
      {:else if previewValue !== null}
        <p class="mt-1 text-sm text-label-2">= <span class="amt">{formatCurrency(dollarsToCents(previewValue))}</span></p>
      {/if}
    </div>
    <div>
      <label for="rec-bucket" class="label">Envelope</label>
      <select id="rec-bucket" bind:value={bucketId} class="mt-1.5 select-base" required>
        <option value="">Choose an envelope</option>
        {#each $buckets.filter((b) => !b.isSystem) as bucket}
          <option value={bucket.id}>{bucket.name}</option>
        {/each}
      </select>
    </div>
    <div>
      <label for="rec-frequency" class="label">How often</label>
      <select id="rec-frequency" bind:value={frequency} class="mt-1.5 select-base">
        <option value="weekly">Weekly</option>
        <option value="biweekly">Every 2 weeks</option>
        <option value="monthly">Monthly</option>
      </select>
    </div>
    <div>
      <label for="rec-date" class="label">Next due</label>
      <input id="rec-date" type="date" bind:value={nextDueDate} class="mt-1.5 input-base" required />
    </div>
    <div>
      <label for="rec-note" class="label">Name (optional)</label>
      <input id="rec-note" type="text" bind:value={note} class="mt-1.5 input-base" placeholder="Netflix, rent, gym…" />
    </div>
    <button type="submit" disabled={!canSubmit} class="btn-primary w-full">{item ? 'Save' : 'Add recurring'}</button>
    {#if item}
      <div class="grid grid-cols-2 gap-2">
        <button type="button" class="btn-secondary" on:click={toggle}>{item.isActive ? 'Pause' : 'Resume'}</button>
        <button type="button" class="btn-danger" on:click={remove}>Delete</button>
      </div>
    {/if}
  </form>
</Modal>
