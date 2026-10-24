<script lang="ts">
  import { base } from '$app/paths';
  import { upcomingRecurring } from '$lib/stores/recurringStore';
  import RecurringRow from '$lib/components/budget/RecurringRow.svelte';
  import SectionHeading from '$lib/components/ui/SectionHeading.svelte';
</script>

<section aria-labelledby="home-bills">
  <SectionHeading strong="Upcoming" soft="bills" id="home-bills">
    <a slot="action" href="{base}/budget/bills" class="text-[15px] font-medium text-tint">See all</a>
  </SectionHeading>
  {#if $upcomingRecurring.length}
    <div class="list">{#each $upcomingRecurring as item (item.id)}<RecurringRow {item} />{/each}</div>
  {:else}
    <p class="text-[15px] text-label-2">Nothing due in the next 7 days.</p>
  {/if}
</section>
