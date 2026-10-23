<script lang="ts">
  import Modal from '$lib/components/shared/Modal.svelte';
  import Icon from '$lib/components/ui/Icon.svelte';
  import { bucketStatuses, updateTransaction } from '$lib/stores/budgetStore';
  import { closeModal } from '$lib/stores/uiStore';
  import { showToast } from '$lib/stores/toastStore';
  import { formatCurrency } from '$lib/utils/currency';
  import { envelopeIcon } from '$lib/ui/icons';
  import { haptic } from '$lib/ui/haptics';
  import type { Transaction } from '$lib/types';

  // Where a swiped-right expense goes. Undo puts it back.

  export let transaction: Transaction | null;

  $: envelopes = $bucketStatuses.filter((s) => !s.bucket.isSystem);

  async function moveTo(id: string, name: string) {
    if (!transaction) return;
    const t = transaction;
    const from = t.bucketId;
    closeModal('move-transaction');
    if (id === from) return;
    await updateTransaction(t.id, { bucketId: id });
    haptic('success');
    showToast({ message: `Moved to ${name}`, envelopeId: id, action: { label: 'Undo', run: () => updateTransaction(t.id, { bucketId: from }) } });
  }
</script>

<Modal id="move-transaction" title="Move to">
  {#if transaction}
    <div class="group">
      {#each envelopes as s (s.bucket.id)}
        {@const current = s.bucket.id === transaction.bucketId}
        <button type="button" class="group-row flex min-h-[52px] w-full items-center gap-3 px-4 py-2 text-left hover:bg-fill focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-tint" style="--row-inset: 60px" aria-current={current ? 'true' : undefined} on:click={() => moveTo(s.bucket.id, s.bucket.name)}>
            <span class="flex h-8 w-8 flex-none items-center justify-center rounded-[10px] text-white" style="background:{s.bucket.color}" aria-hidden="true"><Icon name={envelopeIcon(s.bucket.name)} size={17} strokeWidth={2.2} /></span>
            <span class="min-w-0 flex-1 truncate text-[16px] text-label">{s.bucket.name}</span>
            <span class="money amt flex-none text-[13px] text-label-2">{formatCurrency(s.remaining)} left</span>
            {#if current}<span class="text-tint"><Icon name="check" size={18} /></span>{/if}
        </button>
      {/each}
    </div>
  {/if}
</Modal>
