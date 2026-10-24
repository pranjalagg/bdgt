<script lang="ts">
  import Icon from '$lib/components/ui/Icon.svelte';
  import { envelopeIcon } from '$lib/ui/icons';
  import { formatCurrency } from '$lib/utils/currency';
  import type { Bucket } from '$lib/types';

  // Envelopes by what was spent from them this month, with each one's share.

  export let rows: { bucket: Bucket; cents: number }[];

  $: total = rows.reduce((s, r) => s + r.cents, 0);
  $: top = rows[0]?.cents ?? 0;
</script>

{#if rows.length}
  <div class="group">
    {#each rows as r (r.bucket.id)}
      <div class="group-row flex items-center gap-3 px-4 py-2.5" style="--row-inset: 64px">
        <span class="flex h-9 w-9 flex-none items-center justify-center rounded-[11px] text-white" style="background:{r.bucket.color}" aria-hidden="true"><Icon name={envelopeIcon(r.bucket.name, r.bucket.isSystem)} size={19} strokeWidth={2.2} /></span>
        <span class="min-w-0 flex-1">
          <span class="block truncate text-[16px] text-label">{r.bucket.name}</span>
          <span class="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-fill" aria-hidden="true"><span class="share block h-full rounded-full" style="background:{r.bucket.color}; transform: scaleX({top > 0 ? r.cents / top : 0})"></span></span>
        </span>
        <span class="flex-none text-right">
          <span class="money amt block text-[16px] font-semibold text-label">{formatCurrency(r.cents).replace(/\.00$/, '')}</span>
          <span class="block text-[12px] text-label-2">{total > 0 ? Math.round((r.cents / total) * 100) : 0}%</span>
        </span>
      </div>
    {/each}
  </div>
{:else}
  <div class="card px-5 py-8 text-center text-[15px] text-label-2">Nothing spent this month yet.</div>
{/if}

<style>
  .share {
    transform-origin: left;
    transition: transform 0.7s var(--ease-smooth, ease-out);
  }
</style>
