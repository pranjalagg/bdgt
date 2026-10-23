<script lang="ts">
  import Modal from '$lib/components/shared/Modal.svelte';
  import TransactionForm from '$lib/components/shared/TransactionForm.svelte';
  import { baseCurrency } from '$lib/stores/currencyStore';
  import { suggestions, rateFor } from '$lib/stores/captureStore';
  import type { TransactionValues } from '$lib/components/shared/transactionValues';
  import type { Capture } from '$lib/types';

  // Change anything about a payment (amount, currency and rate, envelope,
  // date, note), then approve it.

  export let capture: Capture | null;
  // An envelope chosen in the picker before the form opened (a rate was
  // still needed).
  export let bucketId: string | null = null;
  export let error = '';
  export let onApprove: (c: Capture, v: TransactionValues) => Promise<void>;

  function initial(c: Capture) {
    return {
      amount: c.amount,
      currency: c.currency,
      rate: c.currency === $baseCurrency ? undefined : rateFor(c.currency) ?? undefined,
      bucketId: bucketId ?? $suggestions.get(c.id)?.bucketId ?? '',
      date: new Date(c.date),
      note: c.merchant,
    };
  }
</script>

<Modal id="review-edit" title="Edit and approve">
  {#if capture}
    {#key capture.id + (bucketId ?? '')}
      <TransactionForm id="review" initial={initial(capture)} submitLabel="Approve" busyLabel="Approving…" onSubmit={(v) => onApprove(capture, v)}>
        {#if error}<p class="text-[15px] text-danger" role="alert">{error}</p>{/if}
      </TransactionForm>
    {/key}
  {/if}
</Modal>
