<script lang="ts">
  import EnvelopePicker from '$lib/components/shared/EnvelopePicker.svelte';
  import { updateTransaction } from '$lib/stores/budgetStore';
  import { closeModal } from '$lib/stores/uiStore';
  import { showToast } from '$lib/stores/toastStore';
  import { haptic } from '$lib/ui/haptics';
  import type { Transaction } from '$lib/types';

  // Where a swiped-right expense goes. Undo puts it back.

  export let transaction: Transaction | null;

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

<EnvelopePicker id="move-transaction" title="Move to" current={transaction?.bucketId ?? null} on:pick={(e) => moveTo(e.detail.id, e.detail.name)} />
