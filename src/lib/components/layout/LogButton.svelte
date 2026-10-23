<script lang="ts">
  import { openLog } from '$lib/stores/uiStore';
  import { haptic } from '$lib/ui/haptics';
  import Icon from '$lib/components/ui/Icon.svelte';

  // Logging a spend is the most frequent thing in the app, so on phones it
  // is a round button beside the tab bar on every screen.
</script>

<button
  type="button"
  class="log-button fixed z-40 flex items-center justify-center rounded-full bg-tint text-white md:hidden [view-transition-name:log-button]"
  aria-label="Add an expense"
  aria-keyshortcuts="Meta+K"
  on:click={() => {
    haptic('light');
    openLog();
  }}
>
  <Icon name="plus" size={28} strokeWidth={2.4} />
</button>

<style>
  .log-button {
    right: 14px;
    bottom: calc(14px + var(--safe-bottom));
    width: 64px;
    height: 64px;
    box-shadow: inset 0 0 0 0.5px rgba(255, 255, 255, 0.3), 0 10px 26px rgb(var(--c-tint) / 0.45);
    transition: transform 160ms ease-out;
  }

  @media (prefers-reduced-motion: no-preference) {
    .log-button:active {
      transform: scale(0.9);
    }
  }
</style>
