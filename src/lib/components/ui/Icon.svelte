<script lang="ts">
  import { ICONS, type IconName } from '$lib/ui/icons';

  export let name: IconName;
  export let size = 22;
  export let strokeWidth = 2;
  let className = '';
  export { className as class };
</script>

<svg
  class={className}
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width={strokeWidth}
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true">{@html ICONS[name]}</svg>
