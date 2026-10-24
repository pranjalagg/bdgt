<script lang="ts">
  import { fitText } from '$lib/ui/fit';
  import { createEventDispatcher } from 'svelte';
  import Icon from '$lib/components/ui/Icon.svelte';
  import { HINT_TEXT } from '$lib/capture/queue';
  import { formatMoney } from '$lib/utils/currency';
  import type { Bucket, Capture } from '$lib/types';

  // One payment the phone noticed: who, how much, when and from where, the
  // envelope it would go to, and anything worth a second look.

  export let capture: Capture;
  export let envelope: Bucket | undefined;
  export let reason = '';
  // "About $3.00" for a payment in another currency, or "Rate needed".
  export let estimate: string | null = null;
  export let duplicates: Capture[] = [];
  // How far the card is pulled, -1 (dismiss) to 1 (approve), for the stamps.
  export let pull = 0;

  const dispatch = createEventDispatcher<{ pick: null; notDuplicate: string }>();
  const when = (c: Capture) => new Date(c.postedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
</script>

<div class="relative flex h-full flex-col gap-4 p-5">
  <span class="stamp approve" style:opacity={Math.max(0, pull)} aria-hidden="true">Approve</span>
  <span class="stamp dismiss" style:opacity={Math.max(0, -pull)} aria-hidden="true">Dismiss</span>

  <div>
    <p class="text-[13px] font-medium text-label-2">{when(capture)} · {capture.sourceLabel}{#if capture.accountHint} ••{capture.accountHint}{/if}</p>
    <h2 class="mt-1 truncate text-[24px] font-bold tracking-tight text-label">{capture.merchant}</h2>
  </div>

  <div>
    <p class="figure amt text-[44px] leading-none text-label" use:fitText={{ text: formatMoney(capture.amount, capture.currency), max: 44, min: 24 }}>{formatMoney(capture.amount, capture.currency)}</p>
    {#if estimate}<p class="money amt mt-1.5 text-[15px] text-label-2">{estimate}</p>{/if}
  </div>

  <div class="flex flex-wrap items-center gap-2">
    <button type="button" class="flex h-9 items-center gap-2 rounded-full bg-fill pl-2 pr-3 text-[15px] font-semibold text-label focus:outline-none focus-visible:ring-2 focus-visible:ring-tint" on:click={() => dispatch('pick')}>
      {#if envelope}
        <span class="h-5 w-5 rounded-full" style="background:{envelope.color}" aria-hidden="true"></span>{envelope.name}
      {:else}
        <span class="flex h-5 w-5 items-center justify-center rounded-full bg-label-2/30" aria-hidden="true"><Icon name="plus" size={13} strokeWidth={2.6} /></span>Choose envelope
      {/if}
      <Icon name="chevron-down" size={14} strokeWidth={2.4} />
    </button>
    {#if reason}<span class="text-[13px] text-label-2">{reason}</span>{/if}
  </div>

  {#if capture.hint}
    <p class="rounded-[12px] bg-warning/15 px-3 py-2 text-[13px] text-label">{HINT_TEXT[capture.hint]}</p>
  {/if}

  {#each duplicates as d (d.id)}
    <div class="flex items-center justify-between gap-3 rounded-[12px] bg-fill px-3 py-2 text-[13px]">
      <span class="text-label-2">Also seen: {d.sourceLabel} · {when(d)}</span>
      <button type="button" class="flex-none font-semibold text-tint" on:click={() => dispatch('notDuplicate', d.id)}>Not a duplicate</button>
    </div>
  {/each}
</div>

<style>
  .stamp {
    position: absolute;
    top: 18px;
    padding: 2px 10px;
    border: 3px solid currentColor;
    border-radius: 10px;
    font-size: 20px;
    font-weight: 800;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    pointer-events: none;
  }

  .stamp.approve {
    right: 18px;
    color: rgb(var(--color-success));
    transform: rotate(12deg);
  }

  .stamp.dismiss {
    left: 18px;
    color: rgb(var(--color-danger));
    transform: rotate(-12deg);
  }
</style>
