<script lang="ts">
  import { updateTransaction, deleteTransaction } from '$lib/stores/budgetStore';
  import { closeModal } from '$lib/stores/uiStore';
  import { baseCurrency } from '$lib/stores/currencyStore';
  import { baseAmountForSave } from '$lib/currency/conversion';
  import { formatCurrency } from '$lib/utils/currency';
  import type { Transaction } from '$lib/types';
  import TransactionForm from './TransactionForm.svelte';
  import type { TransactionValues } from './transactionValues';

  export let transaction: Transaction;
  export let onComplete: (() => void) | undefined = undefined;

  // A record entered under another base currency no longer relates to this
  // one (the user relabeled), so it opens as an ordinary transaction and
  // saving clears its stale foreign details.
  const foreignShown = transaction.foreign && transaction.foreign.base === $baseCurrency ? transaction.foreign : undefined;

  const initial = {
    amount: foreignShown?.amount ?? transaction.amount,
    currency: foreignShown?.currency ?? $baseCurrency,
    rate: foreignShown?.rate,
    bucketId: transaction.bucketId,
    date: new Date(transaction.date),
    note: transaction.note,
  };

  async function save(v: TransactionValues) {
    await updateTransaction(transaction.id, {
      amount: baseAmountForSave({ amount: transaction.amount, foreign: foreignShown }, v.typedMinor, v.foreign, v.baseCents),
      foreign: v.foreign, // undefined removes it from the stored record
      bucketId: v.bucketId,
      date: v.date,
      note: v.note,
    });
    closeModal();
    onComplete?.();
  }

  // Delete lives here, not on the row: a row is one tap target that opens
  // this sheet, and a destructive action stays a deliberate second step.
  async function remove() {
    if (!confirm(`Delete this ${formatCurrency(transaction.amount)} transaction?`)) return;
    await deleteTransaction(transaction.id);
    closeModal();
    onComplete?.();
  }
</script>

<TransactionForm id="edit" {initial} keepBucketId={transaction.bucketId} submitLabel="Save Changes" busyLabel="Saving..." onSubmit={save} />

<button type="button" class="btn-danger mt-2 w-full" on:click={remove}>Delete transaction</button>
