<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import Icon from '$lib/components/ui/Icon.svelte';
  import { haptic } from '$lib/ui/haptics';
  import type { KeypadKey } from '$lib/ui/keypad';

  // An iOS-style number pad: plain digits that light up when pressed, and
  // the four operators in a slim row above them for sums like 12 + 8.5.

  const dispatch = createEventDispatcher<{ key: KeypadKey }>();

  const OPS: KeypadKey[] = ['+', '−', '×', '÷'];
  const DIGITS: KeypadKey[] = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'back'];
  const NAMES: Partial<Record<KeypadKey, string>> = { '÷': 'Divide', '×': 'Multiply', '−': 'Minus', '+': 'Plus', '.': 'Point', back: 'Delete' };

  function press(k: KeypadKey) {
    haptic('light');
    dispatch('key', k);
  }
</script>

<div class="keypad grid gap-2">
  <div class="flex justify-center gap-2" role="group" aria-label="Operators">
    {#each OPS as k}
      <button type="button" data-key={k} class="op h-9 w-[64px] rounded-full text-[20px] font-medium text-tint focus:outline-none focus-visible:ring-2 focus-visible:ring-tint" aria-label={NAMES[k]} on:click={() => press(k)}>{k}</button>
    {/each}
  </div>
  <div class="grid grid-cols-3 gap-x-1.5 gap-y-0.5" role="group" aria-label="Keypad">
    {#each DIGITS as k}
      <button type="button" data-key={k} class="key flex h-[54px] items-center justify-center rounded-[14px] text-label focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-tint" aria-label={NAMES[k]} on:click={() => press(k)}>
        {#if k === 'back'}<Icon name="delete" size={26} strokeWidth={1.8} />{:else}{k}{/if}
      </button>
    {/each}
  </div>
</div>

<style>
  .key {
    font-size: 28px;
    font-weight: 400;
    font-variant-numeric: tabular-nums;
    -webkit-tap-highlight-color: transparent;
    transition: background-color 120ms ease-out;
  }

  .op {
    background: rgb(var(--c-fill) / var(--fill-alpha));
    -webkit-tap-highlight-color: transparent;
    transition: background-color 120ms ease-out;
  }

  /* A soft highlight while pressed, as on the iOS number pad. */
  .key:active {
    background: rgb(var(--c-fill) / var(--fill-alpha));
  }

  .op:active {
    background: rgb(var(--c-tint) / 0.18);
  }

  @media (hover: hover) {
    .key:hover {
      background: rgb(var(--c-fill) / calc(var(--fill-alpha) * 0.6));
    }
  }
</style>
