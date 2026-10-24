<script lang="ts">
  import { createEventDispatcher, tick } from 'svelte';
  import DeckCard from './DeckCard.svelte';
  import Icon from '$lib/components/ui/Icon.svelte';
  import { buckets, transactions } from '$lib/stores/budgetStore';
  import { suggestions, duplicatesOf } from '$lib/stores/captureStore';
  import { baseCurrency } from '$lib/stores/currencyStore';
  import { rememberedRate } from '$lib/currency/conversion';
  import { baseAmount } from '$lib/capture/queue';
  import { formatCurrency } from '$lib/utils/currency';
  import { deckOutcome, swipeDirection } from '$lib/ui/swipe';
  import { haptic } from '$lib/ui/haptics';
  import type { Capture } from '$lib/types';

  // Payments to review as a stack of cards. Drag the top one right to
  // approve or left to dismiss, or use the buttons under the stack.

  export let captures: Capture[];

  const dispatch = createEventDispatcher<{ approve: Capture; dismiss: Capture; dismissAsk: Capture; edit: Capture; pick: Capture; notDuplicate: string }>();

  $: bucketById = new Map($buckets.map((b) => [b.id, b]));
  $: visible = captures.slice(0, 3);
  $: top = visible[0];

  const rateOf = (c: Capture) => rememberedRate($transactions, c.currency, $baseCurrency);
  // What approving needs first: an envelope, or a rate for another currency.
  export function need(c: Capture): 'envelope' | 'rate' | null {
    if (!$suggestions.get(c.id)) return 'envelope';
    if (c.currency !== $baseCurrency && !rateOf(c)) return 'rate';
    return null;
  }
  function estimate(c: Capture): string | null {
    if (c.currency === $baseCurrency) return null;
    const amount = baseAmount(c, $baseCurrency, rateOf(c));
    return amount === null ? 'Rate needed' : `About ${formatCurrency(amount)}`;
  }
  function reason(c: Capture): string {
    const s = $suggestions.get(c.id);
    if (!s) return '';
    const name = bucketById.get(s.bucketId)?.name ?? '';
    return s.reason === 'rule' ? `Last filed under ${name}` : `Usually ${name}`;
  }
  $: topNeed = top ? need(top) : null;
  $: approveLabel = topNeed === 'envelope' ? 'Choose envelope' : topNeed === 'rate' ? 'Add rate' : 'Approve';

  // The top card's drag.
  let x = 0;
  let y = 0;
  let dragging = false;
  let flying = false;
  let start: { x: number; y: number; id: number } | null = null;
  let dir: 'horizontal' | 'vertical' | null = null;
  let lastX = 0;
  let lastT = 0;
  let velocity = 0;
  let width = 360;
  let topId: string | undefined;

  // A new top card starts centred.
  $: if (top?.id !== topId) {
    topId = top?.id;
    x = 0;
    y = 0;
    flying = false;
  }

  const reduced = () => document.documentElement.classList.contains('rm');

  function down(e: PointerEvent) {
    if (flying || (e.pointerType === 'mouse' && e.button !== 0)) return;
    if ((e.target as HTMLElement).closest('button')) return;
    start = { x: e.clientX, y: e.clientY, id: e.pointerId };
    dir = null;
    lastX = e.clientX;
    lastT = e.timeStamp;
    velocity = 0;
  }

  function move(e: PointerEvent) {
    if (!start || e.pointerId !== start.id) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (!dir) {
      dir = swipeDirection(dx, dy);
      if (!dir) return;
      if (dir === 'vertical') {
        start = null;
        return;
      }
      dragging = true;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    }
    const dt = e.timeStamp - lastT;
    if (dt > 0) velocity = (e.clientX - lastX) / dt;
    lastX = e.clientX;
    lastT = e.timeStamp;
    const crossed = Math.abs(x) <= 110 && Math.abs(dx) > 110;
    x = dx;
    y = dy * 0.25;
    if (crossed) haptic('light');
  }

  function up(e: PointerEvent) {
    if (!start || e.pointerId !== start.id) return;
    start = null;
    if (!dragging) return;
    dragging = false;
    const outcome = e.type === 'pointercancel' ? 'back' : deckOutcome(x, velocity);
    if (outcome === 'back') {
      x = 0;
      y = 0;
    } else void decide(outcome);
  }

  // Approve or dismiss the top card: it flies off, then the decision is
  // made. Approving one that needs an envelope or a rate springs back and
  // asks for it instead.
  export async function decide(outcome: 'approve' | 'dismiss') {
    const c = top;
    if (!c || flying) return;
    if (outcome === 'approve' && need(c)) {
      x = 0;
      y = 0;
      dispatch('approve', c);
      return;
    }
    flying = true;
    x = (outcome === 'approve' ? 1 : -1) * width * 1.4;
    await new Promise((r) => setTimeout(r, reduced() ? 0 : 200));
    dispatch(outcome, c);
    await tick();
    // Still on top: the decision failed or was refused, so bring it back.
    if (top?.id === c.id) {
      flying = false;
      x = 0;
      y = 0;
    }
  }

  $: pull = Math.max(-1, Math.min(1, x / 110));
