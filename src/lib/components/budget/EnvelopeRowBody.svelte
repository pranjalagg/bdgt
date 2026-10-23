<script lang="ts">
  import type { BucketStatus } from '$lib/types';
  import { formatCurrency } from '$lib/utils/currency';
  import { envelopeIcon } from '$lib/ui/icons';
  import Icon from '$lib/components/ui/Icon.svelte';

  export let status: BucketStatus;

  $: ({ bucket, allocated, spent, remaining } = status);
  $: fill = allocated > 0 ? Math.min(1, Math.max(0, spent) / allocated) : spent > 0 ? 1 : 0;
  const whole = (c: number) => formatCurrency(c).replace(/\.00$/, '');
</script>

  <span class="flex h-9 w-9 flex-none items-center justify-center rounded-[11px] text-white" style="background:{bucket.color}">
    <Icon name={envelopeIcon(bucket.name, bucket.isSystem)} size={19} strokeWidth={2.2} />
  </span>
  <span class="min-w-0 flex-1">
    <span class="block truncate text-[16px] font-medium text-label">{bucket.name}</span>
    {#if bucket.isSavings}
      <span class="amt block text-[13px] text-label-2">{whole(allocated)} a month</span>
    {:else}
      <span class="amt block text-[13px] text-label-2">{whole(Math.max(0, spent))} of {whole(allocated)} spent</span>
      <span class="mt-1.5 block h-1 overflow-hidden rounded-full bg-fill" aria-hidden="true">
        <span class="meter block h-full rounded-full" style="background:{bucket.color}; transform: scaleX({fill})"></span>
      </span>
    {/if}
  </span>
  <span class="flex-none text-right">
    {#if bucket.isSavings}
      <span class="money amt block text-[16px] font-semibold text-success">{formatCurrency(spent)}</span>
      <span class="block text-[12px] text-label-2">set aside</span>
    {:else}
      <span class="money amt block text-[16px] font-semibold {remaining < 0 ? 'text-danger' : 'text-label'}">{formatCurrency(Math.abs(remaining))}</span>
      <span class="block text-[12px] {remaining < 0 ? 'text-danger' : 'text-label-2'}">{remaining < 0 ? 'over' : 'left'}</span>
    {/if}
  </span>
  <span class="text-label-2/60"><Icon name="chevron-right" size={18} /></span>

<style>
  .meter {
    transform-origin: left;
    transition: transform 0.7s var(--ease-smooth, ease-out);
  }
</style>
