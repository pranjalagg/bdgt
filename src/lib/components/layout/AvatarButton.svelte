<script lang="ts">
  import { base } from '$app/paths';
  import { syncAttention } from '$lib/sync/browser';
  import Icon from '$lib/components/ui/Icon.svelte';

  // Settings live behind this button on Home, as an account button does in
  // iOS apps. A dot shows when sync needs the person.
  const attention = syncAttention();
</script>

<a
  href="{base}/settings"
  class="relative flex h-10 w-10 items-center justify-center rounded-full bg-fill text-label focus:outline-none focus-visible:ring-2 focus-visible:ring-tint focus-visible:ring-offset-2"
  aria-label={$attention ? 'Settings (sync needs attention)' : 'Settings'}
>
  <Icon name="settings" size={20} />
  {#if $attention}
    <span class="absolute right-0 top-0 h-2.5 w-2.5 rounded-full bg-danger ring-2 ring-page" aria-hidden="true"></span>
  {/if}
</a>
