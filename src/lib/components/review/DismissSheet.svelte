<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import Modal from '$lib/components/shared/Modal.svelte';
  import Switch from '$lib/components/ui/Switch.svelte';
  import { closeModal } from '$lib/stores/uiStore';
  import { formatMoney } from '$lib/utils/currency';
  import type { Capture } from '$lib/types';

  // Dismiss one payment, and optionally every payment to that payee from
  // now on (a card bill, or money to your own account).

  export let capture: Capture | null;

  const dispatch = createEventDispatcher<{ dismiss: { capture: Capture; ignorePayee: boolean } }>();
  let ignorePayee = false;
  let forId: string | undefined;
  $: if (capture?.id !== forId) {
    forId = capture?.id;
    ignorePayee = false;
  }
</script>

<Modal id="review-dismiss" title="Dismiss payment">
  {#if capture}
    <div class="grid gap-4">
      <p class="text-[15px] text-label-2"><span class="amt">{capture.merchant}, {formatMoney(capture.amount, capture.currency)},</span> will not be added to your budget.</p>
      {#if capture.payeeKey}
        <div class="group flex items-center gap-3 px-4 py-3">
          <label for="ignore-payee" class="min-w-0 flex-1 text-[15px] text-label">Always ignore payments to {capture.merchant}</label>
          <Switch id="ignore-payee" bind:checked={ignorePayee} label="Always ignore payments to {capture.merchant}" />
        </div>
      {/if}
      <button type="button" class="btn-primary w-full" on:click={() => capture && dispatch('dismiss', { capture, ignorePayee })}>Dismiss</button>
      <button type="button" class="btn-secondary w-full" on:click={() => closeModal('review-dismiss')}>Cancel</button>
    </div>
  {/if}
</Modal>
