<script lang="ts">
  import { formatCurrency, formatMoney } from '$lib/utils/currency';
  import { envelopeIcon } from '$lib/ui/icons';
  import { baseCurrency } from '$lib/stores/currencyStore';
  import { shouldShowForeignNote } from '$lib/currency/conversion';
  import IconMark from '$lib/components/ui/IconMark.svelte';
  import type { Bucket, Transaction } from '$lib/types';

  // One expense: its envelope's icon, what it was, and the amount.

  export let transaction: Transaction;
  export let bucket: Bucket | undefined;
  export let tag: 'Auto' | 'Recurring' | null = null;
  // Only part of the payment was this person's (a shared bill).
  export let partOf: number | null = null;
  export let onOpen: () => void;

  $: setAside = !!bucket?.isSavings;
  $: foreign = transaction.foreign && shouldShowForeignNote(transaction.foreign, $baseCurrency) ? transaction.foreign : null;
</script>

<button
  type="button"
  data-row
  class="row row-tap w-[calc(100%+20px)] focus:outline-none focus-visible:ring-2 focus-visible:ring-tint"
  on:click={onOpen}
>
  <IconMark icon={bucket ? envelopeIcon(bucket.name, bucket.isSystem) : 'tag'} />
  <span class="min-w-0 flex-1">
    <span class="flex min-w-0 items-center gap-1.5">
      <span class="t-row truncate">{transaction.note || bucket?.name || 'Expense'}</span>
      {#if tag}<span class="flex-none rounded-full bg-fill px-1.5 text-[11px] font-semibold leading-[18px] text-label-2">{tag}</span>{/if}
    </span>
    <span class="block truncate text-[13px] text-label-2">
      {bucket?.name ?? 'Unknown envelope'}{#if bucket?.isSystem}<span class="text-warning"> · needs an envelope</span>{/if}{#if setAside}<span class="text-success"> · set aside</span>{/if}{#if foreign}<span class="amt"> · {formatMoney(foreign.amount, foreign.currency)} @ {foreign.rate}</span>{/if}
    </span>
  </span>
  <span class="flex-none text-right">
    <span class="money amt block text-[16px] font-semibold {setAside ? 'text-success' : 'text-label'}">{formatCurrency(transaction.amount)}</span>
    {#if partOf !== null}<span class="money amt block text-[12px] text-label-2">of {formatCurrency(partOf)}</span>{/if}
  </span>
</button>
