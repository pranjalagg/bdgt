<script lang="ts">
  import { base } from '$app/paths';
  import { goalStatuses } from '$lib/stores/goalsStore';
  import GoalCard from '$lib/components/shared/GoalCard.svelte';
</script>

<section aria-labelledby="home-goals">
  <div class="flex items-baseline justify-between px-1 pb-2.5 pt-1">
    <h2 id="home-goals" class="text-[21px] font-bold tracking-tight text-label">Savings goals</h2>
    <a href="{base}/budget#goals" class="text-[15px] font-medium text-tint">See all</a>
  </div>
  {#if $goalStatuses.length}
    <div class="grid gap-1.5">{#each $goalStatuses as status}<GoalCard {status} />{/each}</div>
  {:else}
    <div class="card px-4 py-4 text-[15px] text-label-2">No goals yet. Add one from Budget.</div>
  {/if}
</section>
