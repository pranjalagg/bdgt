<script lang="ts">
  // A section's heading in two weights, as in the owner's references:
  // "Spending October", "Everyday envelopes". An action (See all) can sit
  // at its right.

  export let strong: string;
  export let soft = '';
  export let id: string | undefined = undefined;
</script>

<div class="flex items-baseline justify-between gap-3 pb-3">
  <h2 {id} class="t-heading min-w-0">{strong}{#if soft}{' '}<span class="soft">{soft}</span>{/if}</h2>
  <slot name="action" />
</div>
