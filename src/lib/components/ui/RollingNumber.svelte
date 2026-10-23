<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { rollPlan } from '$lib/ui/roll';

  // A figure whose digits roll to their new value, the rightmost first.
  // When a digit or separator appears or goes, the figure rolls up from
  // zero. Under reduced motion the new value just appears. Screen readers
  // get the plain text.

  export let text: string;

  const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
  let prev: string | null = null;
  let chars: string[] = [];
  let version = 0;
  let settled = true;
  let mounted = false;

  $: void update(text);

  async function update(next: string) {
    const plan = rollPlan(prev, next);
    if (plan.reuse) chars = plan.chars;
    else {
      const animate = prev !== null && mounted;
      chars = plan.chars;
      version += 1;
      settled = !animate;
      if (animate) {
        await tick();
        requestAnimationFrame(() => requestAnimationFrame(() => (settled = true)));
      }
    }
    prev = next;
  }

  onMount(() => (mounted = true));
  const isDigit = (c: string) => c >= '0' && c <= '9';
</script>

<span class="roller" role="img" aria-label={text}>
  {#key version}
    {#each chars as c, i}
      {#if isDigit(c)}
        <span class="d" aria-hidden="true"
          ><span class="strip" style="transform: translateY(-{settled ? Number(c) * 10 : 0}%); transition-delay: {(chars.length - i) * 18}ms"
            >{#each DIGITS as n}<span>{n}</span>{/each}</span
          ></span
        >
      {:else}
        <span class="c" aria-hidden="true">{c}</span>
      {/if}
    {/each}
  {/key}
</span>

<style>
  .roller {
    display: inline-flex;
    align-items: flex-end;
    font-variant-numeric: tabular-nums;
  }

  .d {
    display: inline-block;
    height: 1em;
    overflow: hidden;
    line-height: 1;
  }

  .strip {
    display: flex;
    flex-direction: column;
    transition: transform var(--ms-snappy, 400ms) var(--ease-snappy, ease-out);
  }

  .strip > span,
  .c {
    display: block;
    height: 1em;
    line-height: 1;
  }

  :global(.rm) .strip {
    transition: none;
  }
</style>
