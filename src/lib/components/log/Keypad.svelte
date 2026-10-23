<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import Icon from '$lib/components/ui/Icon.svelte';
  import { haptic } from '$lib/ui/haptics';
  import type { KeypadKey } from '$lib/ui/keypad';

  // Digits, a point, the four operators and delete, as on a calculator.

  const dispatch = createEventDispatcher<{ key: KeypadKey }>();

  const ROWS: KeypadKey[][] = [
    ['1', '2', '3', '÷'],
    ['4', '5', '6', '×'],
    ['7', '8', '9', '−'],
    ['.', '0', 'back', '+'],
  ];
  const NAMES: Partial<Record<KeypadKey, string>> = { '÷': 'Divide', '×': 'Multiply', '−': 'Minus', '+': 'Plus', '.': 'Point', back: 'Delete' };
  const isOp = (k: KeypadKey) => k === '÷' || k === '×' || k === '−' || k === '+';

  function press(k: KeypadKey) {
    haptic('light');
    dispatch('key', k);
  }
</script>

<div class="keypad grid grid-cols-4 gap-2" role="group" aria-label="Keypad">
  {#each ROWS as row}
    {#each row as k}
      <button
        type="button"
        data-key={k}
        class="pressable flex h-[52px] items-center justify-center rounded-[14px] text-[26px] focus:outline-none focus-visible:ring-2 focus-visible:ring-tint
               {isOp(k) ? 'bg-tint/10 font-medium text-tint dark:bg-tint/20' : 'bg-fill font-normal text-label'}"
        aria-label={NAMES[k]}
        on:click={() => press(k)}
      >
        {#if k === 'back'}<Icon name="delete" size={24} />{:else}{k}{/if}
      </button>
    {/each}
  {/each}
</div>
