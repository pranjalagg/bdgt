<script lang="ts">
  import { closeModalPage } from '$lib/ui/goBack';

  // Close on a page that slides up (Review, Settings): back past every page
  // inside it to where it was opened from, or its tab when it was opened
  // directly.

  export let label = 'Close';
</script>

<button type="button" class="h-10 rounded-full px-1.5 text-[17px] text-tint focus:outline-none focus-visible:ring-2 focus-visible:ring-tint" on:click={closeModalPage}>{label}</button>
