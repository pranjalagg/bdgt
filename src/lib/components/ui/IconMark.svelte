<script lang="ts">
  import Icon from './Icon.svelte';
  import type { IconName } from '$lib/ui/icons';

  // How a row says what it is: an outline icon in a neutral circle. An
  // envelope's own colour, when given, is a small dot on the circle's edge
  // (its colour never fills the circle).

  export let icon: IconName;
  export let size = 44;
  export let dot: string | null = null;
</script>

<span class="mark relative flex flex-none items-center justify-center rounded-full bg-fill text-label" style:width="{size}px" style:height="{size}px" aria-hidden="true">
  <Icon name={icon} size={Math.round(size * 0.45)} strokeWidth={1.75} />
  {#if dot}<span class="dot absolute bottom-0 right-0 rounded-full" style:background={dot}></span>{/if}
</span>

<style>
  /* The dot sits over the circle's edge, ringed in whatever is behind it
     (a card sets --mark-ring to its own colour). */
  .dot {
    width: 12px;
    height: 12px;
    box-shadow: 0 0 0 2.5px var(--mark-ring, rgb(var(--c-page)));
  }
</style>
