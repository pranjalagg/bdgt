<script lang="ts">
  import SectionHeading from '$lib/components/ui/SectionHeading.svelte';
  import IconMark from '$lib/components/ui/IconMark.svelte';
  import { goalStatuses } from '$lib/stores/goalsStore';
  import { openModal } from '$lib/stores/uiStore';
  import GoalCard from '$lib/components/shared/GoalCard.svelte';

  // Savings goals, with the button to add one.
</script>

<section id="goals" aria-labelledby="goals-title">
  <SectionHeading strong="Savings" soft="goals" id="goals-title">
    <svelte:fragment slot="action">
      {#if $goalStatuses.length > 0}
        <button type="button" class="text-[15px] font-medium text-tint" on:click={() => openModal('add-goal')}>Add goal</button>
      {/if}
    </svelte:fragment>
  </SectionHeading>
  {#if $goalStatuses.length === 0}
    <button type="button" class="row row-tap w-full text-[15px] font-medium text-tint" on:click={() => openModal('add-goal')}>
      <IconMark icon="plus" />Create your first savings goal
    </button>
  {:else}
    <div class="list lg:grid lg:grid-cols-2 lg:gap-x-8">
      {#each $goalStatuses as status}
        <GoalCard {status} />
      {/each}
    </div>
  {/if}
</section>
