<script lang="ts">
  import { swipeActions } from '$lib/ui/swipe';
  import Icon from '$lib/components/ui/Icon.svelte';

  // A list row that swipes: left shows Delete, right shows Move. With a
  // mouse, hovering (or tabbing into) the row shows the same two as buttons.
  // The sheet the row opens has both actions too.

  export let onDelete: () => void;
  export let onMove: () => void;
  // Names the row's hover buttons ("Delete Starbucks").
  export let label: string;

  let offset = 0;
  let reset = 0;

  function act(fn: () => void) {
    reset += 1;
    fn();
  }
</script>

<div class="relative -mx-5 overflow-hidden sm:-mx-6">
  {#if offset > 0}
    <div class="absolute inset-y-0 left-0 flex items-center justify-start bg-tint text-white" style:width="{offset}px">
      <button type="button" tabindex="-1" class="flex h-full min-w-[88px] flex-col items-center justify-center gap-0.5 text-[13px] font-semibold" on:click={() => act(onMove)}>
        <Icon name="move" size={20} />Move
      </button>
    </div>
  {:else if offset < 0}
    <div class="del absolute inset-y-0 right-0 flex items-center justify-end text-white" style:width="{-offset}px">
      <button type="button" tabindex="-1" class="flex h-full min-w-[88px] flex-col items-center justify-center gap-0.5 text-[13px] font-semibold" on:click={() => act(onDelete)}>
        <Icon name="trash" size={20} />Delete
      </button>
    </div>
  {/if}
  <div class="face relative bg-page px-5 sm:px-6" use:swipeActions={{ onDelete, onMove, reset }} on:swipe={(e) => (offset = e.detail)}>
    <slot />
    <div class="hover-actions absolute inset-y-0 right-0 items-center gap-1 pl-10 pr-3">
      <button type="button" class="btn-icon" aria-label="Move {label}" on:click|stopPropagation={onMove}><Icon name="move" size={18} /></button>
      <button type="button" class="btn-icon !text-danger" aria-label="Delete {label}" on:click|stopPropagation={onDelete}><Icon name="trash" size={18} /></button>
    </div>
  </div>
</div>

<style>
  .hover-actions {
    display: none;
    background: linear-gradient(to right, rgb(var(--c-page) / 0), rgb(var(--c-page)) 32px);
  }

  /* Matches the row's own hover tint, which sits over the surface. */
  .face:hover .hover-actions {
    background:
      linear-gradient(to right, transparent, rgb(var(--c-fill) / var(--fill-alpha)) 32px),
      linear-gradient(to right, rgb(var(--c-page) / 0), rgb(var(--c-page)) 32px);
  }

  /* Only where there is a pointer that hovers; touch swipes instead. */
  @media (hover: hover) {
    .hover-actions {
      display: flex;
      opacity: 0;
      pointer-events: none;
      transition: opacity 150ms ease-out;
    }

    .face:hover .hover-actions,
    .face:focus-within .hover-actions {
      opacity: 1;
      pointer-events: auto;
    }
  }

  /* iOS's high-contrast red: white text on it measures 5.38:1. */
  .del {
    background: #d70015;
  }
</style>
