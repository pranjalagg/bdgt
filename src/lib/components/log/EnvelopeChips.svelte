<script lang="ts">
  import { tick } from 'svelte';
  import Icon from '$lib/components/ui/Icon.svelte';
  import { envelopeIcon } from '$lib/ui/icons';
  import { haptic } from '$lib/ui/haptics';
  import type { Bucket } from '$lib/types';

  // Where the expense goes: a sideways row of envelopes, each saying what
  // is left now, or what would be left after this spend (green) or how far
  // over it goes (red). Arrow keys move between them.

  type Chip = { bucket: Bucket; text: string; tone: 'plain' | 'good' | 'bad' };
  export let chips: Chip[];
  export let selected: string | null = null;

  let row: HTMLElement;

  export async function move(delta: number) {
    if (!chips.length) return;
    const i = chips.findIndex((c) => c.bucket.id === selected);
    const next = i < 0 ? 0 : (i + delta + chips.length) % chips.length;
    pick(chips[next].bucket.id, false);
    await tick();
    row?.querySelector<HTMLElement>('[aria-checked="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  function pick(id: string, withHaptic = true) {
    selected = id;
    if (withHaptic) haptic('selection');
  }

  async function onKeydown(e: KeyboardEvent) {
    const delta = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!delta) return;
    e.preventDefault();
    e.stopPropagation();
    await move(delta);
    row?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus();
  }
</script>

<!-- svelte-ignore a11y-interactive-supports-focus -->
<div bind:this={row} class="scroll-row -mx-4 gap-2 px-4 py-1 sm:-mx-6 sm:px-6" role="radiogroup" aria-label="Envelopes" on:keydown={onKeydown}>
  {#each chips as c (c.bucket.id)}
    {@const on = c.bucket.id === selected}
    <button
      type="button"
      role="radio"
      aria-checked={on}
      tabindex={on || (!selected && c === chips[0]) ? 0 : -1}
      class="chip-env pressable flex flex-none items-center gap-2.5 rounded-[16px] py-2 pl-2 pr-3.5 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-tint
             {on ? 'bg-tint/10 shadow-[inset_0_0_0_2px_rgb(var(--c-tint))] dark:bg-tint/20' : 'bg-fill'}"
      on:click={() => pick(c.bucket.id)}
    >
      <span class="flex h-8 w-8 flex-none items-center justify-center rounded-[10px] text-white" style="background:{c.bucket.color}">
        <Icon name={envelopeIcon(c.bucket.name, c.bucket.isSystem)} size={17} strokeWidth={2.2} />
      </span>
      <span class="min-w-0">
        <span class="block whitespace-nowrap text-[15px] font-medium text-label">{c.bucket.name}</span>
        <span class="money amt block whitespace-nowrap text-[12px] font-medium {c.tone === 'good' ? 'text-success' : c.tone === 'bad' ? 'text-danger' : 'text-label-2'}">{c.text}</span>
      </span>
    </button>
  {/each}
</div>
