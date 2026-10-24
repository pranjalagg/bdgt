<script lang="ts">
  import Modal from '$lib/components/shared/Modal.svelte';
  import { closeModal } from '$lib/stores/uiStore';
  import { currencySymbol, formatCurrency } from '$lib/utils/currency';
  import { haptic } from '$lib/ui/haptics';

  // What counts as big: the same rule as always, an envelope whose spending
  // this month reaches the amount.

  export let threshold: number; // cents

  const PRESETS = [5000, 10000, 25000, 50000, 100000];
  let text = String(threshold / 100);
  let lastSeen = threshold;
  $: if (threshold !== lastSeen) {
    lastSeen = threshold;
    text = String(threshold / 100);
  }

  function typed() {
    const n = parseFloat(text.replace(/[^0-9.]/g, ''));
    if (Number.isFinite(n) && n > 0) threshold = lastSeen = Math.round(n * 100);
  }
  function preset(v: number) {
    threshold = v;
    haptic('selection');
  }
</script>

<Modal id="threshold" title="Big purchases">
  <div class="grid gap-4">
    <p class="text-[15px] text-label-2">Envelopes whose spending this month reaches this amount count as big.</p>
    <label class="flex items-center justify-between gap-3 rounded-[14px] bg-surface px-4 py-2 dark:bg-raised">
      <span class="text-[16px] text-label">Big means</span>
      <span class="flex h-10 w-36 items-center gap-1 rounded-[12px] bg-fill px-3 focus-within:ring-2 focus-within:ring-tint">
        <span class="text-[16px] text-label-2">{currencySymbol()}</span>
        <input type="text" inputmode="decimal" aria-label="Amount that counts as big" bind:value={text} on:input={typed} on:focus={(e) => e.currentTarget.select()} class="money w-full min-w-0 bg-transparent text-right text-[17px] font-semibold text-label focus:outline-none" />
      </span>
    </label>
    <div class="flex flex-wrap gap-2" role="group" aria-label="Presets">
      {#each PRESETS as v}
        <button type="button" class="chip" aria-pressed={v === threshold} on:click={() => preset(v)}>{formatCurrency(v).replace(/\.00$/, '')}</button>
      {/each}
    </div>
    <button type="button" class="btn-primary w-full" on:click={() => closeModal('threshold')}>Done</button>
  </div>
</Modal>
