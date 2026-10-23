<script lang="ts">
  import { base } from '$app/paths';
  import { upcomingRecurring } from '$lib/stores/recurringStore';
  import RecurringRow from '$lib/components/budget/RecurringRow.svelte';
</script>

<section aria-labelledby="home-bills">
  <div class="flex items-baseline justify-between px-1 pb-2.5 pt-1">
    <h2 id="home-bills" class="text-[21px] font-bold tracking-tight text-label">Upcoming bills</h2>
    <a href="{base}/budget/bills" class="text-[15px] font-medium text-tint">See all</a>
  </div>
  {#if $upcomingRecurring.length}
    <div class="group">{#each $upcomingRecurring as item (item.id)}<RecurringRow {item} />{/each}</div>
  {:else}
    <div class="card px-4 py-4 text-[15px] text-label-2">Nothing due in the next 7 days.</div>
  {/if}
</section>
