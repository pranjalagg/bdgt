<script lang="ts">
  import { base } from '$app/paths';
  import Icon from '$lib/components/ui/Icon.svelte';
  import IconMark from '$lib/components/ui/IconMark.svelte';
</script>

<a href="{base}/insights/investments" class="row row-tap focus:outline-none focus-visible:ring-2 focus-visible:ring-tint">
  <IconMark icon="trend" />
  <span class="min-w-0 flex-1">
    <span class="t-row block">Investments</span>
    <span class="block text-[13px] text-label-2">Holdings, purchases and sales</span>
  </span>
  <span class="text-label-2/60" aria-hidden="true"><Icon name="chevron-right" size={18} /></span>
</a>
