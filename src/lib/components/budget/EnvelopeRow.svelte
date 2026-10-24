<script lang="ts">
  import type { BucketStatus } from '$lib/types';
  import EnvelopeRowBody from './EnvelopeRowBody.svelte';

  // One envelope in Budget's open list: what was spent of what was
  // assigned, and what is left (or over, in red). Savings envelopes show
  // what was set aside this month instead. A link when it opens a page.

  export let status: BucketStatus;
  export let href: string | null = null;
  export let onClick: (() => void) | null = null;

  const cls = 'row row-tap focus:outline-none focus-visible:ring-2 focus-visible:ring-tint';
</script>

{#if href}
  <a {href} class={cls}><EnvelopeRowBody {status} /></a>
{:else}
  <button type="button" class={cls} on:click={() => onClick?.()}><EnvelopeRowBody {status} /></button>
{/if}
