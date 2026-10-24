<script lang="ts">
  import { base } from '$app/paths';
  import Icon from '$lib/components/ui/Icon.svelte';
</script>

<a href="{base}/insights/investments" class="card flex items-center gap-3 px-4 py-3.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-tint">
  <span class="flex h-9 w-9 flex-none items-center justify-center rounded-[11px] bg-[#3b82f6] text-white" aria-hidden="true"><Icon name="trend" size={19} strokeWidth={2.2} /></span>
  <span class="min-w-0 flex-1">
    <span class="block text-[16px] font-medium text-label">Investments</span>
    <span class="block text-[13px] text-label-2">Holdings, purchases and sales</span>
  </span>
  <span class="text-label-2/60" aria-hidden="true"><Icon name="chevron-right" size={18} /></span>
</a>
