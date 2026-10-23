<script lang="ts">
  import { goalStatuses } from '$lib/stores/goalsStore';
  import { openModal } from '$lib/stores/uiStore';
  import GoalCard from '$lib/components/shared/GoalCard.svelte';

  // Savings goals, with the button to add one.
</script>

<section id="goals" aria-labelledby="goals-title">
  <div class="flex items-baseline justify-between px-1 pb-2">
    <h2 id="goals-title" class="settings-label !p-0">Savings goals</h2>
    {#if $goalStatuses.length > 0}
      <button type="button" class="text-[15px] font-medium text-tint" on:click={() => openModal('add-goal')}>Add goal</button>
    {/if}
  </div>
  {#if $goalStatuses.length === 0}
    <button type="button" class="card w-full px-4 py-4 text-left text-[15px] font-medium text-tint" on:click={() => openModal('add-goal')}>
      Create your first savings goal
    </button>
  {:else}
    <div class="grid gap-1.5 lg:grid-cols-2">
      {#each $goalStatuses as status}
        <GoalCard {status} />
      {/each}
    </div>
  {/if}
</section>
