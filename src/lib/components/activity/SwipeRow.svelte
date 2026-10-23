<script lang="ts">
  import { swipeActions } from '$lib/ui/swipe';
  import Icon from '$lib/components/ui/Icon.svelte';

  // A list row that swipes: left shows Delete, right shows Move. The sheet
  // the row opens has both actions too, for anyone who doesn't swipe.

  export let onDelete: () => void;
  export let onMove: () => void;

  let offset = 0;
  let reset = 0;

  function act(fn: () => void) {
    reset += 1;
    fn();
  }
</script>

<div class="relative overflow-hidden">
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
  <div class="relative bg-surface" use:swipeActions={{ onDelete, onMove, reset }} on:swipe={(e) => (offset = e.detail)}>
    <slot />
  </div>
</div>

<style>
  /* iOS's high-contrast red: white text on it measures 5.38:1. */
  .del {
    background: #d70015;
  }
</style>
