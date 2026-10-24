<script lang="ts">
  import Modal from '$lib/components/shared/Modal.svelte';
  import EditTransaction from '$lib/components/shared/EditTransaction.svelte';
  import IconMark from '$lib/components/ui/IconMark.svelte';
  import { buckets } from '$lib/stores/budgetStore';
  import { captures } from '$lib/stores/captureStore';
  import { baseCurrency } from '$lib/stores/currencyStore';
  import { captureIdOf, recordedDiffers } from '$lib/capture/queue';
  import { formatCurrency } from '$lib/utils/currency';
  import { envelopeIcon } from '$lib/ui/icons';
  import type { Transaction } from '$lib/types';

  // One expense: what it was and where it went, then the form to change
  // any of it, and Delete.

  export let transaction: Transaction | null;

  $: bucket = transaction ? $buckets.find((b) => b.id === transaction!.bucketId) : undefined;
  $: captureId = transaction ? captureIdOf(transaction.id) : null;
  $: capture = captureId ? $captures.find((c) => c.id === captureId) : undefined;
  $: tag = captureId ? 'Auto' : transaction?.recurringId ? 'Recurring' : null;
  $: partOf = transaction && capture && capture.currency === $baseCurrency && recordedDiffers(capture, transaction, $baseCurrency) ? capture.amount : null;
  $: when = transaction ? new Date(transaction.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : '';
</script>

<Modal id="edit-transaction" title="Expense">
  {#if transaction}
    {#key transaction.id}
      <div class="mb-4 flex items-center gap-3">
        <IconMark icon={bucket ? envelopeIcon(bucket.name, bucket.isSystem) : 'tag'} size={48} dot={bucket && !bucket.isSystem ? bucket.color : null} />
        <span class="min-w-0 flex-1">
          <span class="flex items-center gap-1.5">
            <span class="truncate text-[17px] font-semibold text-label">{transaction.note || bucket?.name || 'Expense'}</span>
            {#if tag}<span class="flex-none rounded-full bg-fill px-1.5 text-[11px] font-semibold leading-[18px] text-label-2" title={capture ? `Added from ${capture.sourceLabel}` : undefined}>{tag}</span>{/if}
          </span>
          <span class="block truncate text-[13px] text-label-2">{when} · {bucket?.name ?? 'Unknown envelope'}</span>
        </span>
        <span class="flex-none text-right">
          <span class="figure amt block text-[22px] text-label">{formatCurrency(transaction.amount)}</span>
          {#if partOf !== null}<span class="money amt block text-[12px] text-label-2">of {formatCurrency(partOf)}</span>{/if}
        </span>
      </div>
      <EditTransaction {transaction} />
    {/key}
  {/if}
</Modal>
