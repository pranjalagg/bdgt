<script lang="ts">
  import Icon from '$lib/components/ui/Icon.svelte';
  import type { IconName } from '$lib/ui/icons';

  // A trend in one card: a figure and a small chart. Opens the full chart.

  export let href: string;
  export let icon: IconName;
  export let color: string;
  export let title: string;
  export let value: string;
  export let sub: string;
</script>

<a {href} class="card grid gap-2.5 px-4 py-3.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-tint">
  <span class="flex items-center gap-2 text-[15px] font-semibold text-label">
    <span class="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-[8px] text-white" style="background:{color}" aria-hidden="true"><Icon name={icon} size={15} strokeWidth={2.2} /></span>
    {title}
    <span class="ml-auto text-label-2/60" aria-hidden="true"><Icon name="chevron-right" size={16} /></span>
  </span>
  <span class="flex items-end justify-between gap-3">
    <span class="min-w-0">
      <span class="figure amt block text-[26px] leading-tight text-label">{value}</span>
      <span class="block text-[13px] text-label-2">{sub}</span>
    </span>
    <!-- The small chart steps aside on the narrowest phones. -->
    <span class="hidden min-[360px]:block"><slot /></span>
  </span>
</a>