</script>

{#if top}
  <div class="deck relative mx-auto w-full max-w-md" bind:clientWidth={width}>
    <div class="relative h-[min(380px,52vh)] min-h-[330px]">
      {#each [...visible].reverse() as c (c.id)}
        {@const i = visible.indexOf(c)}
        {#if i === 0}
          <div
            class="deck-card card absolute inset-0 touch-pan-y select-none"
            class:dragging
            class:flying
            data-top
            role="group"
            aria-label="{c.merchant}. Drag right to approve, left to dismiss, or use the buttons below."
            style:transform="translate({x}px, {y}px) rotate({x / 22}deg)"
            style:opacity={flying && reduced() ? 0 : 1}
            on:pointerdown={down}
            on:pointermove={move}
            on:pointerup={up}
            on:pointercancel={up}
          >
            <DeckCard capture={c} envelope={bucketById.get($suggestions.get(c.id)?.bucketId ?? '')} reason={reason(c)} estimate={estimate(c)} duplicates={$duplicatesOf.get(c.id) ?? []} {pull} on:pick={() => dispatch('pick', c)} on:notDuplicate={(e) => dispatch('notDuplicate', e.detail)} />
          </div>
        {:else}
          <!-- The cards underneath: solid, so nothing shows through; only the
               next one carries its content, ready to move up. -->
          <div class="deck-card card absolute inset-0 overflow-hidden" class:dim={i === 2} style:transform="translateY({i * 14}px) scale({1 - i * 0.05})" aria-hidden="true" inert>
            {#if i === 1}<DeckCard capture={c} envelope={bucketById.get($suggestions.get(c.id)?.bucketId ?? '')} estimate={estimate(c)} />{/if}
          </div>
        {/if}
      {/each}
    </div>

    <div class="mt-9 flex items-start justify-center gap-7">
      <div class="grid justify-items-center gap-1.5">
        <button type="button" class="action pressable bg-fill text-danger" aria-label="Dismiss" on:click={() => dispatch('dismissAsk', top)}><Icon name="x" size={28} strokeWidth={2.4} /></button>
        <span class="text-[13px] font-medium text-label-2" aria-hidden="true">Dismiss</span>
      </div>
      <div class="grid justify-items-center gap-1.5 pt-2">
        <button type="button" class="action small pressable bg-fill text-label" aria-label="Edit" on:click={() => dispatch('edit', top)}><Icon name="pencil" size={20} /></button>
        <span class="text-[13px] font-medium text-label-2" aria-hidden="true">Edit</span>
      </div>
      <div class="grid justify-items-center gap-1.5">
        <button type="button" class="action pressable bg-tint text-white" aria-label={approveLabel} on:click={() => decide('approve')}><Icon name={topNeed ? 'chevron-right' : 'check'} size={28} strokeWidth={2.4} /></button>
        <span class="text-[13px] font-medium text-label-2" aria-hidden="true">{approveLabel}</span>
      </div>
    </div>
  </div>
{:else}
  <div class="grid justify-items-center gap-3 py-16 text-center">
    <svg class="done h-20 w-20 text-success" viewBox="0 0 80 80" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <circle cx="40" cy="40" r="35" class="ring" />
      <path d="M25 41l10 10 20-22" class="tick" />
    </svg>
    <p class="text-[22px] font-bold tracking-tight text-label">All caught up</p>
    <p class="max-w-[260px] text-[15px] text-label-2">New payments from your phone show up here.</p>
  </div>
{/if}

<style>
  .deck-card {
    border-radius: 26px;
    transition: transform var(--ms-smooth, 320ms) var(--ease-smooth, ease-out), opacity 200ms ease-out;
    will-change: transform;
  }

  .deck-card.dim {
    filter: brightness(0.96);
  }

  .deck-card.dragging {
    transition: none;
  }

  .deck-card.flying {
    transition: transform 200ms ease-in, opacity 200ms ease-in;
  }

  /* Under reduced motion the cards only fade: the top one out, the next in. */
  @media (prefers-reduced-motion: reduce) {
    .deck-card,
    .deck-card.flying {
      transition: opacity 200ms ease-out;
    }
  }

  .action {
    display: flex;
    height: 64px;
    width: 64px;
    align-items: center;
    justify-content: center;
    border-radius: 999px;
  }

  .action.small {
    height: 48px;
    width: 48px;
  }

  .action:focus-visible {
    outline: 2px solid rgb(var(--c-tint));
    outline-offset: 3px;
  }

  @media (prefers-reduced-motion: no-preference) {
    .done .ring {
      stroke-dasharray: 220;
      stroke-dashoffset: 220;
      animation: draw 600ms ease-out forwards;
    }

    .done .tick {
      stroke-dasharray: 50;
      stroke-dashoffset: 50;
      animation: draw 350ms 450ms ease-out forwards;
    }
  }

  @keyframes draw {
    to {
      stroke-dashoffset: 0;
    }
  }
</style>
