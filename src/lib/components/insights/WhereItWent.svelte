<script lang="ts">
  import IconMark from '$lib/components/ui/IconMark.svelte';
  import { envelopeIcon } from '$lib/ui/icons';
  import { formatCurrency } from '$lib/utils/currency';
  import type { Bucket } from '$lib/types';

  // Envelopes by what was spent from them this month, with each one's share.

  export let rows: { bucket: Bucket; cents: number }[];

  $: total = rows.reduce((s, r) => s + r.cents, 0);
  $: top = rows[0]?.cents ?? 0;
</script>

{#if rows.length}
  <div class="list">
    {#each rows as r (r.bucket.id)}
      <div class="row">
        <IconMark icon={envelopeIcon(r.bucket.name, r.bucket.isSystem)} dot={r.bucket.color} />
        <span class="min-w-0 flex-1">
          <span class="flex items-baseline justify-between gap-3">
            <span class="t-row truncate">{r.bucket.name}</span>
            <span class="money amt flex-none text-[16px] font-semibold text-label">{formatCurrency(r.cents).replace(/\.00$/, '')}</span>
          </span>
          <span class="mt-2 flex items-center gap-3">
            <span class="block h-1 flex-1 overflow-hidden rounded-full bg-fill" aria-hidden="true"><span class="share block h-full rounded-full" style="background:{r.bucket.color}; transform: scaleX({top > 0 ? r.cents / top : 0})"></span></span>
            <span class="w-9 flex-none text-right text-[12px] text-label-2">{total > 0 ? Math.round((r.cents / total) * 100) : 0}%</span>
          </span>
        </span>
      </div>
    {/each}
  </div>
{:else}
  <p class="py-6 text-center text-[15px] text-label-2">Nothing spent this month yet.</p>
{/if}

<style>
  .share {
    transform-origin: left;
    transition: transform 0.7s var(--ease-smooth, ease-out);
  }
</style>
