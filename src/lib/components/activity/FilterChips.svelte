<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import { UNSORTED_BUCKET_ID } from '$lib/utils/unsorted';
  import { haptic } from '$lib/ui/haptics';
  import type { Bucket } from '$lib/types';

  // Narrow the list: everything, what was added for you, what lost its
  // envelope, or one envelope. Tapping the chosen chip again shows all.

  export let selected: string;
  export let envelopes: Bucket[];
  // Unsorted shows while anything is in it, or while a link has chosen it.
  export let hasUnsorted = false;

  const dispatch = createEventDispatcher<{ change: string }>();
  let row: HTMLElement;

  $: options = [
    { id: '', name: 'All', color: null as string | null },
    { id: 'auto', name: 'Auto', color: null },
    ...(hasUnsorted || selected === UNSORTED_BUCKET_ID ? [{ id: UNSORTED_BUCKET_ID, name: 'Unsorted', color: null }] : []),
    ...envelopes.map((b) => ({ id: b.id, name: b.name, color: b.color as string | null })),
  ];

  function pick(id: string) {
    const next = selected === id && id !== '' ? '' : id;
    haptic('selection');
    dispatch('change', next);
  }

  // Arriving with a chip chosen (a link from Home), bring it into view.
  onMount(() => row?.querySelector('[aria-pressed="true"]')?.scrollIntoView({ inline: 'center', block: 'nearest' }));
</script>

<div bind:this={row} class="scroll-row -mx-4 gap-2 px-4 py-1 sm:-mx-6 sm:px-6 md:flex-wrap md:overflow-visible" role="group" aria-label="Filter">
  {#each options as o (o.id)}
    <button type="button" class="chip" aria-pressed={selected === o.id} on:click={() => pick(o.id)}>
      {#if o.color}<span class="h-2.5 w-2.5 flex-none rounded-full" style="background:{o.color}" aria-hidden="true"></span>{/if}
      {o.name}
    </button>
  {/each}
</div>
