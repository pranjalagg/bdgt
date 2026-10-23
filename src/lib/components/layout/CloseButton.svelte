<script lang="ts">
  import { get } from 'svelte/store';
  import { goto } from '$app/navigation';
  import { base } from '$app/paths';
  import { historyDepth, closeTarget } from '$lib/ui/history';

  // Close on a page that slides up (Review, Settings): back to where it was
  // opened from, or its tab when it was opened directly.

  function close() {
    const target = closeTarget(get(historyDepth), location.pathname.slice(base.length) || '/');
    if (target === 'back') history.back();
    else void goto(target === '/' ? base || '/' : base + target, { replaceState: true });
  }
</script>

<button type="button" class="h-10 rounded-full px-1.5 text-[17px] text-tint focus:outline-none focus-visible:ring-2 focus-visible:ring-tint" on:click={close}>Close</button>
