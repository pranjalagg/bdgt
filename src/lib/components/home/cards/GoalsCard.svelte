<script lang="ts">
  import { base } from '$app/paths';
  import { goalStatuses } from '$lib/stores/goalsStore';
  import GoalCard from '$lib/components/shared/GoalCard.svelte';
  import SectionHeading from '$lib/components/ui/SectionHeading.svelte';
</script>

<section aria-labelledby="home-goals">
  <SectionHeading strong="Savings" soft="goals" id="home-goals">
    <a slot="action" href="{base}/budget#goals" class="text-[15px] font-medium text-tint">See all</a>
  </SectionHeading>
  {#if $goalStatuses.length}
    <div class="grid gap-2">{#each $goalStatuses as status}<GoalCard {status} />{/each}</div>
  {:else}
    <p class="text-[15px] text-label-2">No goals yet. Add one from Budget.</p>
  {/if}
</section>
